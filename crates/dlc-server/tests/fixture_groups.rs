use axum::http::{Method, StatusCode};

use dlc_server::routes;
use dlc_server::test_helpers::{
    body_json, create_concert, create_stage, send, spawn_test_state,
};

#[tokio::test]
async fn fixture_group_crud() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;

    let resp = send(
        &app,
        Method::POST,
        &format!("/api/concerts/{concert_id}/fixture-groups"),
        Some(r#"{"name":"Front Wash"}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::CREATED);
    let id = body_json(resp).await["id"].as_str().unwrap().to_string();

    let resp = send(
        &app,
        Method::GET,
        &format!("/api/concerts/{concert_id}/fixture-groups"),
        None,
    )
    .await;
    assert_eq!(body_json(resp).await.as_array().unwrap().len(), 1);

    let resp = send(
        &app,
        Method::DELETE,
        &format!("/api/concerts/{concert_id}/fixture-groups/{id}"),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
}
