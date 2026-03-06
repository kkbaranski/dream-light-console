use axum::http::{Method, StatusCode};

use dlc_server::routes;
use dlc_server::test_helpers::{body_json, create_fixture, send, spawn_test_state};

#[tokio::test]
async fn create_and_get() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);

    let fixture_id = create_fixture(&app, "moving_head").await;

    let resp = send(
        &app,
        Method::GET,
        &format!("/api/fixtures/{fixture_id}"),
        None,
    )
    .await;

    assert_eq!(resp.status(), StatusCode::OK);
    let body = body_json(resp).await;
    assert_eq!(body["fixture_type_id"], "moving_head");
}

#[tokio::test]
async fn create_invalid_type_returns_400() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);

    let resp = send(
        &app,
        Method::POST,
        "/api/fixtures",
        Some(r#"{"fixture_type_id":"nonexistent"}"#),
    )
    .await;

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn delete_unreferenced_fixture() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let fixture_id = create_fixture(&app, "moving_head").await;

    let resp = send(
        &app,
        Method::DELETE,
        &format!("/api/fixtures/{fixture_id}"),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn delete_referenced_fixture_returns_409() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let fixture_id = create_fixture(&app, "moving_head").await;

    // Create a stage
    let resp = send(
        &app,
        Method::POST,
        "/api/stages",
        Some(r#"{"name":"Test Stage"}"#),
    )
    .await;
    let stage_id = body_json(resp).await["id"].as_str().unwrap().to_string();

    // Create a placement referencing the fixture
    let body = serde_json::json!({
        "fixture_id": fixture_id,
        "universe": 1,
        "dmx_address": 1
    })
    .to_string();
    send(
        &app,
        Method::POST,
        &format!("/api/stages/{stage_id}/placements"),
        Some(&body),
    )
    .await;

    let resp = send(
        &app,
        Method::DELETE,
        &format!("/api/fixtures/{fixture_id}"),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::CONFLICT);
}
