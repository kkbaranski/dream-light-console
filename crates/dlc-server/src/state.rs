use std::sync::mpsc;
use std::sync::Arc;

use dlc_protocol::EngineCommand;
use sqlx::SqlitePool;

use crate::config::ServerConfig;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<ServerConfig>,
    pub db: SqlitePool,
    pub engine_tx: mpsc::Sender<EngineCommand>,
}
