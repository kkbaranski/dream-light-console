use axum::{
    extract::{Path, State},
    Json,
};

use crate::error::ApiError;
use crate::state::AppState;

pub async fn list(State(state): State<AppState>) -> Json<Vec<serde_json::Value>> {
    let mut items: Vec<serde_json::Value> = state
        .fixture_types
        .values()
        .map(|ft| {
            serde_json::json!({
                "id": ft.id,
                "label": ft.label,
            })
        })
        .collect();
    items.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
    Json(items)
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let ft = state
        .fixture_types
        .get(&id)
        .ok_or_else(|| ApiError::not_found("fixture type not found"))?;
    Ok(Json(serde_json::json!({
        "id": ft.id,
        "label": ft.label,
        "definition": ft.definition,
    })))
}
