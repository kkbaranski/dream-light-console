use axum::{
    body::Bytes,
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
pub struct Fixture {
    pub id: String,
    pub fixture_type_id: String,
    pub dmx_mode: String,
    pub label: String,
    pub serial_number: String,
    pub notes: String,
    pub avatar_path: String,
    pub default_universe: i64,
    pub default_address: i64,
    pub config_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreateFixture {
    pub fixture_type_id: String,
    #[serde(default)]
    pub dmx_mode: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub serial_number: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default = "default_universe")]
    pub default_universe: i64,
    #[serde(default)]
    pub default_address: i64,
}

fn default_universe() -> i64 {
    1
}

#[derive(Deserialize)]
pub struct UpdateFixture {
    pub fixture_type_id: Option<String>,
    pub dmx_mode: Option<String>,
    pub label: Option<String>,
    pub serial_number: Option<String>,
    pub notes: Option<String>,
    pub default_universe: Option<i64>,
    pub default_address: Option<i64>,
    pub config_json: Option<String>,
}

const SELECT: &str = "SELECT id, fixture_type_id, dmx_mode, label, serial_number, notes, avatar_path, default_universe, default_address, config_json, created_at, updated_at FROM fixtures";

pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<Fixture>>, ApiError> {
    let rows = sqlx::query_as::<_, Fixture>(&format!("{SELECT} ORDER BY created_at"))
        .fetch_all(&state.db)
        .await?;
    Ok(Json(rows))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Fixture>, ApiError> {
    let row: Fixture = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "fixture",
    )
    .await?;
    Ok(Json(row))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateFixture>,
) -> Result<(StatusCode, Json<Fixture>), ApiError> {
    if !state.fixture_types.contains_key(&body.fixture_type_id) {
        return Err(ApiError::bad_request(format!(
            "unknown fixture type: {}",
            body.fixture_type_id
        )));
    }

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO fixtures (id, fixture_type_id, dmx_mode, label, serial_number, notes, default_universe, default_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.fixture_type_id)
    .bind(&body.dmx_mode)
    .bind(&body.label)
    .bind(&body.serial_number)
    .bind(&body.notes)
    .bind(body.default_universe)
    .bind(body.default_address)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Fixture>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateFixture>,
) -> Result<Json<Fixture>, ApiError> {
    let current: Fixture = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "fixture",
    )
    .await?;

    let fixture_type_id = body.fixture_type_id.unwrap_or(current.fixture_type_id);
    if !state.fixture_types.contains_key(&fixture_type_id) {
        return Err(ApiError::bad_request(format!(
            "unknown fixture type: {fixture_type_id}"
        )));
    }

    let dmx_mode = body.dmx_mode.unwrap_or(current.dmx_mode);
    let label = body.label.unwrap_or(current.label);
    let serial_number = body.serial_number.unwrap_or(current.serial_number);
    let notes = body.notes.unwrap_or(current.notes);
    let default_universe = body.default_universe.unwrap_or(current.default_universe);
    let default_address = body.default_address.unwrap_or(current.default_address);
    let config_json = body.config_json.unwrap_or(current.config_json);

    sqlx::query(
        "UPDATE fixtures SET fixture_type_id = ?, dmx_mode = ?, label = ?, serial_number = ?, notes = ?, default_universe = ?, default_address = ?, config_json = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(&fixture_type_id)
    .bind(&dmx_mode)
    .bind(&label)
    .bind(&serial_number)
    .bind(&notes)
    .bind(default_universe)
    .bind(default_address)
    .bind(&config_json)
    .bind(&id)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Fixture>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let placement_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM fixture_placements WHERE fixture_id = ?")
            .bind(&id)
            .fetch_one(&state.db)
            .await?;

    if placement_count.0 > 0 {
        return Err(ApiError::conflict(
            "fixture is referenced by one or more placements",
        ));
    }

    delete_or_not_found("DELETE FROM fixtures WHERE id = ?", &id, &state.db, "fixture").await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn upload_avatar(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Bytes,
) -> Result<Json<Fixture>, ApiError> {
    let _current: Fixture = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "fixture",
    )
    .await?;

    let filename = save_avatar(&id, &body)?;

    sqlx::query("UPDATE fixtures SET avatar_path = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(&filename)
        .bind(&id)
        .execute(&state.db)
        .await?;

    let row = sqlx::query_as::<_, Fixture>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

fn save_avatar(id: &str, body: &[u8]) -> Result<String, ApiError> {
    let img = image::load_from_memory(body)
        .map_err(|e| ApiError::bad_request(format!("invalid image: {e}")))?;
    let resized = img.resize_to_fill(512, 512, image::imageops::FilterType::Lanczos3);

    let avatars_dir = std::path::Path::new("data/avatars");
    std::fs::create_dir_all(avatars_dir)
        .map_err(|e| ApiError::Internal(format!("cannot create avatars directory: {e}")))?;

    let filename = format!("{id}.jpg");
    let file_path = avatars_dir.join(&filename);
    resized
        .save_with_format(&file_path, image::ImageFormat::Jpeg)
        .map_err(|e| ApiError::Internal(format!("cannot save avatar: {e}")))?;

    Ok(filename)
}

pub async fn delete_avatar(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Fixture>, ApiError> {
    let current: Fixture = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "fixture",
    )
    .await?;

    if !current.avatar_path.is_empty() {
        let file_path = std::path::Path::new("data/avatars").join(&current.avatar_path);
        let _ = std::fs::remove_file(file_path);
    }

    sqlx::query("UPDATE fixtures SET avatar_path = '', updated_at = datetime('now') WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await?;

    let row = sqlx::query_as::<_, Fixture>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use tower::ServiceExt;

    use crate::routes;
    use crate::test_helpers::{body_json, create_fixture, json_request, spawn_test_state};

    #[tokio::test]
    async fn create_and_get() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let fixture_id = create_fixture(&app, "moving_head").await;

        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/fixtures/{fixture_id}"),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let body = body_json(resp).await;
        assert_eq!(body["fixture_type_id"], "moving_head");
    }

    #[tokio::test]
    async fn create_invalid_type_returns_400() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(
                Method::POST,
                "/api/fixtures",
                Some(r#"{"fixture_type_id":"nonexistent"}"#),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn delete_unreferenced_fixture() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let fixture_id = create_fixture(&app, "moving_head").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/fixtures/{fixture_id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn delete_referenced_fixture_returns_409() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let fixture_id = create_fixture(&app, "moving_head").await;

        // Create a stage
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                "/api/stages",
                Some(r#"{"name":"Test Stage"}"#),
            ))
            .await
            .unwrap();
        let stage_id = body_json(resp).await["id"].as_str().unwrap().to_string();

        // Create a placement referencing the fixture
        let body = serde_json::json!({
            "fixture_id": fixture_id,
            "universe": 1,
            "dmx_address": 1
        })
        .to_string();
        app.clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/stages/{stage_id}/placements"),
                Some(&body),
            ))
            .await
            .unwrap();

        let resp = app
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/fixtures/{fixture_id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CONFLICT);
    }
}
