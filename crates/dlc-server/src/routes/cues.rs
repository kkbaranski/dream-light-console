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
pub struct Cue {
    pub id: String,
    pub cue_list_id: String,
    pub cue_number: f64,
    pub label: String,
    pub fade_up_ms: i64,
    pub fade_down_ms: i64,
    pub follow_ms: Option<i64>,
    pub preset_refs_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreateCue {
    pub cue_number: f64,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub fade_up_ms: i64,
    #[serde(default)]
    pub fade_down_ms: i64,
    pub follow_ms: Option<i64>,
    #[serde(default = "default_preset_refs")]
    pub preset_refs: serde_json::Value,
}

fn default_preset_refs() -> serde_json::Value {
    serde_json::json!([])
}

#[derive(Deserialize)]
pub struct UpdateCue {
    pub cue_number: Option<f64>,
    pub label: Option<String>,
    pub fade_up_ms: Option<i64>,
    pub fade_down_ms: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_optional_nullable")]
    pub follow_ms: Option<Option<i64>>,
    pub preset_refs: Option<serde_json::Value>,
}

/// Distinguishes absent field (None) from explicit null (Some(None)).
fn deserialize_optional_nullable<'de, D>(deserializer: D) -> Result<Option<Option<i64>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::deserialize(deserializer)?))
}

const SELECT: &str = "SELECT id, cue_list_id, cue_number, label, fade_up_ms, fade_down_ms, follow_ms, preset_refs_json, created_at, updated_at FROM cues";

pub async fn list(
    State(state): State<AppState>,
    Path(cue_list_id): Path<String>,
) -> impl IntoResponse {
    match sqlx::query_as::<_, Cue>(&format!(
        "{SELECT} WHERE cue_list_id = ? ORDER BY cue_number ASC"
    ))
    .bind(&cue_list_id)
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => Json(rows).into_response(),
        Err(e) => {
            tracing::error!("list cues: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn create(
    State(state): State<AppState>,
    Path(cue_list_id): Path<String>,
    Json(body): Json<CreateCue>,
) -> impl IntoResponse {
    let id = Uuid::new_v4().to_string();
    let preset_refs_str = serde_json::to_string(&body.preset_refs).unwrap();

    let result = sqlx::query(
        "INSERT INTO cues (id, cue_list_id, cue_number, label, fade_up_ms, fade_down_ms, follow_ms, preset_refs_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&cue_list_id)
    .bind(body.cue_number)
    .bind(&body.label)
    .bind(body.fade_up_ms)
    .bind(body.fade_down_ms)
    .bind(body.follow_ms)
    .bind(&preset_refs_str)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            let row = sqlx::query_as::<_, Cue>(&format!("{SELECT} WHERE id = ?"))
                .bind(&id)
                .fetch_one(&state.db)
                .await
                .unwrap();
            (StatusCode::CREATED, Json(row)).into_response()
        }
        Err(e) => {
            tracing::error!("create cue: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateCue>,
) -> impl IntoResponse {
    let current = match sqlx::query_as::<_, Cue>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_optional(&state.db)
        .await
    {
        Ok(Some(row)) => row,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            tracing::error!("update cue (fetch): {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let cue_number = body.cue_number.unwrap_or(current.cue_number);
    let label = body.label.unwrap_or(current.label);
    let fade_up = body.fade_up_ms.unwrap_or(current.fade_up_ms);
    let fade_down = body.fade_down_ms.unwrap_or(current.fade_down_ms);
    let follow = match body.follow_ms {
        Some(v) => v,
        None => current.follow_ms,
    };
    let preset_refs_str = match body.preset_refs {
        Some(v) => serde_json::to_string(&v).unwrap(),
        None => current.preset_refs_json,
    };

    let result = sqlx::query(
        "UPDATE cues SET cue_number = ?, label = ?, fade_up_ms = ?, fade_down_ms = ?, follow_ms = ?, preset_refs_json = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(cue_number)
    .bind(&label)
    .bind(fade_up)
    .bind(fade_down)
    .bind(follow)
    .bind(&preset_refs_str)
    .bind(&id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            let row = sqlx::query_as::<_, Cue>(&format!("{SELECT} WHERE id = ?"))
                .bind(&id)
                .fetch_one(&state.db)
                .await
                .unwrap();
            Json(row).into_response()
        }
        Err(e) => {
            tracing::error!("update cue: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match sqlx::query("DELETE FROM cues WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
    {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND,
        Ok(_) => StatusCode::NO_CONTENT,
        Err(e) => {
            tracing::error!("delete cue: {e}");
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

    async fn create_cue_list(app: &axum::Router, show_id: &str, name: &str) -> String {
        let body = serde_json::json!({ "name": name }).to_string();
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/shows/{show_id}/cuelists"),
                Some(&body),
            ))
            .await
            .unwrap();
        body_json(resp).await["id"].as_str().unwrap().to_string()
    }

    #[tokio::test]
    async fn list_empty() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;
        let cl_id = create_cue_list(&app, &show_id, "Main").await;

        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/cuelists/{cl_id}/cues"),
                None,
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let body = body_json(resp).await;
        assert_eq!(body, serde_json::json!([]));
    }

    #[tokio::test]
    async fn create_and_list_ordered() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;
        let cl_id = create_cue_list(&app, &show_id, "Main").await;

        // Create cue 2 first
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/cuelists/{cl_id}/cues"),
                Some(r#"{"cue_number":2.0,"label":"Cue 2","fade_up_ms":1000}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);

        // Then cue 1
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/cuelists/{cl_id}/cues"),
                Some(r#"{"cue_number":1.0,"label":"Cue 1","fade_up_ms":500,"fade_down_ms":300}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
        let created = body_json(resp).await;
        assert_eq!(created["label"], "Cue 1");
        assert_eq!(created["fade_up_ms"], 500);
        assert_eq!(created["fade_down_ms"], 300);
        assert_eq!(created["follow_ms"], serde_json::Value::Null);

        // Then cue 1.5
        app.clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/cuelists/{cl_id}/cues"),
                Some(r#"{"cue_number":1.5,"label":"Cue 1.5"}"#),
            ))
            .await
            .unwrap();

        // List should be ordered by cue_number
        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/cuelists/{cl_id}/cues"),
                None,
            ))
            .await
            .unwrap();
        let list = body_json(resp).await;
        let arr = list.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        assert_eq!(arr[0]["cue_number"], 1.0);
        assert_eq!(arr[1]["cue_number"], 1.5);
        assert_eq!(arr[2]["cue_number"], 2.0);
    }

    #[tokio::test]
    async fn create_with_follow_and_preset_refs() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;
        let cl_id = create_cue_list(&app, &show_id, "Main").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/cuelists/{cl_id}/cues"),
                Some(r#"{"cue_number":1.0,"label":"Auto","follow_ms":2000,"preset_refs":[{"preset_id":"p1"}]}"#),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::CREATED);
        let body = body_json(resp).await;
        assert_eq!(body["follow_ms"], 2000);
        let refs: serde_json::Value =
            serde_json::from_str(body["preset_refs_json"].as_str().unwrap()).unwrap();
        assert_eq!(refs[0]["preset_id"], "p1");
    }

    #[tokio::test]
    async fn update_partial() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;
        let cl_id = create_cue_list(&app, &show_id, "Main").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/cuelists/{cl_id}/cues"),
                Some(r#"{"cue_number":1.0,"label":"Original","fade_up_ms":500}"#),
            ))
            .await
            .unwrap();
        let id = body_json(resp).await["id"].as_str().unwrap().to_string();

        // Update only label
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PUT,
                &format!("/api/cues/{id}"),
                Some(r#"{"label":"Renamed"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let updated = body_json(resp).await;
        assert_eq!(updated["label"], "Renamed");
        assert_eq!(updated["fade_up_ms"], 500); // unchanged
    }

    #[tokio::test]
    async fn update_follow_to_null() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;
        let cl_id = create_cue_list(&app, &show_id, "Main").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/cuelists/{cl_id}/cues"),
                Some(r#"{"cue_number":1.0,"follow_ms":2000}"#),
            ))
            .await
            .unwrap();
        let id = body_json(resp).await["id"].as_str().unwrap().to_string();

        // Set follow_ms to null
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PUT,
                &format!("/api/cues/{id}"),
                Some(r#"{"follow_ms":null}"#),
            ))
            .await
            .unwrap();
        let updated = body_json(resp).await;
        assert_eq!(updated["follow_ms"], serde_json::Value::Null);
    }

    #[tokio::test]
    async fn delete_cue() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;
        let cl_id = create_cue_list(&app, &show_id, "Main").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/cuelists/{cl_id}/cues"),
                Some(r#"{"cue_number":1.0}"#),
            ))
            .await
            .unwrap();
        let id = body_json(resp).await["id"].as_str().unwrap().to_string();

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/cues/{id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);

        // List should be empty
        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/cuelists/{cl_id}/cues"),
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
                "/api/cues/nonexistent",
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn cascade_delete_with_cue_list() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;
        let cl_id = create_cue_list(&app, &show_id, "Main").await;

        app.clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/cuelists/{cl_id}/cues"),
                Some(r#"{"cue_number":1.0}"#),
            ))
            .await
            .unwrap();

        // Delete the cue list
        app.clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/cuelists/{cl_id}"),
                None,
            ))
            .await
            .unwrap();

        // Cues should be gone
        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/cuelists/{cl_id}/cues"),
                None,
            ))
            .await
            .unwrap();
        let list = body_json(resp).await;
        assert_eq!(list.as_array().unwrap().len(), 0);
    }
}
