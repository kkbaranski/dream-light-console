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
