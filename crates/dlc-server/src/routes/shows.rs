use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::error::ApiError;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Show {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreateShow {
    pub name: String,
}

#[derive(Deserialize)]
pub struct UpdateShow {
    pub name: String,
}

pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<Show>>, ApiError> {
    let rows = sqlx::query_as::<_, Show>(
        "SELECT id, name, created_at, updated_at FROM shows ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Show>, ApiError> {
    let row = sqlx::query_as::<_, Show>(
        "SELECT id, name, created_at, updated_at FROM shows WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::not_found("show not found"))?;
    Ok(Json(row))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateShow>,
) -> Result<(StatusCode, Json<Show>), ApiError> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO shows (id, name) VALUES (?, ?)")
        .bind(&id)
        .bind(&body.name)
        .execute(&state.db)
        .await?;
    let row = sqlx::query_as::<_, Show>(
        "SELECT id, name, created_at, updated_at FROM shows WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateShow>,
) -> Result<Json<Show>, ApiError> {
    let result =
        sqlx::query("UPDATE shows SET name = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(&body.name)
            .bind(&id)
            .execute(&state.db)
            .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("show not found"));
    }
    let row = sqlx::query_as::<_, Show>(
        "SELECT id, name, created_at, updated_at FROM shows WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let result = sqlx::query("DELETE FROM shows WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("show not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use tower::ServiceExt;

    use crate::routes;
    use crate::test_helpers::{body_json, json_request, spawn_test_state};

    #[tokio::test]
    async fn list_empty() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(Method::GET, "/api/shows", None))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let body = body_json(resp).await;
        assert_eq!(body, serde_json::json!([]));
    }

    #[tokio::test]
    async fn create_and_get() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        // Create
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                "/api/shows",
                Some(r#"{"name":"My Show"}"#),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::CREATED);
        let created = body_json(resp).await;
        assert_eq!(created["name"], "My Show");
        let id = created["id"].as_str().unwrap();
        assert!(!id.is_empty());

        // Get by ID
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::GET,
                &format!("/api/shows/{id}"),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let fetched = body_json(resp).await;
        assert_eq!(fetched["name"], "My Show");
        assert_eq!(fetched["id"], id);

        // List
        let resp = app
            .oneshot(json_request(Method::GET, "/api/shows", None))
            .await
            .unwrap();

        let list = body_json(resp).await;
        assert_eq!(list.as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn update_show() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                "/api/shows",
                Some(r#"{"name":"Original"}"#),
            ))
            .await
            .unwrap();
        let created = body_json(resp).await;
        let id = created["id"].as_str().unwrap();

        // Update
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PUT,
                &format!("/api/shows/{id}"),
                Some(r#"{"name":"Renamed"}"#),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let updated = body_json(resp).await;
        assert_eq!(updated["name"], "Renamed");
        assert_eq!(updated["id"], id);
    }

    #[tokio::test]
    async fn delete_show() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                "/api/shows",
                Some(r#"{"name":"To Delete"}"#),
            ))
            .await
            .unwrap();
        let created = body_json(resp).await;
        let id = created["id"].as_str().unwrap();

        // Delete
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/shows/{id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);

        // Verify gone
        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/shows/{id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn get_not_found() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(
                Method::GET,
                "/api/shows/nonexistent-id",
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn update_not_found() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(
                Method::PUT,
                "/api/shows/nonexistent-id",
                Some(r#"{"name":"Nope"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn delete_not_found() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(
                Method::DELETE,
                "/api/shows/nonexistent-id",
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn create_returns_uuid_id() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(
                Method::POST,
                "/api/shows",
                Some(r#"{"name":"UUID Test"}"#),
            ))
            .await
            .unwrap();
        let body = body_json(resp).await;
        let id = body["id"].as_str().unwrap();

        // Validate UUID v4 format
        assert!(uuid::Uuid::parse_str(id).is_ok());
    }
}
