use axum::http::{Method, StatusCode};

use dlc_server::routes;
use dlc_server::test_helpers::{
    body_json, create_concert, create_cue, create_cue_list, create_stage, send, spawn_test_state,
};

#[tokio::test]
async fn go_fires_first_cue() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;
    let cue_list_id = create_cue_list(&app, &concert_id, "Main").await;
    let cue_id = create_cue(&app, &concert_id, &cue_list_id, 1.0).await;

    let resp = send(
        &app,
        Method::POST,
        &format!("/api/concerts/{concert_id}/cue-lists/{cue_list_id}/go"),
        None,
    )
    .await;

    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(body_json(resp).await["cue_id"], cue_id);
}

#[tokio::test]
async fn go_advances_through_cues() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;
    let cue_list_id = create_cue_list(&app, &concert_id, "Main").await;
    let cue1_id = create_cue(&app, &concert_id, &cue_list_id, 1.0).await;
    let cue2_id = create_cue(&app, &concert_id, &cue_list_id, 2.0).await;

    // First go → cue 1
    let resp = send(
        &app,
        Method::POST,
        &format!("/api/concerts/{concert_id}/cue-lists/{cue_list_id}/go"),
        None,
    )
    .await;
    assert_eq!(body_json(resp).await["cue_id"], cue1_id);

    // Second go → cue 2
    let resp = send(
        &app,
        Method::POST,
        &format!("/api/concerts/{concert_id}/cue-lists/{cue_list_id}/go"),
        None,
    )
    .await;
    assert_eq!(body_json(resp).await["cue_id"], cue2_id);
}

#[tokio::test]
async fn go_empty_list_returns_error() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;
    let cue_list_id = create_cue_list(&app, &concert_id, "Empty").await;

    let resp = send(
        &app,
        Method::POST,
        &format!("/api/concerts/{concert_id}/cue-lists/{cue_list_id}/go"),
        None,
    )
    .await;

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn stop_returns_no_content() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;
    let cue_list_id = create_cue_list(&app, &concert_id, "Main").await;

    let resp = send(
        &app,
        Method::POST,
        &format!("/api/concerts/{concert_id}/cue-lists/{cue_list_id}/stop"),
        None,
    )
    .await;

    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
}
