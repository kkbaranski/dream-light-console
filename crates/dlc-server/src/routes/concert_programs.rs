use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::db::{default_json_array, delete_or_not_found, fetch_or_not_found};
use crate::error::ApiError;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ConcertProgram {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tags_json: String,
    pub entries_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreateConcertProgram {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_json_array")]
    pub tags_json: String,
    #[serde(default = "default_json_array")]
    pub entries_json: String,
}

#[derive(Deserialize)]
pub struct UpdateConcertProgram {
    pub name: Option<String>,
    pub description: Option<String>,
    pub tags_json: Option<String>,
    pub entries_json: Option<String>,
}

const SELECT: &str = "SELECT id, name, description, tags_json, entries_json, created_at, updated_at FROM concert_programs";

pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<ConcertProgram>>, ApiError> {
    let rows = sqlx::query_as::<_, ConcertProgram>(&format!("{SELECT} ORDER BY name"))
        .fetch_all(&state.db)
        .await?;
    Ok(Json(rows))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ConcertProgram>, ApiError> {
    let row: ConcertProgram = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "concert program",
    )
    .await?;
    Ok(Json(row))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateConcertProgram>,
) -> Result<(StatusCode, Json<ConcertProgram>), ApiError> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO concert_programs (id, name, description, tags_json, entries_json) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(&body.tags_json)
    .bind(&body.entries_json)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, ConcertProgram>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateConcertProgram>,
) -> Result<Json<ConcertProgram>, ApiError> {
    let current: ConcertProgram = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "concert program",
    )
    .await?;

    let name = body.name.unwrap_or(current.name);
    let description = body.description.unwrap_or(current.description);
    let tags_json = body.tags_json.unwrap_or(current.tags_json);
    let entries_json = body.entries_json.unwrap_or(current.entries_json);

    sqlx::query(
        "UPDATE concert_programs SET name = ?, description = ?, tags_json = ?, entries_json = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(&name)
    .bind(&description)
    .bind(&tags_json)
    .bind(&entries_json)
    .bind(&id)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, ConcertProgram>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    delete_or_not_found(
        "DELETE FROM concert_programs WHERE id = ?",
        &id,
        &state.db,
        "concert program",
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
