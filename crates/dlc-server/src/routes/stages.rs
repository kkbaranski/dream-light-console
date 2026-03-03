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
pub struct Stage {
    pub id: String,
    pub show_id: String,
    pub name: String,
    pub floor_material_id: String,
    pub wall_material_id: String,
    pub floor_tile_size: f64,
    pub wall_tile_size: f64,
    pub stage_model_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreateStage {
    pub name: String,
    #[serde(default = "default_floor_material")]
    pub floor_material_id: String,
    #[serde(default = "default_wall_material")]
    pub wall_material_id: String,
    #[serde(default = "default_tile_size")]
    pub floor_tile_size: f64,
    #[serde(default = "default_tile_size")]
    pub wall_tile_size: f64,
    pub stage_model_id: Option<String>,
}

fn default_floor_material() -> String {
    "floor-pavement".to_string()
}
fn default_wall_material() -> String {
    "wall-white".to_string()
}
fn default_tile_size() -> f64 {
    1.0
}

#[derive(Deserialize)]
pub struct UpdateStage {
    pub name: Option<String>,
    pub floor_material_id: Option<String>,
    pub wall_material_id: Option<String>,
    pub floor_tile_size: Option<f64>,
    pub wall_tile_size: Option<f64>,
    pub stage_model_id: Option<Option<String>>,
}

const SELECT: &str = "SELECT id, show_id, name, floor_material_id, wall_material_id, floor_tile_size, wall_tile_size, stage_model_id, created_at, updated_at FROM stages";

pub async fn list(
    State(state): State<AppState>,
    Path(show_id): Path<String>,
) -> Result<Json<Vec<Stage>>, ApiError> {
    let rows =
        sqlx::query_as::<_, Stage>(&format!("{SELECT} WHERE show_id = ? ORDER BY created_at"))
            .bind(&show_id)
            .fetch_all(&state.db)
            .await?;
    Ok(Json(rows))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Stage>, ApiError> {
    let row = sqlx::query_as::<_, Stage>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("stage not found"))?;
    Ok(Json(row))
}

pub async fn create(
    State(state): State<AppState>,
    Path(show_id): Path<String>,
    Json(body): Json<CreateStage>,
) -> Result<(StatusCode, Json<Stage>), ApiError> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO stages (id, show_id, name, floor_material_id, wall_material_id, floor_tile_size, wall_tile_size, stage_model_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&show_id)
    .bind(&body.name)
    .bind(&body.floor_material_id)
    .bind(&body.wall_material_id)
    .bind(body.floor_tile_size)
    .bind(body.wall_tile_size)
    .bind(&body.stage_model_id)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Stage>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateStage>,
) -> Result<Json<Stage>, ApiError> {
    let current = sqlx::query_as::<_, Stage>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("stage not found"))?;

    let name = body.name.unwrap_or(current.name);
    let floor_mat = body.floor_material_id.unwrap_or(current.floor_material_id);
    let wall_mat = body.wall_material_id.unwrap_or(current.wall_material_id);
    let floor_tile = body.floor_tile_size.unwrap_or(current.floor_tile_size);
    let wall_tile = body.wall_tile_size.unwrap_or(current.wall_tile_size);
    let stage_model = match body.stage_model_id {
        Some(v) => v,
        None => current.stage_model_id,
    };

    sqlx::query(
        "UPDATE stages SET name = ?, floor_material_id = ?, wall_material_id = ?, floor_tile_size = ?, wall_tile_size = ?, stage_model_id = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(&name)
    .bind(&floor_mat)
    .bind(&wall_mat)
    .bind(floor_tile)
    .bind(wall_tile)
    .bind(&stage_model)
    .bind(&id)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Stage>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let result = sqlx::query("DELETE FROM stages WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("stage not found"));
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

    #[tokio::test]
    async fn list_empty() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Test Show").await;

        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/shows/{show_id}/stages"),
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
        let show_id = create_show(&app, "Test Show").await;

        // Create with minimal body
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/shows/{show_id}/stages"),
                Some(r#"{"name":"Main Stage"}"#),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::CREATED);
        let created = body_json(resp).await;
        assert_eq!(created["name"], "Main Stage");
        assert_eq!(created["show_id"], show_id);
        assert_eq!(created["floor_material_id"], "floor-pavement");
        assert_eq!(created["wall_material_id"], "wall-white");
        assert_eq!(created["floor_tile_size"], 1.0);
        assert_eq!(created["wall_tile_size"], 1.0);
        assert_eq!(created["stage_model_id"], serde_json::Value::Null);
        let id = created["id"].as_str().unwrap();

        // Get by ID
        let resp = app
            .clone()
            .oneshot(json_request(Method::GET, &format!("/api/stages/{id}"), None))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let fetched = body_json(resp).await;
        assert_eq!(fetched["name"], "Main Stage");

        // List
        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/shows/{show_id}/stages"),
                None,
            ))
            .await
            .unwrap();
        let list = body_json(resp).await;
        assert_eq!(list.as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn create_with_all_fields() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Test Show").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/shows/{show_id}/stages"),
                Some(r#"{"name":"Custom","floor_material_id":"floor-wood","wall_material_id":"wall-brick","floor_tile_size":2.0,"wall_tile_size":0.5,"stage_model_id":"stage-arena"}"#),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::CREATED);
        let body = body_json(resp).await;
        assert_eq!(body["floor_material_id"], "floor-wood");
        assert_eq!(body["wall_material_id"], "wall-brick");
        assert_eq!(body["floor_tile_size"], 2.0);
        assert_eq!(body["wall_tile_size"], 0.5);
        assert_eq!(body["stage_model_id"], "stage-arena");
    }

    #[tokio::test]
    async fn update_partial() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Test Show").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/shows/{show_id}/stages"),
                Some(r#"{"name":"Original"}"#),
            ))
            .await
            .unwrap();
        let created = body_json(resp).await;
        let id = created["id"].as_str().unwrap();

        // Partial update — only name
        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PUT,
                &format!("/api/stages/{id}"),
                Some(r#"{"name":"Renamed"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let updated = body_json(resp).await;
        assert_eq!(updated["name"], "Renamed");
        assert_eq!(updated["floor_material_id"], "floor-pavement"); // unchanged
    }

    #[tokio::test]
    async fn update_materials() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Test Show").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/shows/{show_id}/stages"),
                Some(r#"{"name":"Stage"}"#),
            ))
            .await
            .unwrap();
        let id = body_json(resp).await["id"].as_str().unwrap().to_string();

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PUT,
                &format!("/api/stages/{id}"),
                Some(r#"{"floor_material_id":"floor-wood","floor_tile_size":3.0}"#),
            ))
            .await
            .unwrap();
        let updated = body_json(resp).await;
        assert_eq!(updated["floor_material_id"], "floor-wood");
        assert_eq!(updated["floor_tile_size"], 3.0);
        assert_eq!(updated["name"], "Stage"); // unchanged
    }

    #[tokio::test]
    async fn delete_stage() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Test Show").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/shows/{show_id}/stages"),
                Some(r#"{"name":"To Delete"}"#),
            ))
            .await
            .unwrap();
        let id = body_json(resp).await["id"].as_str().unwrap().to_string();

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/stages/{id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);

        let resp = app
            .oneshot(json_request(Method::GET, &format!("/api/stages/{id}"), None))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn get_not_found() {
        let state = test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(Method::GET, "/api/stages/nonexistent", None))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn cascade_delete_with_show() {
        let state = test_state().await;
        let app = routes::build_router(state);
        let show_id = create_show(&app, "Test Show").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/shows/{show_id}/stages"),
                Some(r#"{"name":"Stage"}"#),
            ))
            .await
            .unwrap();
        let stage_id = body_json(resp).await["id"].as_str().unwrap().to_string();

        // Delete the show
        app.clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/shows/{show_id}"),
                None,
            ))
            .await
            .unwrap();

        // Stage should be gone (cascade)
        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/stages/{stage_id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
}
