use std::str::FromStr;
use std::sync::Arc;

use anyhow::Result;
use std::collections::HashMap;

use dlc_engine::{ArtNetOutput, EngineHandle, EnttecProOutput, MockOutput, NullOutput, SacnOutput, TapOutput};
use dlc_protocol::DMX_CHANNELS_PER_UNIVERSE;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tracing_subscriber::EnvFilter;

mod config;
pub(crate) mod cue_executor;
pub(crate) mod db;
mod error;
pub(crate) mod fixture_types;
mod routes;
mod state;
#[cfg(test)]
pub(crate) mod test_helpers;

use config::ServerConfig;
use state::AppState;

const DB_MAX_CONNECTIONS: u32 = 5;
const WS_BROADCAST_CAPACITY: usize = 256;
const ENGINE_TAP_CAPACITY: usize = 64;
const RELAY_POLL_INTERVAL_MS: u64 = 100;

fn create_dmx_output(
    config: &ServerConfig,
) -> Result<Box<dyn dlc_engine::DmxOutput>> {
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
        "enttec_pro" => {
            let port_name = match &config.dmx_serial_port {
                Some(port) => port.clone(),
                None => {
                    let ports = serialport::available_ports()
                        .map_err(|e| anyhow::anyhow!("failed to list serial ports: {e}"))?;
                    ports
                        .iter()
                        .find(|p| p.port_name.contains("usbserial"))
                        .map(|p| p.port_name.clone())
                        .ok_or_else(|| anyhow::anyhow!(
                            "no ENTTEC DMX USB Pro found; set DLC_SERIAL_PORT explicitly"
                        ))?
                }
            };
            tracing::info!("DMX output: ENTTEC DMX USB Pro on {port_name}");
            Box::new(EnttecProOutput::new(&port_name)?)
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
    Ok(output)
}

fn spawn_relay_task(
    mut tap_rx: tokio::sync::mpsc::Receiver<dlc_engine::TapFrame>,
    broadcast_tx: tokio::sync::broadcast::Sender<state::WsBroadcast>,
) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(RELAY_POLL_INTERVAL_MS)).await;

            let mut latest: HashMap<u16, Box<[u8; DMX_CHANNELS_PER_UNIVERSE]>> = HashMap::new();
            while let Ok(frame) = tap_rx.try_recv() {
                latest.insert(frame.universe_id, frame.data);
            }

            for (universe_id, data) in latest {
                if broadcast_tx.receiver_count() > 0 {
                    let _ = broadcast_tx.send(state::WsBroadcast::UniverseUpdate {
                        universe: universe_id,
                        channels: data.to_vec(),
                    });
                }
            }
        }
    });
}

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

    let db_url = format!("sqlite:{}?mode=rwc", config.db_path);
    let options = SqliteConnectOptions::from_str(&db_url)?
        .pragma("foreign_keys", "ON")
        .create_if_missing(true);
    let db = SqlitePoolOptions::new()
        .max_connections(DB_MAX_CONNECTIONS)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&db).await?;
    tracing::info!("Database ready: {}", config.db_path);

    let fixture_types_dir = std::path::Path::new("data/library/fixture_types");
    let fixture_type_definitions = fixture_types::load_fixture_types(fixture_types_dir);
    let fixture_types = Arc::new(fixture_type_definitions);
    tracing::info!("Loaded {} fixture types", fixture_types.len());

    let output = create_dmx_output(&config)?;

    let (ws_broadcast, _) = tokio::sync::broadcast::channel(WS_BROADCAST_CAPACITY);

    let (tap_tx, tap_rx) = tokio::sync::mpsc::channel(ENGINE_TAP_CAPACITY);
    let output = Box::new(TapOutput::new(output, tap_tx));

    let engine_handle = EngineHandle::start(output);
    let engine_tx = engine_handle.sender();
    let engine = Arc::new(engine_handle);
    tracing::info!("DMX engine started (44Hz loop)");

    spawn_relay_task(tap_rx, ws_broadcast.clone());

    let cue_executor = cue_executor::CueExecutor::new(
        db.clone(),
        engine_tx.clone(),
        fixture_types.clone(),
    );

    let state = AppState {
        config: Arc::new(config),
        db,
        engine_tx,
        engine,
        ws_broadcast,
        cue_executor,
        fixture_types,
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

    tracing::info!("DreamLightConsole server stopped");

    Ok(())
}
