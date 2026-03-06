use axum::{
    body::Body,
    http::{Method, Request},
    Router,
};
use http_body_util::BodyExt;
use sqlx::sqlite::SqlitePoolOptions;
use std::sync::Arc;
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
    let fixture_types = Arc::new(crate::fixture_types::load_embedded());
    let cue_executor = CueExecutor::new(db.clone(), engine_tx.clone(), fixture_types.clone());
    let engine = dlc_engine::EngineHandle::start(Box::new(dlc_engine::NullOutput), "null");
    let (ws_broadcast, _) = tokio::sync::broadcast::channel(256);
    let (tap_tx, _) = tokio::sync::mpsc::channel(64);
    AppState {
        config: Arc::new(ServerConfig::from_env()),
        db,
        engine_tx,
        engine: Arc::new(engine),
        tap_tx,
        ws_broadcast,
        cue_executor,
        fixture_types,
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

/// Send a request to the router and return the response.
/// This helper exists to resolve type inference issues in external integration tests.
pub async fn send(app: &Router, method: Method, uri: &str, body: Option<&str>) -> axum::response::Response {
    app.clone()
        .oneshot(json_request(method, uri, body))
        .await
        .unwrap()
}

pub async fn body_json(resp: axum::response::Response) -> serde_json::Value {
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

pub async fn create_stage(app: &Router, name: &str) -> String {
    let resp = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/stages",
            Some(&format!(r#"{{"name":"{name}"}}"#)),
        ))
        .await
        .unwrap();
    let body = body_json(resp).await;
    body["id"].as_str().unwrap().to_string()
}

pub async fn create_concert(app: &Router, stage_id: &str, name: &str) -> String {
    let body = serde_json::json!({ "name": name, "stage_id": stage_id }).to_string();
    let resp = app
        .clone()
        .oneshot(json_request(Method::POST, "/api/concerts", Some(&body)))
        .await
        .unwrap();
    body_json(resp).await["id"].as_str().unwrap().to_string()
}

pub async fn create_cue_list(app: &Router, concert_id: &str, name: &str) -> String {
    let body = serde_json::json!({ "name": name }).to_string();
    let resp = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            &format!("/api/concerts/{concert_id}/cue-lists"),
            Some(&body),
        ))
        .await
        .unwrap();
    body_json(resp).await["id"].as_str().unwrap().to_string()
}

pub async fn create_fixture(app: &Router, fixture_type_id: &str) -> String {
    let body = serde_json::json!({ "fixture_type_id": fixture_type_id }).to_string();
    let resp = app
        .clone()
        .oneshot(json_request(Method::POST, "/api/fixtures", Some(&body)))
        .await
        .unwrap();
    body_json(resp).await["id"].as_str().unwrap().to_string()
}

pub async fn create_placement(app: &Router, stage_id: &str, fixture_id: &str) -> String {
    let body = serde_json::json!({
        "fixture_id": fixture_id,
        "universe": 1,
        "dmx_address": 1
    })
    .to_string();
    let resp = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            &format!("/api/stages/{stage_id}/placements"),
            Some(&body),
        ))
        .await
        .unwrap();
    body_json(resp).await["id"].as_str().unwrap().to_string()
}

pub async fn spawn_test_state_with_receiver() -> (AppState, std::sync::mpsc::Receiver<dlc_protocol::EngineCommand>) {
    let db = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&db)
        .await
        .unwrap();
    sqlx::migrate!("./migrations").run(&db).await.unwrap();

    let (tx, rx) = std::sync::mpsc::sync_channel(1024);

    let fixture_types = Arc::new(crate::fixture_types::load_embedded());
    let cue_executor = CueExecutor::new(db.clone(), tx.clone(), fixture_types.clone());
    let engine = dlc_engine::EngineHandle::start(
        Box::new(dlc_engine::NullOutput),
        "null",
    );

    let (ws_broadcast, _) = tokio::sync::broadcast::channel(256);
    let (tap_tx, _) = tokio::sync::mpsc::channel(64);
    let state = AppState {
        config: Arc::new(ServerConfig::from_env()),
        db,
        engine_tx: tx,
        engine: Arc::new(engine),
        tap_tx,
        ws_broadcast,
        cue_executor,
        fixture_types,
    };
    (state, rx)
}

pub async fn create_cue(
    app: &Router,
    concert_id: &str,
    cue_list_id: &str,
    number: f64,
) -> String {
    let body = serde_json::json!({
        "number": number,
        "name": format!("Cue {number}"),
        "fade_time_ms": 1000,
        "scene_json": {
            "fixtures": [{
                "fixture_type_id": "moving_head",
                "dmx_mode": "sevenChannel",
                "universe": 1,
                "dmx_address": 1,
                "values": {"dimmer": 255}
            }]
        }
    })
    .to_string();

    let resp = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            &format!("/api/concerts/{concert_id}/cue-lists/{cue_list_id}/cues"),
            Some(&body),
        ))
        .await
        .unwrap();
    body_json(resp).await["id"]
        .as_str()
        .unwrap()
        .to_string()
}
