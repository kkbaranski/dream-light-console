use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use dlc_protocol::{EngineCommand, DMX_CHANNELS_PER_UNIVERSE};
use serde::{Deserialize, Serialize};

use crate::error::ApiError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct SetChannelBody {
    pub value: u8,
}

pub async fn set_channel(
    State(state): State<AppState>,
    Path((universe, channel)): Path<(u16, u16)>,
    Json(body): Json<SetChannelBody>,
) -> Result<StatusCode, ApiError> {
    if channel >= DMX_CHANNELS_PER_UNIVERSE as u16 {
        return Err(ApiError::bad_request("channel must be 0..511"));
    }

    state
        .engine_tx
        .try_send(EngineCommand::SetChannel {
            universe,
            channel,
            value: body.value,
        })
        .map_err(|_| ApiError::Internal("engine not running".to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
pub struct ReconnectResponse {
    pub dmx_output: String,
}

pub async fn reconnect(
    State(state): State<AppState>,
) -> Result<Json<ReconnectResponse>, ApiError> {
    let config = &state.config;

    // Release the current output so hardware resources (serial ports) are freed.
    // Wrap NullOutput in TapOutput so the relay task keeps its channel.
    let null_tap = dlc_engine::TapOutput::new(
        Box::new(dlc_engine::NullOutput),
        state.tap_tx.clone(),
    );
    state.engine.swap_output(Box::new(null_tap), "none");

    // Wait for the engine to pick up the swap and drop the old output (~2 ticks at 44Hz).
    tokio::time::sleep(std::time::Duration::from_millis(60)).await;

    let result: Result<(Box<dyn dlc_engine::DmxOutput>, String), String> =
        match config.dmx_output_type.as_str() {
            "enttec_pro" => crate::try_open_enttec_pro(config)
                .map(|o| (Box::new(o) as Box<dyn dlc_engine::DmxOutput>, "enttec_pro".to_string()))
                .map_err(|e| format!("ENTTEC Pro: {e}")),
            "artnet" => {
                let r = match &config.dmx_target_ip {
                    Some(ip) => match ip.parse::<std::net::IpAddr>() {
                        Ok(addr) => dlc_engine::ArtNetOutput::unicast(addr),
                        Err(_) => return Err(ApiError::bad_request(format!("invalid IP: {ip}"))),
                    },
                    None => dlc_engine::ArtNetOutput::broadcast(),
                };
                r.map(|o| (Box::new(o) as Box<dyn dlc_engine::DmxOutput>, "artnet".to_string()))
                    .map_err(|e| format!("Art-Net: {e}"))
            }
            "sacn" => dlc_engine::SacnOutput::new(config.sacn_priority)
                .map(|o| (Box::new(o) as Box<dyn dlc_engine::DmxOutput>, "sacn".to_string()))
                .map_err(|e| format!("sACN: {e}")),
            other => Err(format!("reconnect not supported for output type '{other}'")),
        };

    match result {
        Ok((output, label)) => {
            let tap = dlc_engine::TapOutput::new(output, state.tap_tx.clone());
            state.engine.swap_output(Box::new(tap), &label);
            Ok(Json(ReconnectResponse { dmx_output: label }))
        }
        Err(e) => Err(ApiError::Internal(e)),
    }
}
