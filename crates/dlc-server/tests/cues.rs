use axum::http::{Method, StatusCode};

use dlc_server::routes;
use dlc_server::test_helpers::{
    body_json, create_concert, create_cue_list, create_stage, send, spawn_test_state,
};

#[tokio::test]
async fn create_and_list_ordered() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;
    let cl_id = create_cue_list(&app, &concert_id, "Main").await;

    send(
        &app,
        Method::POST,
        &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues"),
        Some(r#"{"number":2.0,"name":"Cue 2","fade_time_ms":1000}"#),
    )
    .await;

    let resp = send(
        &app,
        Method::POST,
        &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues"),
        Some(r#"{"number":1.0,"name":"Cue 1","fade_time_ms":500}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created = body_json(resp).await;
    assert_eq!(created["name"], "Cue 1");
    assert_eq!(created["fade_time_ms"], 500);

    let resp = send(
        &app,
        Method::GET,
        &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues"),
        None,
    )
    .await;
    let list = body_json(resp).await;
    let arr = list.as_array().unwrap();
    assert_eq!(arr.len(), 2);
    assert_eq!(arr[0]["number"], 1.0);
    assert_eq!(arr[1]["number"], 2.0);
}

#[tokio::test]
async fn create_with_scene_json() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;
    let cl_id = create_cue_list(&app, &concert_id, "Main").await;

    let resp = send(
        &app,
        Method::POST,
        &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues"),
        Some(r#"{"number":1.0,"scene_json":{"fixtures":[{"dimmer":255}]}}"#),
    )
    .await;

    assert_eq!(resp.status(), StatusCode::CREATED);
    let body = body_json(resp).await;
    let scene: serde_json::Value =
        serde_json::from_str(body["scene_json"].as_str().unwrap()).unwrap();
    assert!(scene["fixtures"].is_array());
}

#[tokio::test]
async fn delete_cue() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;
    let cl_id = create_cue_list(&app, &concert_id, "Main").await;

    let resp = send(
        &app,
        Method::POST,
        &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues"),
        Some(r#"{"number":1.0}"#),
    )
    .await;
    let id = body_json(resp).await["id"].as_str().unwrap().to_string();

    let resp = send(
        &app,
        Method::DELETE,
        &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues/{id}"),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn cascade_delete_with_cue_list() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;
    let cl_id = create_cue_list(&app, &concert_id, "Main").await;

    send(
        &app,
        Method::POST,
        &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues"),
        Some(r#"{"number":1.0}"#),
    )
    .await;

    send(
        &app,
        Method::DELETE,
        &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}"),
        None,
    )
    .await;

    let resp = send(
        &app,
        Method::GET,
        &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues"),
        None,
    )
    .await;
    assert_eq!(body_json(resp).await.as_array().unwrap().len(), 0);
}
