use axum::http::{Method, StatusCode};

use dlc_server::routes;
use dlc_server::test_helpers::{body_json, send, spawn_test_state};

#[tokio::test]
async fn list_fixture_types() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);

    let resp = send(&app, Method::GET, "/api/fixture-types", None).await;

    assert_eq!(resp.status(), StatusCode::OK);
    let body = body_json(resp).await;
    let arr = body.as_array().unwrap();
    assert!(arr.len() >= 11);
}

#[tokio::test]
async fn get_fixture_type() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);

    let resp = send(&app, Method::GET, "/api/fixture-types/moving_head", None).await;

    assert_eq!(resp.status(), StatusCode::OK);
    let body = body_json(resp).await;
    assert_eq!(body["id"], "moving_head");
    assert_eq!(body["label"], "Moving Head");
    assert!(body["definition"].is_object());
}

#[tokio::test]
async fn get_fixture_type_not_found() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);

    let resp = send(&app, Method::GET, "/api/fixture-types/nonexistent", None).await;

    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}
