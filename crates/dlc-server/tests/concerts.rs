use axum::http::{Method, StatusCode};

use dlc_server::routes;
use dlc_server::test_helpers::{body_json, create_concert, create_stage, send, spawn_test_state};

#[tokio::test]
async fn concert_crud() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;

    let resp = send(
        &app,
        Method::GET,
        &format!("/api/concerts/{concert_id}"),
        None,
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(body_json(resp).await["status"], "draft");

    let resp = send(&app, Method::GET, "/api/concerts", None).await;
    assert_eq!(body_json(resp).await.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn status_transitions() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;

    let resp = send(
        &app,
        Method::PATCH,
        &format!("/api/concerts/{concert_id}/status"),
        Some(r#"{"status":"rehearsal"}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(body_json(resp).await["status"], "rehearsal");

    let resp = send(
        &app,
        Method::PATCH,
        &format!("/api/concerts/{concert_id}/status"),
        Some(r#"{"status":"ready"}"#),
    )
    .await;
    assert_eq!(body_json(resp).await["status"], "ready");

    let resp = send(
        &app,
        Method::PATCH,
        &format!("/api/concerts/{concert_id}/status"),
        Some(r#"{"status":"live"}"#),
    )
    .await;
    assert_eq!(body_json(resp).await["status"], "live");

    let resp = send(
        &app,
        Method::PATCH,
        &format!("/api/concerts/{concert_id}/status"),
        Some(r#"{"status":"completed"}"#),
    )
    .await;
    assert_eq!(body_json(resp).await["status"], "completed");

    let resp = send(
        &app,
        Method::PATCH,
        &format!("/api/concerts/{concert_id}/status"),
        Some(r#"{"status":"archived"}"#),
    )
    .await;
    assert_eq!(body_json(resp).await["status"], "archived");
}

#[tokio::test]
async fn invalid_status_transition() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);
    let stage_id = create_stage(&app, "Stage").await;
    let concert_id = create_concert(&app, &stage_id, "Concert").await;

    let resp = send(
        &app,
        Method::PATCH,
        &format!("/api/concerts/{concert_id}/status"),
        Some(r#"{"status":"completed"}"#),
    )
    .await;
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_concert_with_program_copies_entries() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);
    let stage_id = create_stage(&app, "Stage").await;

    let resp = send(
        &app,
        Method::POST,
        "/api/concert-programs",
        Some(r#"{"name":"Rock Set","entries_json":"[{\"song\":\"song1\"}]"}"#),
    )
    .await;
    let program_id = body_json(resp).await["id"].as_str().unwrap().to_string();

    let body = serde_json::json!({
        "name": "Saturday Show",
        "stage_id": stage_id,
        "program_id": program_id,
    })
    .to_string();
    let resp = send(&app, Method::POST, "/api/concerts", Some(&body)).await;
    assert_eq!(resp.status(), StatusCode::CREATED);
    let concert = body_json(resp).await;

    let entries: serde_json::Value =
        serde_json::from_str(concert["program_entries_json"].as_str().unwrap()).unwrap();
    assert_eq!(entries[0]["song"], "song1");
}
