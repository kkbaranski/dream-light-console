use axum::http::{Method, StatusCode};

use dlc_server::routes;
use dlc_server::test_helpers::{body_json, create_stage, send, spawn_test_state};

#[tokio::test]
async fn list_empty() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);

    let resp = send(&app, Method::GET, "/api/stages", None).await;

    assert_eq!(resp.status(), StatusCode::OK);
    let body = body_json(resp).await;
    assert_eq!(body, serde_json::json!([]));
}

#[tokio::test]
async fn create_and_get() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);

    let resp = send(
        &app,
        Method::POST,
        "/api/stages",
        Some(r#"{"name":"Main Stage"}"#),
    )
    .await;

    assert_eq!(resp.status(), StatusCode::CREATED);
    let created = body_json(resp).await;
    assert_eq!(created["name"], "Main Stage");
    assert_eq!(created["location_name"], "");
    let id = created["id"].as_str().unwrap();

    let resp = send(&app, Method::GET, &format!("/api/stages/{id}"), None).await;
    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(body_json(resp).await["name"], "Main Stage");

    let resp = send(&app, Method::GET, "/api/stages", None).await;
    assert_eq!(body_json(resp).await.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn create_with_location() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);

    let resp = send(
        &app,
        Method::POST,
        "/api/stages",
        Some(r#"{"name":"Arena","location_name":"City Arena","location_address":"123 Main St"}"#),
    )
    .await;

    assert_eq!(resp.status(), StatusCode::CREATED);
    let body = body_json(resp).await;
    assert_eq!(body["location_name"], "City Arena");
    assert_eq!(body["location_address"], "123 Main St");
}

#[tokio::test]
async fn update_partial() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);
    let stage_id = create_stage(&app, "Original").await;

    let resp = send(
        &app,
        Method::PUT,
        &format!("/api/stages/{stage_id}"),
        Some(r#"{"name":"Renamed"}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(body_json(resp).await["name"], "Renamed");
}

#[tokio::test]
async fn delete_stage() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);
    let stage_id = create_stage(&app, "To Delete").await;

    let resp = send(
        &app,
        Method::DELETE,
        &format!("/api/stages/{stage_id}"),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    let resp = send(
        &app,
        Method::GET,
        &format!("/api/stages/{stage_id}"),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn get_not_found() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);

    let resp = send(&app, Method::GET, "/api/stages/nonexistent", None).await;
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}
