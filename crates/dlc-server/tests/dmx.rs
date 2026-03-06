use axum::http::{Method, StatusCode};

use dlc_server::routes;
use dlc_server::test_helpers::{send, spawn_test_state_with_receiver};

#[tokio::test]
async fn set_channel_sends_command() {
    let (state, rx) = spawn_test_state_with_receiver().await;
    let app = routes::build_api_router(state);

    let resp = send(
        &app,
        Method::PUT,
        "/api/universes/1/channels/0",
        Some(r#"{"value":255}"#),
    )
    .await;

    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    let cmd = rx.try_recv().unwrap();
    match cmd {
        dlc_protocol::EngineCommand::SetChannel {
            universe,
            channel,
            value,
        } => {
            assert_eq!(universe, 1);
            assert_eq!(channel, 0);
            assert_eq!(value, 255);
        }
        other => panic!("expected SetChannel, got {other:?}"),
    }
}

#[tokio::test]
async fn set_channel_invalid_channel() {
    let (state, _rx) = spawn_test_state_with_receiver().await;
    let app = routes::build_api_router(state);

    let resp = send(
        &app,
        Method::PUT,
        "/api/universes/1/channels/512",
        Some(r#"{"value":0}"#),
    )
    .await;

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn set_channel_missing_value() {
    let (state, _rx) = spawn_test_state_with_receiver().await;
    let app = routes::build_api_router(state);

    let resp = send(
        &app,
        Method::PUT,
        "/api/universes/1/channels/0",
        Some(r#"{}"#),
    )
    .await;

    // axum returns 422 for deserialization errors
    assert_eq!(resp.status(), StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn set_channel_response_body() {
    let (state, _rx) = spawn_test_state_with_receiver().await;
    let app = routes::build_api_router(state);

    let resp = send(
        &app,
        Method::PUT,
        "/api/universes/1/channels/100",
        Some(r#"{"value":128}"#),
    )
    .await;

    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    let bytes = http_body_util::BodyExt::collect(resp.into_body()).await.unwrap().to_bytes();
    assert!(bytes.is_empty());
}
