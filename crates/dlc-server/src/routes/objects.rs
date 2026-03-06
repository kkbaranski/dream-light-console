use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::db::{delete_or_not_found, fetch_or_not_found};
use crate::error::ApiError;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct StageObject {
    pub id: String,
    pub stage_id: String,
    pub name: String,
    pub object_type: String,
    pub position_json: String,
    pub dimensions_json: String,
    pub model_ref: String,
}

#[derive(Deserialize)]
pub struct CreateStageObject {
    pub object_type: String,
    #[serde(default)]
    pub name: String,
    #[serde(default = "default_position")]
    pub position_json: String,
    #[serde(default = "default_dimensions")]
    pub dimensions_json: String,
    #[serde(default)]
    pub model_ref: String,
}

fn default_position() -> String { r#"{"x":0,"y":0,"z":0}"#.to_string() }
fn default_dimensions() -> String { "{}".to_string() }

#[derive(Deserialize)]
pub struct UpdateStageObject {
    pub name: Option<String>,
    pub object_type: Option<String>,
    pub position_json: Option<String>,
    pub dimensions_json: Option<String>,
    pub model_ref: Option<String>,
}

const SELECT: &str = "SELECT id, stage_id, name, object_type, position_json, dimensions_json, model_ref FROM stage_objects";

pub async fn list(
    State(state): State<AppState>,
    Path(stage_id): Path<String>,
) -> Result<Json<Vec<StageObject>>, ApiError> {
    let rows = sqlx::query_as::<_, StageObject>(&format!(
        "{SELECT} WHERE stage_id = ? ORDER BY name"
    ))
    .bind(&stage_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn get(
    State(state): State<AppState>,
    Path((_stage_id, id)): Path<(String, String)>,
) -> Result<Json<StageObject>, ApiError> {
    let row: StageObject = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "stage object",
    )
    .await?;
    Ok(Json(row))
}

pub async fn create(
    State(state): State<AppState>,
    Path(stage_id): Path<String>,
    Json(body): Json<CreateStageObject>,
) -> Result<(StatusCode, Json<StageObject>), ApiError> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO stage_objects (id, stage_id, name, object_type, position_json, dimensions_json, model_ref) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&stage_id)
    .bind(&body.name)
    .bind(&body.object_type)
    .bind(&body.position_json)
    .bind(&body.dimensions_json)
    .bind(&body.model_ref)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, StageObject>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

/// Bulk PUT: replace all objects for a stage (frontend compat).
pub async fn put_bulk(
    State(state): State<AppState>,
    Path(stage_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ApiError> {
    sqlx::query("DELETE FROM stage_objects WHERE stage_id = ?")
        .bind(&stage_id)
        .execute(&state.db)
        .await?;

    if let Some(arr) = body.as_array() {
        for obj in arr {
            let id = obj["id"]
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let name = obj["name"].as_str().unwrap_or("");
            let object_type = obj["object_type"]
                .as_str()
                .or_else(|| obj["type"].as_str())
                .unwrap_or("");
            let position_json = obj
                .get("position_json")
                .map(|v| v.to_string())
                .unwrap_or_else(|| r#"{"x":0,"y":0,"z":0}"#.to_string());
            let dimensions_json = obj
                .get("dimensions_json")
                .map(|v| v.to_string())
                .unwrap_or_else(|| "{}".to_string());
            let model_ref = obj["model_ref"].as_str().unwrap_or("");

            sqlx::query(
                "INSERT INTO stage_objects (id, stage_id, name, object_type, position_json, dimensions_json, model_ref) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(&stage_id)
            .bind(name)
            .bind(object_type)
            .bind(&position_json)
            .bind(&dimensions_json)
            .bind(model_ref)
            .execute(&state.db)
            .await?;
        }
    }

    Ok(Json(serde_json::json!({ "saved": true })))
}

pub async fn update(
    State(state): State<AppState>,
    Path((_stage_id, id)): Path<(String, String)>,
    Json(body): Json<UpdateStageObject>,
) -> Result<Json<StageObject>, ApiError> {
    let current: StageObject = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "stage object",
    )
    .await?;

    let name = body.name.unwrap_or(current.name);
    let object_type = body.object_type.unwrap_or(current.object_type);
    let position_json = body.position_json.unwrap_or(current.position_json);
    let dimensions_json = body.dimensions_json.unwrap_or(current.dimensions_json);
    let model_ref = body.model_ref.unwrap_or(current.model_ref);

    sqlx::query(
        "UPDATE stage_objects SET name = ?, object_type = ?, position_json = ?, dimensions_json = ?, model_ref = ? WHERE id = ?",
    )
    .bind(&name)
    .bind(&object_type)
    .bind(&position_json)
    .bind(&dimensions_json)
    .bind(&model_ref)
    .bind(&id)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, StageObject>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    Path((_stage_id, id)): Path<(String, String)>,
) -> Result<StatusCode, ApiError> {
    delete_or_not_found("DELETE FROM stage_objects WHERE id = ?", &id, &state.db, "stage object").await?;
    Ok(StatusCode::NO_CONTENT)
}
