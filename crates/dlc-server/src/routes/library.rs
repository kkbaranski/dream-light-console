use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct LibraryEntry {
    pub id: String,
    pub label: String,
    pub source: String,
    pub definition_json: String,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateEntry {
    pub id: String,
    pub label: String,
    pub definition_json: serde_json::Value,
}

const SELECT: &str =
    "SELECT id, label, source, definition_json, created_at FROM fixture_library";

pub async fn list(State(state): State<AppState>) -> impl IntoResponse {
    match sqlx::query_as::<_, LibraryEntry>(&format!("{SELECT} ORDER BY created_at"))
        .fetch_all(&state.db)
        .await
    {
        Ok(rows) => Json(rows).into_response(),
        Err(e) => {
            tracing::error!("list library: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateEntry>,
) -> impl IntoResponse {
    let json_str = serde_json::to_string(&body.definition_json).unwrap();

    let result = sqlx::query(
        "INSERT INTO fixture_library (id, label, source, definition_json) VALUES (?, ?, 'custom', ?)",
    )
    .bind(&body.id)
    .bind(&body.label)
    .bind(&json_str)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            let row =
                sqlx::query_as::<_, LibraryEntry>(&format!("{SELECT} WHERE id = ?"))
                    .bind(&body.id)
                    .fetch_one(&state.db)
                    .await
                    .unwrap();
            (StatusCode::CREATED, Json(row)).into_response()
        }
        Err(e) => {
            tracing::error!("create library entry: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match sqlx::query("DELETE FROM fixture_library WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
    {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND,
        Ok(_) => StatusCode::NO_CONTENT,
        Err(e) => {
            tracing::error!("delete library entry: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

// ── Seed logic ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct SeedEntry {
    id: String,
    label: String,
    definition_json: serde_json::Value,
}

pub async fn seed_fixture_library(db: &SqlitePool) -> anyhow::Result<()> {
    let json = include_str!("../../data/builtin-fixtures.json");
    let entries: Vec<SeedEntry> = serde_json::from_str(json)?;

    for entry in &entries {
        let def_str = serde_json::to_string(&entry.definition_json)?;
        sqlx::query(
            "INSERT INTO fixture_library (id, label, source, definition_json) VALUES (?, ?, 'builtin', ?)",
        )
        .bind(&entry.id)
        .bind(&entry.label)
        .bind(&def_str)
        .execute(db)
        .await?;
    }

    tracing::info!("Seeded {} built-in fixtures", entries.len());
    Ok(())
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
    use crate::state::AppState;

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
            .oneshot(json_request(Method::GET, "/api/fixtures/library", None))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let body = body_json(resp).await;
        assert_eq!(body, serde_json::json!([]));
    }

    #[tokio::test]
    async fn seed_populates_library() {
        let state = test_state().await;
        seed_fixture_library(&state.db).await.unwrap();
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(Method::GET, "/api/fixtures/library", None))
            .await
            .unwrap();

        let body = body_json(resp).await;
        let arr = body.as_array().unwrap();
        assert_eq!(arr.len(), 11);
        assert_eq!(arr[0]["id"], "moving_head");
        assert_eq!(arr[0]["source"], "builtin");

        // definition_json is a string containing valid JSON
        let def_str = arr[0]["definition_json"].as_str().unwrap();
        let def: serde_json::Value = serde_json::from_str(def_str).unwrap();
        assert_eq!(def["label"], "Moving Head");
    }

    #[tokio::test]
    async fn create_custom_entry() {
        let state = test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                "/api/fixtures/library",
                Some(r#"{"id":"custom_par","label":"Custom PAR","definition_json":{"label":"Custom PAR","modelPath":"/models/par.glb"}}"#),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::CREATED);
        let body = body_json(resp).await;
        assert_eq!(body["id"], "custom_par");
        assert_eq!(body["label"], "Custom PAR");
        assert_eq!(body["source"], "custom");

        // Appears in list
        let resp = app
            .oneshot(json_request(Method::GET, "/api/fixtures/library", None))
            .await
            .unwrap();
        let list = body_json(resp).await;
        assert_eq!(list.as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn delete_entry() {
        let state = test_state().await;
        seed_fixture_library(&state.db).await.unwrap();
        let app = routes::build_router(state);

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::DELETE,
                "/api/fixtures/library/moving_head",
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);

        // List should have one fewer
        let resp = app
            .oneshot(json_request(Method::GET, "/api/fixtures/library", None))
            .await
            .unwrap();
        let list = body_json(resp).await;
        assert_eq!(list.as_array().unwrap().len(), 10);
    }

    #[tokio::test]
    async fn delete_not_found() {
        let state = test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(
                Method::DELETE,
                "/api/fixtures/library/nonexistent",
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
}
