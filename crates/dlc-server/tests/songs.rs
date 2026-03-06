use axum::http::{Method, StatusCode};

use dlc_server::routes;
use dlc_server::test_helpers::{body_json, send, spawn_test_state};

#[tokio::test]
async fn song_crud() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);

    let resp = send(&app, Method::POST, "/api/songs", Some(r#"{"title":"Test Song","artist":"Test Artist"}"#)).await;
    assert_eq!(resp.status(), StatusCode::CREATED);
    let body = body_json(resp).await;
    let id = body["id"].as_str().unwrap().to_string();

    let resp = send(&app, Method::GET, "/api/songs", None).await;
    let list = body_json(resp).await;
    assert_eq!(list.as_array().unwrap().len(), 1);

    let resp = send(&app, Method::PUT, &format!("/api/songs/{id}"), Some(r#"{"title":"Renamed"}"#)).await;
    assert_eq!(body_json(resp).await["title"], "Renamed");

    let resp = send(&app, Method::DELETE, &format!("/api/songs/{id}"), None).await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn song_versions_and_recordings() {
    let state = spawn_test_state().await;
    let app = routes::build_api_router(state);

    let resp = send(&app, Method::POST, "/api/songs", Some(r#"{"title":"Song"}"#)).await;
    let song_id = body_json(resp).await["id"].as_str().unwrap().to_string();

    let resp = send(&app, Method::POST, &format!("/api/songs/{song_id}/versions"), Some(r#"{"name":"Studio Mix","bpm":120.0}"#)).await;
    assert_eq!(resp.status(), StatusCode::CREATED);
    let version_id = body_json(resp).await["id"].as_i64().unwrap();

    let resp = send(&app, Method::GET, &format!("/api/songs/{song_id}/versions"), None).await;
    assert_eq!(body_json(resp).await.as_array().unwrap().len(), 1);

    let resp = send(&app, Method::POST, &format!("/api/songs/{song_id}/versions/{version_id}/recordings"), Some(r#"{"file_path":"/audio/song.wav","source":"studio"}"#)).await;
    assert_eq!(resp.status(), StatusCode::CREATED);

    let resp = send(&app, Method::GET, &format!("/api/songs/{song_id}/versions/{version_id}/recordings"), None).await;
    assert_eq!(body_json(resp).await.as_array().unwrap().len(), 1);
}
