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
pub struct Concert {
    pub id: String,
    pub name: String,
    pub program_id: Option<String>,
    pub stage_id: String,
    pub date: String,
    pub status: String,
    pub performers_json: String,
    pub program_entries_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreateConcert {
    pub name: String,
    pub stage_id: String,
    pub program_id: Option<String>,
    #[serde(default)]
    pub date: String,
    #[serde(default = "default_json_array")]
    pub performers_json: String,
}

#[derive(Deserialize)]
pub struct UpdateConcert {
    pub name: Option<String>,
    pub stage_id: Option<String>,
    pub date: Option<String>,
    pub performers_json: Option<String>,
    pub program_entries_json: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateStatus {
    pub status: String,
}

const SELECT: &str = "SELECT id, name, program_id, stage_id, date, status, performers_json, program_entries_json, created_at, updated_at FROM concerts";

pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<Concert>>, ApiError> {
    let rows = sqlx::query_as::<_, Concert>(&format!("{SELECT} ORDER BY created_at DESC"))
        .fetch_all(&state.db)
        .await?;
    Ok(Json(rows))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Concert>, ApiError> {
    let row: Concert = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "concert",
    )
    .await?;
    Ok(Json(row))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateConcert>,
) -> Result<(StatusCode, Json<Concert>), ApiError> {
    let id = Uuid::new_v4().to_string();

    let program_entries_json = match &body.program_id {
        Some(program_id) => {
            let entries: Option<String> = sqlx::query_scalar(
                "SELECT entries_json FROM concert_programs WHERE id = ?",
            )
            .bind(program_id)
            .fetch_optional(&state.db)
            .await?;
            entries.unwrap_or_else(|| "[]".to_string())
        }
        None => "[]".to_string(),
    };

    sqlx::query(
        "INSERT INTO concerts (id, name, program_id, stage_id, date, performers_json, program_entries_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.name)
    .bind(&body.program_id)
    .bind(&body.stage_id)
    .bind(&body.date)
    .bind(&body.performers_json)
    .bind(&program_entries_json)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Concert>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateConcert>,
) -> Result<Json<Concert>, ApiError> {
    let current: Concert = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "concert",
    )
    .await?;

    let name = body.name.unwrap_or(current.name);
    let stage_id = body.stage_id.unwrap_or(current.stage_id);
    let date = body.date.unwrap_or(current.date);
    let performers_json = body.performers_json.unwrap_or(current.performers_json);
    let program_entries_json = body
        .program_entries_json
        .unwrap_or(current.program_entries_json);

    sqlx::query(
        "UPDATE concerts SET name = ?, stage_id = ?, date = ?, performers_json = ?, program_entries_json = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(&name)
    .bind(&stage_id)
    .bind(&date)
    .bind(&performers_json)
    .bind(&program_entries_json)
    .bind(&id)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Concert>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

/// Concert status transitions:
/// draft → rehearsal | ready
/// rehearsal → ready | draft
/// ready → live | draft
/// live → completed
/// completed → archived
pub async fn update_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateStatus>,
) -> Result<Json<Concert>, ApiError> {
    let current: Concert = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "concert",
    )
    .await?;

    let valid = match current.status.as_str() {
        "draft" => matches!(body.status.as_str(), "rehearsal" | "ready"),
        "rehearsal" => matches!(body.status.as_str(), "ready" | "draft"),
        "ready" => matches!(body.status.as_str(), "live" | "draft"),
        "live" => body.status == "completed",
        "completed" => body.status == "archived",
        _ => false,
    };

    if !valid {
        return Err(ApiError::bad_request(format!(
            "invalid status transition: {} → {}",
            current.status, body.status
        )));
    }

    sqlx::query("UPDATE concerts SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(&body.status)
        .bind(&id)
        .execute(&state.db)
        .await?;

    let row = sqlx::query_as::<_, Concert>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    delete_or_not_found("DELETE FROM concerts WHERE id = ?", &id, &state.db, "concert").await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use tower::ServiceExt;

    use crate::routes;
    use crate::test_helpers::{
        body_json, create_concert, create_stage, json_request, spawn_test_state,
    };

    #[tokio::test]
    async fn concert_crud() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::GET,
                &format!("/api/concerts/{concert_id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(body_json(resp).await["status"], "draft");

        let resp = app
            .clone()
            .oneshot(json_request(Method::GET, "/api/concerts", None))
            .await
            .unwrap();
        assert_eq!(body_json(resp).await.as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn status_transitions() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PATCH,
                &format!("/api/concerts/{concert_id}/status"),
                Some(r#"{"status":"rehearsal"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(body_json(resp).await["status"], "rehearsal");

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PATCH,
                &format!("/api/concerts/{concert_id}/status"),
                Some(r#"{"status":"ready"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(body_json(resp).await["status"], "ready");

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PATCH,
                &format!("/api/concerts/{concert_id}/status"),
                Some(r#"{"status":"live"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(body_json(resp).await["status"], "live");

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PATCH,
                &format!("/api/concerts/{concert_id}/status"),
                Some(r#"{"status":"completed"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(body_json(resp).await["status"], "completed");

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PATCH,
                &format!("/api/concerts/{concert_id}/status"),
                Some(r#"{"status":"archived"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(body_json(resp).await["status"], "archived");
    }

    #[tokio::test]
    async fn invalid_status_transition() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;

        let resp = app
            .oneshot(json_request(
                Method::PATCH,
                &format!("/api/concerts/{concert_id}/status"),
                Some(r#"{"status":"completed"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn create_concert_with_program_copies_entries() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                "/api/concert-programs",
                Some(r#"{"name":"Rock Set","entries_json":"[{\"song\":\"song1\"}]"}"#),
            ))
            .await
            .unwrap();
        let program_id = body_json(resp).await["id"].as_str().unwrap().to_string();

        let body = serde_json::json!({
            "name": "Saturday Show",
            "stage_id": stage_id,
            "program_id": program_id,
        })
        .to_string();
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                "/api/concerts",
                Some(&body),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
        let concert = body_json(resp).await;

        let entries: serde_json::Value =
            serde_json::from_str(concert["program_entries_json"].as_str().unwrap()).unwrap();
        assert_eq!(entries[0]["song"], "song1");
    }
}
