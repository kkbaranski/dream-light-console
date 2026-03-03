use std::sync::Arc;

use sqlx::SqlitePool;

use crate::config::ServerConfig;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<ServerConfig>,
    pub db: SqlitePool,
}
