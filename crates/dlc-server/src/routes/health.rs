use axum::extract::State;
use axum::Json;
use dlc_protocol::HealthResponse;

use crate::state::AppState;

pub async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        engine_hz: dlc_protocol::ENGINE_HZ,
        connected_clients: 0,
        dmx_output: state.engine.output_label(),
    })
}
