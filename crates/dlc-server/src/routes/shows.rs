use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

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

pub async fn list(State(state): State<AppState>) -> impl IntoResponse {
    match sqlx::query_as::<_, Show>(
        "SELECT id, name, created_at, updated_at FROM shows ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => Json(rows).into_response(),
        Err(e) => {
            tracing::error!("list shows: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match sqlx::query_as::<_, Show>(
        "SELECT id, name, created_at, updated_at FROM shows WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(row)) => Json(row).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            tracing::error!("get show: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateShow>,
) -> impl IntoResponse {
    let id = Uuid::new_v4().to_string();
    let result = sqlx::query("INSERT INTO shows (id, name) VALUES (?, ?)")
        .bind(&id)
        .bind(&body.name)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => {
            let row = sqlx::query_as::<_, Show>(
                "SELECT id, name, created_at, updated_at FROM shows WHERE id = ?",
            )
            .bind(&id)
            .fetch_one(&state.db)
            .await
            .unwrap();
            (StatusCode::CREATED, Json(row)).into_response()
        }
        Err(e) => {
            tracing::error!("create show: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateShow>,
) -> impl IntoResponse {
    let result =
        sqlx::query("UPDATE shows SET name = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(&body.name)
            .bind(&id)
            .execute(&state.db)
            .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => {
            let row = sqlx::query_as::<_, Show>(
                "SELECT id, name, created_at, updated_at FROM shows WHERE id = ?",
            )
            .bind(&id)
            .fetch_one(&state.db)
            .await
            .unwrap();
            Json(row).into_response()
        }
        Err(e) => {
            tracing::error!("update show: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match sqlx::query("DELETE FROM shows WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
    {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND,
        Ok(_) => StatusCode::NO_CONTENT,
        Err(e) => {
            tracing::error!("delete show: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Method, Request, StatusCode},
    };
    use http_body_util::BodyExt;
    use sqlx::sqlite::SqlitePoolOptions;
    use tower::ServiceExt;

    use super::*;
    use crate::config::ServerConfig;
    use crate::routes;

    async fn test_state() -> AppState {
        let db = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&db)
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&db).await.unwrap();
        AppState {
            config: std::sync::Arc::new(ServerConfig::from_env()),
            db,
        }
    }

    fn json_request(method: Method, uri: &str, body: Option<&str>) -> Request<Body> {
        let mut builder = Request::builder().method(method).uri(uri);
        if body.is_some() {
            builder = builder.header("content-type", "application/json");
        }
        builder
            .body(Body::from(body.unwrap_or("").to_string()))
            .unwrap()
    }

    async fn body_json(resp: axum::response::Response) -> serde_json::Value {
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn list_empty() {
        let state = test_state().await;
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
        let state = test_state().await;
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
        let state = test_state().await;
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
        let state = test_state().await;
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
        let state = test_state().await;
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
        let state = test_state().await;
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
        let state = test_state().await;
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
        let state = test_state().await;
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
