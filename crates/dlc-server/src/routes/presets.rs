use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::error::ApiError;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Preset {
    pub id: String,
    pub show_id: String,
    pub name: String,
    pub fixture_type: String,
    pub mode: String,
    pub values_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreatePreset {
    pub show_id: String,
    pub name: String,
    pub fixture_type: String,
    pub mode: String,
    pub values: serde_json::Value,
}

#[derive(Deserialize)]
pub struct UpdatePreset {
    pub name: Option<String>,
    pub values: Option<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct ListQuery {
    pub show_id: String,
}

const SELECT: &str = "SELECT id, show_id, name, fixture_type, mode, values_json, created_at, updated_at FROM presets";

pub async fn list(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Vec<Preset>>, ApiError> {
    let rows = sqlx::query_as::<_, Preset>(&format!(
        "{SELECT} WHERE show_id = ? ORDER BY created_at"
    ))
    .bind(&query.show_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Preset>, ApiError> {
    let row = sqlx::query_as::<_, Preset>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("preset not found"))?;
    Ok(Json(row))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreatePreset>,
) -> Result<(StatusCode, Json<Preset>), ApiError> {
    let id = Uuid::new_v4().to_string();
    let values_str = serde_json::to_string(&body.values).unwrap();

    sqlx::query(
        "INSERT INTO presets (id, show_id, name, fixture_type, mode, values_json) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.show_id)
    .bind(&body.name)
    .bind(&body.fixture_type)
    .bind(&body.mode)
    .bind(&values_str)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Preset>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdatePreset>,
) -> Result<Json<Preset>, ApiError> {
    let current = sqlx::query_as::<_, Preset>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("preset not found"))?;

    let name = body.name.unwrap_or(current.name);
    let values_str = match body.values {
        Some(v) => serde_json::to_string(&v).unwrap(),
        None => current.values_json,
    };

    sqlx::query(
        "UPDATE presets SET name = ?, values_json = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(&name)
    .bind(&values_str)
    .bind(&id)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Preset>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let result = sqlx::query("DELETE FROM presets WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("preset not found"));
    }
    Ok(StatusCode::NO_CONTENT)
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
        let body = serde_json::json!({ "name": name }).to_string();
        let resp = app
            .clone()
            .oneshot(json_request(Method::POST, "/api/shows", Some(&body)))
            .await
            .unwrap();
        body_json(resp).await["id"].as_str().unwrap().to_string()
    }

    fn preset_body(show_id: &str, name: &str, fixture_type: &str, mode: &str, values: serde_json::Value) -> String {
        serde_json::json!({
            "show_id": show_id,
            "name": name,
            "fixture_type": fixture_type,
            "mode": mode,
            "values": values,
        }).to_string()
    }

    #[tokio::test]
    async fn list_empty() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;

        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/presets?show_id={show_id}"),
                None,
            ))
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
        let show_id = create_show(&app, "Show").await;

        let body = preset_body(&show_id, "Red Wash", "moving_head", "sevenChannel",
            serde_json::json!({"dimmer": 255, "color": "#ff0000"}));
        let resp = app
            .clone()
            .oneshot(json_request(Method::POST, "/api/presets", Some(&body)))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::CREATED);
        let created = body_json(resp).await;
        assert_eq!(created["name"], "Red Wash");
        assert_eq!(created["fixture_type"], "moving_head");
        assert_eq!(created["mode"], "sevenChannel");
        let id = created["id"].as_str().unwrap();

        // Get by ID
        let resp = app
            .clone()
            .oneshot(json_request(Method::GET, &format!("/api/presets/{id}"), None))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let fetched = body_json(resp).await;
        assert_eq!(fetched["name"], "Red Wash");

        // List by show
        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/presets?show_id={show_id}"),
                None,
            ))
            .await
            .unwrap();
        let list = body_json(resp).await;
        assert_eq!(list.as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn update_partial() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;

        let body = preset_body(&show_id, "Original", "fresnel", "fourChannel",
            serde_json::json!({"dimmer": 100}));
        let resp = app
            .clone()
            .oneshot(json_request(Method::POST, "/api/presets", Some(&body)))
            .await
            .unwrap();
        let id = body_json(resp).await["id"].as_str().unwrap().to_string();

        // Update only name
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PUT,
                &format!("/api/presets/{id}"),
                Some(r#"{"name":"Renamed"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let updated = body_json(resp).await;
        assert_eq!(updated["name"], "Renamed");
        let vals: serde_json::Value =
            serde_json::from_str(updated["values_json"].as_str().unwrap()).unwrap();
        assert_eq!(vals["dimmer"], 100); // unchanged
    }

    #[tokio::test]
    async fn update_values() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;

        let body = preset_body(&show_id, "Preset", "moving_head", "sevenChannel",
            serde_json::json!({"dimmer": 100}));
        let resp = app
            .clone()
            .oneshot(json_request(Method::POST, "/api/presets", Some(&body)))
            .await
            .unwrap();
        let id = body_json(resp).await["id"].as_str().unwrap().to_string();

        // Update values
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PUT,
                &format!("/api/presets/{id}"),
                Some(r#"{"values":{"dimmer":255,"pan":128}}"#),
            ))
            .await
            .unwrap();
        let updated = body_json(resp).await;
        let vals: serde_json::Value =
            serde_json::from_str(updated["values_json"].as_str().unwrap()).unwrap();
        assert_eq!(vals["dimmer"], 255);
        assert_eq!(vals["pan"], 128);
        assert_eq!(updated["name"], "Preset"); // unchanged
    }

    #[tokio::test]
    async fn delete_preset() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;

        let body = preset_body(&show_id, "To Delete", "gobo", "sevenChannel",
            serde_json::json!({}));
        let resp = app
            .clone()
            .oneshot(json_request(Method::POST, "/api/presets", Some(&body)))
            .await
            .unwrap();
        let id = body_json(resp).await["id"].as_str().unwrap().to_string();

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/presets/{id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);

        let resp = app
            .oneshot(json_request(Method::GET, &format!("/api/presets/{id}"), None))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn get_not_found() {
        let state = test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(Method::GET, "/api/presets/nonexistent", None))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn cascade_delete_with_show() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Show").await;

        let body = preset_body(&show_id, "Preset", "fresnel", "fourChannel",
            serde_json::json!({}));
        let resp = app
            .clone()
            .oneshot(json_request(Method::POST, "/api/presets", Some(&body)))
            .await
            .unwrap();
        let preset_id = body_json(resp).await["id"].as_str().unwrap().to_string();

        // Delete the show
        app.clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/shows/{show_id}"),
                None,
            ))
            .await
            .unwrap();

        // Preset should be gone
        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/presets/{preset_id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
}
