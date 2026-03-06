use axum::http::{Method, StatusCode};

use dlc_server::routes;
use dlc_server::test_helpers::{
    body_json, create_concert, create_cue_list, create_stage, send, spawn_test_state,
};

#[tokio::test]
async fn list_empty() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;

    let resp = send(
        &app,
        Method::GET,
        &format!("/api/concerts/{concert_id}/cue-lists"),
        None,
    )
    .await;

    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(body_json(resp).await, serde_json::json!([]));
}

#[tokio::test]
async fn create_and_list() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;

    let resp = send(
        &app,
        Method::POST,
        &format!("/api/concerts/{concert_id}/cue-lists"),
        Some(r#"{"name":"Main"}"#),
    )
    .await;

    assert_eq!(resp.status(), StatusCode::CREATED);
    let created = body_json(resp).await;
    assert_eq!(created["name"], "Main");
    assert_eq!(created["concert_id"], concert_id);

    let resp = send(
        &app,
        Method::GET,
        &format!("/api/concerts/{concert_id}/cue-lists"),
        None,
    )
    .await;
    assert_eq!(body_json(resp).await.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn update_cue_list() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;
    let cl_id = create_cue_list(&app, &concert_id, "Original").await;

    let resp = send(
        &app,
        Method::PUT,
        &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}"),
        Some(r#"{"name":"Renamed"}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(body_json(resp).await["name"], "Renamed");
}

#[tokio::test]
async fn delete_cue_list() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;
    let cl_id = create_cue_list(&app, &concert_id, "To Delete").await;

    let resp = send(
        &app,
        Method::DELETE,
        &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}"),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn cascade_delete_with_concert() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;
    create_cue_list(&app, &concert_id, "CL").await;

    send(
        &app,
        Method::DELETE,
        &format!("/api/concerts/{concert_id}"),
        None,
    )
    .await;

    let resp = send(
        &app,
        Method::GET,
        &format!("/api/concerts/{concert_id}/cue-lists"),
        None,
    )
    .await;
    assert_eq!(body_json(resp).await.as_array().unwrap().len(), 0);
}
