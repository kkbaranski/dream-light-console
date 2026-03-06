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

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use tower::ServiceExt;

    use crate::routes;
    use crate::test_helpers::{
        body_json, create_concert, create_cue_list, create_stage, json_request, spawn_test_state,
    };

    #[tokio::test]
    async fn list_empty() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;

        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/concerts/{concert_id}/cue-lists"),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(body_json(resp).await, serde_json::json!([]));
    }

    #[tokio::test]
    async fn create_and_list() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/concerts/{concert_id}/cue-lists"),
                Some(r#"{"name":"Main"}"#),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::CREATED);
        let created = body_json(resp).await;
        assert_eq!(created["name"], "Main");
        assert_eq!(created["concert_id"], concert_id);

        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/concerts/{concert_id}/cue-lists"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(body_json(resp).await.as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn update_cue_list() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;
        let cl_id = create_cue_list(&app, &concert_id, "Original").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PUT,
                &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}"),
                Some(r#"{"name":"Renamed"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(body_json(resp).await["name"], "Renamed");
    }

    #[tokio::test]
    async fn delete_cue_list() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;
        let cl_id = create_cue_list(&app, &concert_id, "To Delete").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn cascade_delete_with_concert() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;
        create_cue_list(&app, &concert_id, "CL").await;

        app.clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/concerts/{concert_id}"),
                None,
            ))
            .await
            .unwrap();

        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/concerts/{concert_id}/cue-lists"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(body_json(resp).await.as_array().unwrap().len(), 0);
    }
}
