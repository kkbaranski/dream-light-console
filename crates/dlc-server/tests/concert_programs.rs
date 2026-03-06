use axum::http::{Method, StatusCode};

use dlc_server::routes;
use dlc_server::test_helpers::{body_json, send, spawn_test_state};

#[tokio::test]
async fn concert_program_crud() {
    let state = spawn_test_state().await;
    let app = routes::build_router(state);

    let resp = send(&app, Method::POST, "/api/concert-programs", Some(r#"{"name":"Rock Set"}"#)).await;
    assert_eq!(resp.status(), StatusCode::CREATED);
    let id = body_json(resp).await["id"].as_str().unwrap().to_string();

    let resp = send(&app, Method::GET, "/api/concert-programs", None).await;
    assert_eq!(body_json(resp).await.as_array().unwrap().len(), 1);

    let resp = send(&app, Method::PUT, &format!("/api/concert-programs/{id}"), Some(r#"{"name":"Pop Set"}"#)).await;
    assert_eq!(body_json(resp).await["name"], "Pop Set");

    let resp = send(&app, Method::DELETE, &format!("/api/concert-programs/{id}"), None).await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
}
