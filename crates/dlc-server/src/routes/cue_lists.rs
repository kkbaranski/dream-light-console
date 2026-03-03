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
pub struct CueList {
    pub id: String,
    pub show_id: String,
    pub name: String,
    pub tracking_mode: String,
    pub sort_order: i64,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateCueList {
    pub name: String,
}

#[derive(Deserialize)]
pub struct UpdateCueList {
    pub name: Option<String>,
    pub tracking_mode: Option<String>,
}

const SELECT: &str =
    "SELECT id, show_id, name, tracking_mode, sort_order, created_at FROM cue_lists";

pub async fn list(
    State(state): State<AppState>,
    Path(show_id): Path<String>,
) -> impl IntoResponse {
    match sqlx::query_as::<_, CueList>(&format!(
        "{SELECT} WHERE show_id = ? ORDER BY sort_order, created_at"
    ))
    .bind(&show_id)
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => Json(rows).into_response(),
        Err(e) => {
            tracing::error!("list cue_lists: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn create(
    State(state): State<AppState>,
    Path(show_id): Path<String>,
    Json(body): Json<CreateCueList>,
) -> impl IntoResponse {
    let id = Uuid::new_v4().to_string();

    let result = sqlx::query(
        "INSERT INTO cue_lists (id, show_id, name) VALUES (?, ?, ?)",
    )
    .bind(&id)
    .bind(&show_id)
    .bind(&body.name)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            let row = sqlx::query_as::<_, CueList>(&format!("{SELECT} WHERE id = ?"))
                .bind(&id)
                .fetch_one(&state.db)
                .await
                .unwrap();
            (StatusCode::CREATED, Json(row)).into_response()
        }
        Err(e) => {
            tracing::error!("create cue_list: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateCueList>,
) -> impl IntoResponse {
    let current = match sqlx::query_as::<_, CueList>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_optional(&state.db)
        .await
    {
        Ok(Some(row)) => row,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            tracing::error!("update cue_list (fetch): {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let name = body.name.unwrap_or(current.name);
    let tracking_mode = body.tracking_mode.unwrap_or(current.tracking_mode);

    let result =
        sqlx::query("UPDATE cue_lists SET name = ?, tracking_mode = ? WHERE id = ?")
            .bind(&name)
            .bind(&tracking_mode)
            .bind(&id)
            .execute(&state.db)
            .await;

    match result {
        Ok(_) => {
            let row = sqlx::query_as::<_, CueList>(&format!("{SELECT} WHERE id = ?"))
                .bind(&id)
                .fetch_one(&state.db)
                .await
                .unwrap();
            Json(row).into_response()
        }
        Err(e) => {
            tracing::error!("update cue_list: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match sqlx::query("DELETE FROM cue_lists WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
    {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND,
        Ok(_) => StatusCode::NO_CONTENT,
        Err(e) => {
            tracing::error!("delete cue_list: {e}");
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

    async fn create_show(app: &axum::Router, name: &str) -> String {
        let body = serde_json::json!({ "name": name }).to_string();
        let resp = app
            .clone()
            .oneshot(json_request(Method::POST, "/api/shows", Some(&body)))
            .await
            .unwrap();
        body_json(resp).await["id"].as_str().unwrap().to_string()
    }

    #[tokio::test]
    async fn list_empty() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;

        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/shows/{show_id}/cuelists"),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let body = body_json(resp).await;
        assert_eq!(body, serde_json::json!([]));
    }

    #[tokio::test]
    async fn create_and_list() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/shows/{show_id}/cuelists"),
                Some(r#"{"name":"Main"}"#),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::CREATED);
        let created = body_json(resp).await;
        assert_eq!(created["name"], "Main");
        assert_eq!(created["show_id"], show_id);
        assert_eq!(created["tracking_mode"], "tracking");

        // List
        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/shows/{show_id}/cuelists"),
                None,
            ))
            .await
            .unwrap();
        let list = body_json(resp).await;
        assert_eq!(list.as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn update_cue_list() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/shows/{show_id}/cuelists"),
                Some(r#"{"name":"Original"}"#),
            ))
            .await
            .unwrap();
        let id = body_json(resp).await["id"].as_str().unwrap().to_string();

        // Update name and tracking_mode
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PUT,
                &format!("/api/cuelists/{id}"),
                Some(r#"{"name":"Renamed","tracking_mode":"cue_only"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let updated = body_json(resp).await;
        assert_eq!(updated["name"], "Renamed");
        assert_eq!(updated["tracking_mode"], "cue_only");
    }

    #[tokio::test]
    async fn update_not_found() {
        let state = test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(
                Method::PUT,
                "/api/cuelists/nonexistent",
                Some(r#"{"name":"Nope"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn delete_cue_list() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/shows/{show_id}/cuelists"),
                Some(r#"{"name":"To Delete"}"#),
            ))
            .await
            .unwrap();
        let id = body_json(resp).await["id"].as_str().unwrap().to_string();

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/cuelists/{id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);

        // List should be empty
        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/shows/{show_id}/cuelists"),
                None,
            ))
            .await
            .unwrap();
        let list = body_json(resp).await;
        assert_eq!(list.as_array().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn delete_not_found() {
        let state = test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(
                Method::DELETE,
                "/api/cuelists/nonexistent",
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn cascade_delete_with_show() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;

        app.clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/shows/{show_id}/cuelists"),
                Some(r#"{"name":"CL"}"#),
            ))
            .await
            .unwrap();

        // Delete the show
        app.clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/shows/{show_id}"),
                None,
            ))
            .await
            .unwrap();

        // Cue lists should be gone
        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/shows/{show_id}/cuelists"),
                None,
            ))
            .await
            .unwrap();
        let list = body_json(resp).await;
        assert_eq!(list.as_array().unwrap().len(), 0);
    }
}
