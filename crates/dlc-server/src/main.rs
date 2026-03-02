use anyhow::Result;
use axum::{routing::get, Json, Router};
use dlc_protocol::HealthResponse;
use tracing_subscriber::EnvFilter;

const DEFAULT_PORT: u16 = 3000;
const STATUS_OK: &str = "ok";

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: STATUS_OK.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        engine_hz: dlc_protocol::ENGINE_HZ,
        connected_clients: 0,
    })
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("info".parse()?))
        .init();

    let app = Router::new().route("/health", get(health));

    let bind_address = format!("0.0.0.0:{DEFAULT_PORT}");
    let listener = tokio::net::TcpListener::bind(&bind_address).await?;
    tracing::info!("DreamLightConsole server listening on port {DEFAULT_PORT}");
    axum::serve(listener, app).await?;

    Ok(())
}
