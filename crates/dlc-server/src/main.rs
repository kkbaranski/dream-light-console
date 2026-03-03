use std::str::FromStr;
use std::sync::Arc;

use anyhow::Result;
use dlc_engine::{ArtNetOutput, EngineHandle, MockOutput, NullOutput, SacnOutput};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tracing_subscriber::EnvFilter;

mod config;
pub(crate) mod cue_executor;
mod error;
mod routes;
mod state;
#[cfg(test)]
pub(crate) mod test_helpers;

use config::ServerConfig;
use state::AppState;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive("dlc_server=info".parse()?)
                .add_directive("tower_http=debug".parse()?),
        )
        .init();

    let config = ServerConfig::from_env();
    let bind_addr = format!("{}:{}", config.host, config.port);
    let static_dir = config.static_dir().to_string();

    // Connect to SQLite with foreign keys enabled on every connection
    let db_url = format!("sqlite:{}?mode=rwc", config.db_path);
    let options = SqliteConnectOptions::from_str(&db_url)?
        .pragma("foreign_keys", "ON")
        .create_if_missing(true);
    let db = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&db).await?;
    tracing::info!("Database ready: {}", config.db_path);

    // Seed built-in fixtures on first run
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM fixture_library")
        .fetch_one(&db)
        .await?;
    if count.0 == 0 {
        routes::library::seed_fixture_library(&db).await?;
    }

    // Create DMX engine
    let output: Box<dyn dlc_engine::DmxOutput> = match config.dmx_output_type.as_str() {
        "artnet" => {
            let output = match &config.dmx_target_ip {
                Some(ip) => {
                    let addr: std::net::IpAddr = ip.parse()
                        .unwrap_or_else(|_| panic!("invalid DLC_DMX_TARGET_IP: {ip}"));
                    tracing::info!("DMX output: Art-Net unicast to {addr}");
                    ArtNetOutput::unicast(addr)?
                }
                None => {
                    tracing::info!("DMX output: Art-Net broadcast");
                    ArtNetOutput::broadcast()?
                }
            };
            Box::new(output)
        }
        "sacn" => {
            tracing::info!("DMX output: sACN/E1.31 multicast (priority={})", config.sacn_priority);
            Box::new(SacnOutput::new(config.sacn_priority)?)
        }
        "mock" => {
            tracing::info!("DMX output: mock (no hardware)");
            Box::new(MockOutput::new())
        }
        "null" => {
            tracing::info!("DMX output: null (silent)");
            Box::new(NullOutput)
        }
        other => {
            tracing::warn!("Unknown DMX output type '{other}', falling back to mock");
            Box::new(MockOutput::new())
        }
    };

    let engine_handle = EngineHandle::start(output);
    let engine_tx = engine_handle.sender();
    let engine = Arc::new(engine_handle);
    tracing::info!("DMX engine started (44Hz loop)");

    let (ws_broadcast, _) = tokio::sync::broadcast::channel(256);

    let cue_executor = cue_executor::CueExecutor::new(db.clone(), engine_tx.clone());

    let state = AppState {
        config: Arc::new(config),
        db,
        engine_tx,
        engine,
        ws_broadcast,
        cue_executor,
    };

    let app = routes::build_router(state);

    tracing::info!("DreamLightConsole server listening on {bind_addr}");
    tracing::info!("Static files: {static_dir}");

    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;

    let shutdown_signal = async {
        tokio::signal::ctrl_c()
            .await
            .expect("install Ctrl+C handler");
        tracing::info!("Shutdown signal received");
    };

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal)
        .await?;

    // Engine shuts down via Drop when Arc<EngineHandle> refcount reaches zero
    tracing::info!("DreamLightConsole server stopped");

    Ok(())
}
