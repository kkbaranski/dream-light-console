use axum::Json;
use dlc_protocol::HealthResponse;

pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        engine_hz: dlc_protocol::ENGINE_HZ,
        connected_clients: 0,
    })
}
