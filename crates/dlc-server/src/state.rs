use std::sync::Arc;

use sqlx::SqlitePool;

use crate::config::ServerConfig;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<ServerConfig>,
    #[allow(dead_code)] // used by API route handlers in future tasks
    pub db: SqlitePool,
}
