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
    pub cue_id: String,
}

#[derive(Deserialize)]
pub struct FireBody {
    pub cue_id: Option<String>,
}

pub async fn go(
    State(state): State<AppState>,
    Path(cue_list_id): Path<String>,
    body: Option<Json<FireBody>>,
) -> Result<Json<GoResponse>, ApiError> {
    let cue_id = match body.and_then(|b| b.cue_id.clone()) {
        Some(id) => {
            state
                .cue_executor
                .fire(&id)
                .await
                .map_err(cue_error_to_api)?;
            id
        }
        None => state
            .cue_executor
            .go(&cue_list_id)
            .await
            .map_err(cue_error_to_api)?,
    };
    Ok(Json(GoResponse { cue_id }))
}

pub async fn stop(
    State(state): State<AppState>,
    Path(cue_list_id): Path<String>,
) -> Result<StatusCode, ApiError> {
    state.cue_executor.stop(&cue_list_id).await;
    Ok(StatusCode::NO_CONTENT)
}

fn cue_error_to_api(e: CueError) -> ApiError {
    match &e {
        CueError::CueNotFound(_) | CueError::PresetNotFound(_) | CueError::FixtureNotFound(_) => {
            ApiError::not_found(e.to_string())
        }
        CueError::NoCuesInList => ApiError::bad_request(e.to_string()),
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
        body_json, create_cue_list, create_show, json_request, spawn_test_state,
    };

    async fn create_preset(app: &axum::Router, show_id: &str) -> String {
        let body = serde_json::json!({
            "show_id": show_id,
            "name": "Red Wash",
            "fixture_type": "moving_head",
            "mode": "sevenChannel",
            "values": {"dimmer": 255, "color": "#ff0000"}
        })
        .to_string();

        let resp = app
            .clone()
            .oneshot(json_request(Method::POST, "/api/presets", Some(&body)))
            .await
            .unwrap();
        body_json(resp).await["id"]
            .as_str()
            .unwrap()
            .to_string()
    }

    async fn create_cue(
        app: &axum::Router,
        cue_list_id: &str,
        cue_number: f64,
        preset_id: &str,
    ) -> String {
        let body = serde_json::json!({
            "cue_number": cue_number,
            "label": format!("Cue {cue_number}"),
            "fade_up_ms": 1000,
            "fade_down_ms": 500,
            "preset_refs": [{
                "preset_id": preset_id,
                "targets": [{"universe": 1, "start_channel": 1}]
            }]
        })
        .to_string();

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/cuelists/{cue_list_id}/cues"),
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
        crate::routes::library::seed_fixture_library(&state.db)
            .await
            .unwrap();
        let app = routes::build_router(state);

        let show_id = create_show(&app, "Show").await;
        let cl_id = create_cue_list(&app, &show_id, "Main").await;
        let preset_id = create_preset(&app, &show_id).await;
        let cue_id = create_cue(&app, &cl_id, 1.0, &preset_id).await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/cuelists/{cl_id}/go"),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let body = body_json(resp).await;
        assert_eq!(body["cue_id"], cue_id);
    }

    #[tokio::test]
    async fn go_advances_through_cues() {
        let state = spawn_test_state().await;
        crate::routes::library::seed_fixture_library(&state.db)
            .await
            .unwrap();
        let app = routes::build_router(state);

        let show_id = create_show(&app, "Show").await;
        let cl_id = create_cue_list(&app, &show_id, "Main").await;
        let preset_id = create_preset(&app, &show_id).await;
        let cue1_id = create_cue(&app, &cl_id, 1.0, &preset_id).await;
        let cue2_id = create_cue(&app, &cl_id, 2.0, &preset_id).await;

        // First go → cue 1
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/cuelists/{cl_id}/go"),
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
                &format!("/api/cuelists/{cl_id}/go"),
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

        let show_id = create_show(&app, "Show").await;
        let cl_id = create_cue_list(&app, &show_id, "Empty").await;

        let resp = app
            .oneshot(json_request(
                Method::POST,
                &format!("/api/cuelists/{cl_id}/go"),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn go_with_specific_cue_id() {
        let state = spawn_test_state().await;
        crate::routes::library::seed_fixture_library(&state.db)
            .await
            .unwrap();
        let app = routes::build_router(state);

        let show_id = create_show(&app, "Show").await;
        let cl_id = create_cue_list(&app, &show_id, "Main").await;
        let preset_id = create_preset(&app, &show_id).await;
        let _cue1_id = create_cue(&app, &cl_id, 1.0, &preset_id).await;
        let cue2_id = create_cue(&app, &cl_id, 2.0, &preset_id).await;

        let body = serde_json::json!({"cue_id": cue2_id}).to_string();
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/cuelists/{cl_id}/go"),
                Some(&body),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(body_json(resp).await["cue_id"], cue2_id);
    }

    #[tokio::test]
    async fn stop_returns_no_content() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let show_id = create_show(&app, "Show").await;
        let cl_id = create_cue_list(&app, &show_id, "Main").await;

        let resp = app
            .oneshot(json_request(
                Method::POST,
                &format!("/api/cuelists/{cl_id}/stop"),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    }
}
