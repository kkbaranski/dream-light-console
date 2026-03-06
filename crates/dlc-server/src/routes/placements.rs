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
pub struct Placement {
    pub id: String,
    pub stage_id: String,
    pub fixture_id: String,
    pub universe: i64,
    pub dmx_address: i64,
    pub position_json: String,
    pub orientation_json: String,
    pub label_override: String,
}

#[derive(Deserialize)]
pub struct CreatePlacement {
    pub fixture_id: String,
    #[serde(default = "default_universe")]
    pub universe: i64,
    #[serde(default = "default_dmx_address")]
    pub dmx_address: i64,
    #[serde(default = "default_position")]
    pub position_json: String,
    #[serde(default = "default_orientation")]
    pub orientation_json: String,
    #[serde(default)]
    pub label_override: String,
}

fn default_universe() -> i64 { 1 }
fn default_dmx_address() -> i64 { 1 }
fn default_position() -> String { r#"{"x":0,"y":0,"z":0}"#.to_string() }
fn default_orientation() -> String { r#"{"x":0,"y":0,"z":0}"#.to_string() }

#[derive(Deserialize)]
pub struct UpdatePlacement {
    pub fixture_id: Option<String>,
    pub universe: Option<i64>,
    pub dmx_address: Option<i64>,
    pub position_json: Option<String>,
    pub orientation_json: Option<String>,
    pub label_override: Option<String>,
}

const SELECT: &str = "SELECT id, stage_id, fixture_id, universe, dmx_address, position_json, orientation_json, label_override FROM fixture_placements";

pub async fn list(
    State(state): State<AppState>,
    Path(stage_id): Path<String>,
) -> Result<Json<Vec<Placement>>, ApiError> {
    let rows = sqlx::query_as::<_, Placement>(&format!(
        "{SELECT} WHERE stage_id = ? ORDER BY dmx_address"
    ))
    .bind(&stage_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn get(
    State(state): State<AppState>,
    Path((_stage_id, id)): Path<(String, String)>,
) -> Result<Json<Placement>, ApiError> {
    let row: Placement = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "placement",
    )
    .await?;
    Ok(Json(row))
}

pub async fn create(
    State(state): State<AppState>,
    Path(stage_id): Path<String>,
    Json(body): Json<CreatePlacement>,
) -> Result<(StatusCode, Json<Placement>), ApiError> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO fixture_placements (id, stage_id, fixture_id, universe, dmx_address, position_json, orientation_json, label_override) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&stage_id)
    .bind(&body.fixture_id)
    .bind(body.universe)
    .bind(body.dmx_address)
    .bind(&body.position_json)
    .bind(&body.orientation_json)
    .bind(&body.label_override)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Placement>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update(
    State(state): State<AppState>,
    Path((_stage_id, id)): Path<(String, String)>,
    Json(body): Json<UpdatePlacement>,
) -> Result<Json<Placement>, ApiError> {
    let current: Placement = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "placement",
    )
    .await?;

    let fixture_id = body.fixture_id.unwrap_or(current.fixture_id);
    let universe = body.universe.unwrap_or(current.universe);
    let dmx_address = body.dmx_address.unwrap_or(current.dmx_address);
    let position_json = body.position_json.unwrap_or(current.position_json);
    let orientation_json = body.orientation_json.unwrap_or(current.orientation_json);
    let label_override = body.label_override.unwrap_or(current.label_override);

    sqlx::query(
        "UPDATE fixture_placements SET fixture_id = ?, universe = ?, dmx_address = ?, position_json = ?, orientation_json = ?, label_override = ? WHERE id = ?",
    )
    .bind(&fixture_id)
    .bind(universe)
    .bind(dmx_address)
    .bind(&position_json)
    .bind(&orientation_json)
    .bind(&label_override)
    .bind(&id)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Placement>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    Path((_stage_id, id)): Path<(String, String)>,
) -> Result<StatusCode, ApiError> {
    delete_or_not_found("DELETE FROM fixture_placements WHERE id = ?", &id, &state.db, "placement").await?;
    Ok(StatusCode::NO_CONTENT)
}
