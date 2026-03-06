use axum::http::{Method, StatusCode};

use dlc_server::routes;
use dlc_server::test_helpers::{body_json, create_stage, send, spawn_test_state};

#[tokio::test]
async fn list_empty_by_default() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);
    let stage_id = create_stage(&app, "Stage").await;

    let resp = send(&app, Method::GET, &format!("/api/stages/{stage_id}/objects"), None).await;

    assert_eq!(resp.status(), StatusCode::OK);
    let body = body_json(resp).await;
    assert_eq!(body, serde_json::json!([]));
}

#[tokio::test]
async fn bulk_put_and_list() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);
    let stage_id = create_stage(&app, "Stage").await;

    let objects = r#"[{"id":"obj-1","object_type":"barricade","name":"B1"},{"id":"obj-2","object_type":"mic","name":"M1"}]"#;
    let resp = send(&app, Method::PUT, &format!("/api/stages/{stage_id}/objects"), Some(objects)).await;
    assert_eq!(resp.status(), StatusCode::OK);

    let resp = send(&app, Method::GET, &format!("/api/stages/{stage_id}/objects"), None).await;
    let body = body_json(resp).await;
    assert_eq!(body.as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn cascade_delete_with_stage() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);
    let stage_id = create_stage(&app, "Stage").await;

    send(&app, Method::POST, &format!("/api/stages/{stage_id}/objects"), Some(r#"{"object_type":"barricade","name":"B1"}"#)).await;

    send(&app, Method::DELETE, &format!("/api/stages/{stage_id}"), None).await;

    let resp = send(&app, Method::GET, &format!("/api/stages/{stage_id}/objects"), None).await;
    let body = body_json(resp).await;
    assert_eq!(body, serde_json::json!([]));
}
