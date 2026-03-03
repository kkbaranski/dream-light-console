use axum::{
    extract::{Path, State},
    Json,
};

use crate::error::ApiError;
use crate::state::AppState;

pub async fn get(
    State(state): State<AppState>,
    Path(stage_id): Path<String>,
) -> Result<String, ApiError> {
    let json = sqlx::query_scalar::<_, String>(
        "SELECT objects_json FROM stage_objects WHERE stage_id = ?",
    )
    .bind(&stage_id)
    .fetch_optional(&state.db)
    .await?
    .unwrap_or_else(|| "[]".to_string());
    Ok(json)
}

pub async fn put(
    State(state): State<AppState>,
    Path(stage_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let json_str = serde_json::to_string(&body).unwrap();

    sqlx::query(
        "INSERT INTO stage_objects (stage_id, objects_json, updated_at) VALUES (?, ?, datetime('now')) \
         ON CONFLICT(stage_id) DO UPDATE SET objects_json = excluded.objects_json, updated_at = excluded.updated_at",
    )
    .bind(&stage_id)
    .bind(&json_str)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "saved": true })))
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
        let (engine_tx, _) = std::sync::mpsc::channel();
        AppState {
            config: std::sync::Arc::new(ServerConfig::from_env()),
            db,
            engine_tx,
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

    async fn create_show(app: &axum::Router, name: &str) -> String {
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                "/api/shows",
                Some(&format!(r#"{{"name":"{name}"}}"#)),
            ))
            .await
            .unwrap();
        let body = body_json(resp).await;
        body["id"].as_str().unwrap().to_string()
    }

    async fn create_stage(app: &axum::Router, show_id: &str, name: &str) -> String {
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/shows/{show_id}/stages"),
                Some(&format!(r#"{{"name":"{name}"}}"#)),
            ))
            .await
            .unwrap();
        let body = body_json(resp).await;
        body["id"].as_str().unwrap().to_string()
    }

    #[tokio::test]
    async fn get_empty_by_default() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;
        let stage_id = create_stage(&app, &show_id, "Stage").await;

        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/stages/{stage_id}/objects"),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let body = body_json(resp).await;
        assert_eq!(body, serde_json::json!([]));
    }

    #[tokio::test]
    async fn put_and_get() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;
        let stage_id = create_stage(&app, &show_id, "Stage").await;

        let objects = r#"[{"id":"obj-1","type":"moving_head","x":0,"y":3}]"#;
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PUT,
                &format!("/api/stages/{stage_id}/objects"),
                Some(objects),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let body = body_json(resp).await;
        assert_eq!(body["saved"], true);

        // Read back
        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/stages/{stage_id}/objects"),
                None,
            ))
            .await
            .unwrap();

        let body = body_json(resp).await;
        let arr = body.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["id"], "obj-1");
    }

    #[tokio::test]
    async fn put_replaces_previous() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;
        let stage_id = create_stage(&app, &show_id, "Stage").await;

        // First save
        app.clone()
            .oneshot(json_request(
                Method::PUT,
                &format!("/api/stages/{stage_id}/objects"),
                Some(r#"[{"id":"a"}]"#),
            ))
            .await
            .unwrap();

        // Second save replaces
        app.clone()
            .oneshot(json_request(
                Method::PUT,
                &format!("/api/stages/{stage_id}/objects"),
                Some(r#"[{"id":"b"},{"id":"c"}]"#),
            ))
            .await
            .unwrap();

        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/stages/{stage_id}/objects"),
                None,
            ))
            .await
            .unwrap();

        let body = body_json(resp).await;
        let arr = body.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["id"], "b");
    }

    #[tokio::test]
    async fn cascade_delete_with_stage() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;
        let stage_id = create_stage(&app, &show_id, "Stage").await;

        app.clone()
            .oneshot(json_request(
                Method::PUT,
                &format!("/api/stages/{stage_id}/objects"),
                Some(r#"[{"id":"obj-1"}]"#),
            ))
            .await
            .unwrap();

        // Delete the stage
        app.clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/stages/{stage_id}"),
                None,
            ))
            .await
            .unwrap();

        // Objects should return empty (stage gone)
        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/stages/{stage_id}/objects"),
                None,
            ))
            .await
            .unwrap();

        let body = body_json(resp).await;
        assert_eq!(body, serde_json::json!([]));
    }
}
