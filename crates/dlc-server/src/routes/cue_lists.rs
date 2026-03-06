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
pub struct CueList {
    pub id: String,
    pub concert_id: String,
    pub name: String,
    pub program_entry_id: String,
    pub position: i64,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateCueList {
    pub name: String,
    #[serde(default)]
    pub program_entry_id: String,
    #[serde(default)]
    pub position: i64,
}

#[derive(Deserialize)]
pub struct UpdateCueList {
    pub name: Option<String>,
    pub program_entry_id: Option<String>,
    pub position: Option<i64>,
}

const SELECT: &str =
    "SELECT id, concert_id, name, program_entry_id, position, created_at FROM cue_lists";

pub async fn list(
    State(state): State<AppState>,
    Path(concert_id): Path<String>,
) -> Result<Json<Vec<CueList>>, ApiError> {
    let rows = sqlx::query_as::<_, CueList>(&format!(
        "{SELECT} WHERE concert_id = ? ORDER BY position, created_at"
    ))
    .bind(&concert_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn create(
    State(state): State<AppState>,
    Path(concert_id): Path<String>,
    Json(body): Json<CreateCueList>,
) -> Result<(StatusCode, Json<CueList>), ApiError> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO cue_lists (id, concert_id, name, program_entry_id, position) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&concert_id)
    .bind(&body.name)
    .bind(&body.program_entry_id)
    .bind(body.position)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, CueList>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update(
    State(state): State<AppState>,
    Path((_concert_id, id)): Path<(String, String)>,
    Json(body): Json<UpdateCueList>,
) -> Result<Json<CueList>, ApiError> {
    let current: CueList = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "cue list",
    )
    .await?;

    let name = body.name.unwrap_or(current.name);
    let program_entry_id = body.program_entry_id.unwrap_or(current.program_entry_id);
    let position = body.position.unwrap_or(current.position);

    sqlx::query(
        "UPDATE cue_lists SET name = ?, program_entry_id = ?, position = ? WHERE id = ?",
    )
    .bind(&name)
    .bind(&program_entry_id)
    .bind(position)
    .bind(&id)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, CueList>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    Path((_concert_id, id)): Path<(String, String)>,
) -> Result<StatusCode, ApiError> {
    delete_or_not_found("DELETE FROM cue_lists WHERE id = ?", &id, &state.db, "cue list").await?;
    Ok(StatusCode::NO_CONTENT)
}
