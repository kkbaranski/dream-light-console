use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::Arc;

use dlc_engine::EngineHandle;
use dlc_protocol::EngineCommand;
use sqlx::SqlitePool;
use tokio::sync::broadcast;

use crate::config::ServerConfig;
use crate::cue_executor::CueExecutor;
use crate::fixture_types::FixtureTypeDef;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<ServerConfig>,
    pub db: SqlitePool,
    pub engine_tx: mpsc::SyncSender<EngineCommand>,
    pub engine: Arc<EngineHandle>,
    pub tap_tx: tokio::sync::mpsc::Sender<dlc_engine::TapFrame>,
    pub ws_broadcast: broadcast::Sender<WsBroadcast>,
    pub cue_executor: CueExecutor,
    pub fixture_types: Arc<HashMap<String, FixtureTypeDef>>,
}

#[derive(Debug, Clone)]
pub enum WsBroadcast {
    UniverseUpdate { universe: u16, channels: Vec<u8> },
}
