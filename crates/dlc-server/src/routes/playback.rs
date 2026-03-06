use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::cue_executor::CueError;
use crate::error::ApiError;
use crate::state::AppState;

#[derive(Serialize)]
pub struct GoResponse {
    pub cue_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_of_list: Option<bool>,
}

#[derive(Deserialize)]
pub struct FireBody {
    pub cue_id: Option<String>,
}

pub async fn go(
    State(state): State<AppState>,
    Path((_concert_id, cue_list_id)): Path<(String, String)>,
    body: Option<Json<FireBody>>,
) -> Result<Json<GoResponse>, ApiError> {
    match body.and_then(|b| b.cue_id.clone()) {
        Some(id) => {
            state
                .cue_executor
                .fire(&id)
                .await
                .map_err(cue_error_to_api)?;
            Ok(Json(GoResponse {
                cue_id: Some(id),
                end_of_list: None,
            }))
        }
        None => match state.cue_executor.go(&cue_list_id).await {
            Ok(cue_id) => Ok(Json(GoResponse {
                cue_id: Some(cue_id),
                end_of_list: None,
            })),
            Err(CueError::EndOfList) => Ok(Json(GoResponse {
                cue_id: None,
                end_of_list: Some(true),
            })),
            Err(e) => Err(cue_error_to_api(e)),
        },
    }
}

pub async fn stop(
    State(state): State<AppState>,
    Path((_concert_id, cue_list_id)): Path<(String, String)>,
) -> Result<StatusCode, ApiError> {
    state.cue_executor.stop(&cue_list_id).await;
    Ok(StatusCode::NO_CONTENT)
}

fn cue_error_to_api(e: CueError) -> ApiError {
    match &e {
        CueError::CueNotFound(_) | CueError::FixtureNotFound(_) => {
            ApiError::not_found(e.to_string())
        }
        CueError::NoCuesInList => ApiError::bad_request(e.to_string()),
        CueError::EndOfList => ApiError::bad_request(e.to_string()),
        CueError::Database(_) | CueError::InvalidJson(_) => {
            ApiError::Internal(e.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use tower::ServiceExt;

    use crate::routes;
    use crate::test_helpers::{
        body_json, create_concert, create_cue_list, create_stage, json_request, spawn_test_state,
    };

    async fn create_cue(
        app: &axum::Router,
        concert_id: &str,
        cue_list_id: &str,
        number: f64,
    ) -> String {
        let body = serde_json::json!({
            "number": number,
            "name": format!("Cue {number}"),
            "fade_time_ms": 1000,
            "scene_json": {
                "fixtures": [{
                    "fixture_type_id": "moving_head",
                    "dmx_mode": "sevenChannel",
                    "universe": 1,
                    "dmx_address": 1,
                    "values": {"dimmer": 255}
                }]
            }
        })
        .to_string();

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/concerts/{concert_id}/cue-lists/{cue_list_id}/cues"),
                Some(&body),
            ))
            .await
            .unwrap();
        body_json(resp).await["id"]
            .as_str()
            .unwrap()
            .to_string()
    }

    #[tokio::test]
    async fn go_fires_first_cue() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;
        let cue_list_id = create_cue_list(&app, &concert_id,"Main").await;
        let cue_id = create_cue(&app, &concert_id, &cue_list_id, 1.0).await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/concerts/{concert_id}/cue-lists/{cue_list_id}/go"),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(body_json(resp).await["cue_id"], cue_id);
    }

    #[tokio::test]
    async fn go_advances_through_cues() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;
        let cue_list_id = create_cue_list(&app, &concert_id,"Main").await;
        let cue1_id = create_cue(&app, &concert_id, &cue_list_id, 1.0).await;
        let cue2_id = create_cue(&app, &concert_id, &cue_list_id, 2.0).await;

        // First go → cue 1
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/concerts/{concert_id}/cue-lists/{cue_list_id}/go"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(body_json(resp).await["cue_id"], cue1_id);

        // Second go → cue 2
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/concerts/{concert_id}/cue-lists/{cue_list_id}/go"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(body_json(resp).await["cue_id"], cue2_id);
    }

    #[tokio::test]
    async fn go_empty_list_returns_error() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;
        let cue_list_id = create_cue_list(&app, &concert_id,"Empty").await;

        let resp = app
            .oneshot(json_request(
                Method::POST,
                &format!("/api/concerts/{concert_id}/cue-lists/{cue_list_id}/go"),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn stop_returns_no_content() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;
        let cue_list_id = create_cue_list(&app, &concert_id,"Main").await;

        let resp = app
            .oneshot(json_request(
                Method::POST,
                &format!("/api/concerts/{concert_id}/cue-lists/{cue_list_id}/stop"),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    }
}
