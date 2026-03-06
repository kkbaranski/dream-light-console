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
pub struct Stage {
    pub id: String,
    pub name: String,
    pub location_name: String,
    pub location_address: String,
    pub dimensions_json: String,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreateStage {
    pub name: String,
    #[serde(default)]
    pub location_name: String,
    #[serde(default)]
    pub location_address: String,
    #[serde(default = "default_dimensions")]
    pub dimensions_json: String,
    #[serde(default)]
    pub notes: String,
}

fn default_dimensions() -> String { "{}".to_string() }

#[derive(Deserialize)]
pub struct UpdateStage {
    pub name: Option<String>,
    pub location_name: Option<String>,
    pub location_address: Option<String>,
    pub dimensions_json: Option<String>,
    pub notes: Option<String>,
}

const SELECT: &str = "SELECT id, name, location_name, location_address, dimensions_json, notes, created_at, updated_at FROM stages";

pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<Stage>>, ApiError> {
    let rows = sqlx::query_as::<_, Stage>(&format!("{SELECT} ORDER BY created_at"))
        .fetch_all(&state.db)
        .await?;
    Ok(Json(rows))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Stage>, ApiError> {
    let row: Stage = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "stage",
    )
    .await?;
    Ok(Json(row))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateStage>,
) -> Result<(StatusCode, Json<Stage>), ApiError> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO stages (id, name, location_name, location_address, dimensions_json, notes) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.name)
    .bind(&body.location_name)
    .bind(&body.location_address)
    .bind(&body.dimensions_json)
    .bind(&body.notes)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Stage>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateStage>,
) -> Result<Json<Stage>, ApiError> {
    let current: Stage = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "stage",
    )
    .await?;

    let name = body.name.unwrap_or(current.name);
    let location_name = body.location_name.unwrap_or(current.location_name);
    let location_address = body.location_address.unwrap_or(current.location_address);
    let dimensions_json = body.dimensions_json.unwrap_or(current.dimensions_json);
    let notes = body.notes.unwrap_or(current.notes);

    sqlx::query(
        "UPDATE stages SET name = ?, location_name = ?, location_address = ?, dimensions_json = ?, notes = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(&name)
    .bind(&location_name)
    .bind(&location_address)
    .bind(&dimensions_json)
    .bind(&notes)
    .bind(&id)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Stage>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    delete_or_not_found("DELETE FROM stages WHERE id = ?", &id, &state.db, "stage").await?;
    Ok(StatusCode::NO_CONTENT)
}
