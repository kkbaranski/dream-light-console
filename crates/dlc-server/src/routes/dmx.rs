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
    match config.dmx_output_type.as_str() {
        "enttec_pro" => {
            match crate::try_open_enttec_pro(config) {
                Ok(output) => {
                    let (tap_tx, _) = tokio::sync::mpsc::channel(64);
                    let tap = dlc_engine::TapOutput::new(Box::new(output), tap_tx);
                    state.engine.swap_output(Box::new(tap), "enttec_pro");
                    Ok(Json(ReconnectResponse { dmx_output: "enttec_pro".to_string() }))
                }
                Err(e) => {
                    Err(ApiError::Internal(format!("ENTTEC Pro not found: {e}")))
                }
            }
        }
        "artnet" => {
            let result = match &config.dmx_target_ip {
                Some(ip) => {
                    let addr: std::net::IpAddr = ip.parse()
                        .map_err(|_| ApiError::Internal(format!("invalid IP: {ip}")))?;
                    dlc_engine::ArtNetOutput::unicast(addr)
                }
                None => dlc_engine::ArtNetOutput::broadcast(),
            };
            match result {
                Ok(output) => {
                    let (tap_tx, _) = tokio::sync::mpsc::channel(64);
                    let tap = dlc_engine::TapOutput::new(Box::new(output), tap_tx);
                    state.engine.swap_output(Box::new(tap), "artnet");
                    Ok(Json(ReconnectResponse { dmx_output: "artnet".to_string() }))
                }
                Err(e) => Err(ApiError::Internal(format!("Art-Net init failed: {e}"))),
            }
        }
        "sacn" => {
            match dlc_engine::SacnOutput::new(config.sacn_priority) {
                Ok(output) => {
                    let (tap_tx, _) = tokio::sync::mpsc::channel(64);
                    let tap = dlc_engine::TapOutput::new(Box::new(output), tap_tx);
                    state.engine.swap_output(Box::new(tap), "sacn");
                    Ok(Json(ReconnectResponse { dmx_output: "sacn".to_string() }))
                }
                Err(e) => Err(ApiError::Internal(format!("sACN init failed: {e}"))),
            }
        }
        other => {
            Err(ApiError::bad_request(format!("reconnect not supported for output type '{other}'")))
        }
    }
}

#[cfg(test)]
mod tests {
    use axum::{
        http::{Method, StatusCode},
    };
    use http_body_util::BodyExt;
    use sqlx::sqlite::SqlitePoolOptions;
    use tower::ServiceExt;

    use crate::routes;
    use crate::test_helpers::json_request;

    async fn test_state_with_receiver() -> (crate::state::AppState, std::sync::mpsc::Receiver<dlc_protocol::EngineCommand>) {
        let db = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&db)
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&db).await.unwrap();

        let (tx, rx) = std::sync::mpsc::sync_channel(1024);

        let fixture_types = std::sync::Arc::new(crate::fixture_types::load_embedded());
        let cue_executor = crate::cue_executor::CueExecutor::new(db.clone(), tx.clone(), fixture_types.clone());
        let engine = dlc_engine::EngineHandle::start(
            Box::new(dlc_engine::NullOutput),
            "null",
        );

        let (ws_broadcast, _) = tokio::sync::broadcast::channel(256);
        let state = crate::state::AppState {
            config: std::sync::Arc::new(crate::config::ServerConfig::from_env()),
            db,
            engine_tx: tx,
            engine: std::sync::Arc::new(engine),
            ws_broadcast,
            cue_executor,
            fixture_types,
        };
        (state, rx)
    }

    #[tokio::test]
    async fn set_channel_sends_command() {
        let (state, rx) = test_state_with_receiver().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(
                Method::PUT,
                "/api/universes/1/channels/0",
                Some(r#"{"value":255}"#),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::NO_CONTENT);

        let cmd = rx.try_recv().unwrap();
        match cmd {
            dlc_protocol::EngineCommand::SetChannel {
                universe,
                channel,
                value,
            } => {
                assert_eq!(universe, 1);
                assert_eq!(channel, 0);
                assert_eq!(value, 255);
            }
            other => panic!("expected SetChannel, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn set_channel_invalid_channel() {
        let (state, _rx) = test_state_with_receiver().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(
                Method::PUT,
                "/api/universes/1/channels/512",
                Some(r#"{"value":0}"#),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn set_channel_missing_value() {
        let (state, _rx) = test_state_with_receiver().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(
                Method::PUT,
                "/api/universes/1/channels/0",
                Some(r#"{}"#),
            ))
            .await
            .unwrap();

        // axum returns 422 for deserialization errors
        assert_eq!(resp.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn set_channel_response_body() {
        let (state, _rx) = test_state_with_receiver().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(
                Method::PUT,
                "/api/universes/1/channels/100",
                Some(r#"{"value":128}"#),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        assert!(bytes.is_empty());
    }
}
