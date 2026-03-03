use std::str::FromStr;

use anyhow::Result;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tracing_subscriber::EnvFilter;

mod config;
mod error;
mod routes;
mod state;

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

    let state = AppState {
        config: std::sync::Arc::new(config),
        db,
    };

    let app = routes::build_router(state);

    tracing::info!("DreamLightConsole server listening on {bind_addr}");
    tracing::info!("Static files: {static_dir}");

    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
