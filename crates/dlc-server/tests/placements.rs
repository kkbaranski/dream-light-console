use axum::http::{Method, StatusCode};

use dlc_server::routes;
use dlc_server::test_helpers::{
    body_json, create_fixture, create_placement, create_stage, send, spawn_test_state,
};

#[tokio::test]
async fn create_and_list_placements() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let fixture_id = create_fixture(&app, "moving_head").await;

    create_placement(&app, &stage_id, &fixture_id).await;

    let resp = send(&app, Method::GET, &format!("/api/stages/{stage_id}/placements"), None).await;

    assert_eq!(resp.status(), StatusCode::OK);
    let body = body_json(resp).await;
    assert_eq!(body.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn cascade_delete_with_stage() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let fixture_id = create_fixture(&app, "moving_head").await;
    create_placement(&app, &stage_id, &fixture_id).await;

    send(&app, Method::DELETE, &format!("/api/stages/{stage_id}"), None).await;

    let resp = send(&app, Method::GET, &format!("/api/stages/{stage_id}/placements"), None).await;
    let body = body_json(resp).await;
    assert_eq!(body.as_array().unwrap().len(), 0);
}
