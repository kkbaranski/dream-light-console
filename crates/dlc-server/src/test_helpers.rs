use axum::{
    body::Body,
    http::{Method, Request},
    Router,
};
use http_body_util::BodyExt;
use sqlx::sqlite::SqlitePoolOptions;
use tower::ServiceExt;

use crate::config::ServerConfig;
use crate::cue_executor::CueExecutor;
use crate::state::AppState;

pub async fn spawn_test_state() -> AppState {
    let db = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&db)
        .await
        .unwrap();
    sqlx::migrate!("./migrations").run(&db).await.unwrap();
    let (engine_tx, _) = std::sync::mpsc::sync_channel(1024);
    let cue_executor = CueExecutor::new(db.clone(), engine_tx.clone());
    let engine = dlc_engine::EngineHandle::start(Box::new(dlc_engine::NullOutput));
    let (ws_broadcast, _) = tokio::sync::broadcast::channel(256);
    AppState {
        config: std::sync::Arc::new(ServerConfig::from_env()),
        db,
        engine_tx,
        engine: std::sync::Arc::new(engine),
        ws_broadcast,
        cue_executor,
    }
}

pub fn json_request(method: Method, uri: &str, body: Option<&str>) -> Request<Body> {
    let mut builder = Request::builder().method(method).uri(uri);
    if body.is_some() {
        builder = builder.header("content-type", "application/json");
    }
    builder
        .body(Body::from(body.unwrap_or("").to_string()))
        .unwrap()
}

pub async fn body_json(resp: axum::response::Response) -> serde_json::Value {
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

pub async fn create_show(app: &Router, name: &str) -> String {
    let resp = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/shows",
            Some(&format!(r#"{{"name":"{name}"}}"#)),
        ))
        .await
        .unwrap();
    let body = body_json(resp).await;
    body["id"].as_str().unwrap().to_string()
}

pub async fn create_stage(app: &Router, show_id: &str, name: &str) -> String {
    let resp = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            &format!("/api/shows/{show_id}/stages"),
            Some(&format!(r#"{{"name":"{name}"}}"#)),
        ))
        .await
        .unwrap();
    let body = body_json(resp).await;
    body["id"].as_str().unwrap().to_string()
}

pub async fn create_cue_list(app: &Router, show_id: &str, name: &str) -> String {
    let body = serde_json::json!({ "name": name }).to_string();
    let resp = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            &format!("/api/shows/{show_id}/cuelists"),
            Some(&body),
        ))
        .await
        .unwrap();
    body_json(resp).await["id"].as_str().unwrap().to_string()
}
