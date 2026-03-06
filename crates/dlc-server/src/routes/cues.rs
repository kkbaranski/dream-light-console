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
pub struct Cue {
    pub id: String,
    pub cue_list_id: String,
    pub number: f64,
    pub name: String,
    pub position: i64,
    pub pre_wait_ms: i64,
    pub fade_time_ms: i64,
    pub post_wait_ms: i64,
    pub auto_follow: bool,
    pub trigger_type: String,
    pub scene_json: String,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreateCue {
    pub number: f64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub position: i64,
    #[serde(default)]
    pub pre_wait_ms: i64,
    #[serde(default)]
    pub fade_time_ms: i64,
    #[serde(default)]
    pub post_wait_ms: i64,
    #[serde(default)]
    pub auto_follow: bool,
    #[serde(default = "default_trigger")]
    pub trigger_type: String,
    #[serde(default = "default_scene")]
    pub scene_json: serde_json::Value,
    #[serde(default)]
    pub notes: String,
}

fn default_trigger() -> String { "manual".to_string() }
fn default_scene() -> serde_json::Value { serde_json::json!({}) }

#[derive(Deserialize)]
pub struct UpdateCue {
    pub number: Option<f64>,
    pub name: Option<String>,
    pub position: Option<i64>,
    pub pre_wait_ms: Option<i64>,
    pub fade_time_ms: Option<i64>,
    pub post_wait_ms: Option<i64>,
    pub auto_follow: Option<bool>,
    pub trigger_type: Option<String>,
    pub scene_json: Option<serde_json::Value>,
    pub notes: Option<String>,
}

const SELECT: &str = "SELECT id, cue_list_id, number, name, position, pre_wait_ms, fade_time_ms, post_wait_ms, auto_follow, trigger_type, scene_json, notes, created_at, updated_at FROM cues";

pub async fn list(
    State(state): State<AppState>,
    Path((_concert_id, cue_list_id)): Path<(String, String)>,
) -> Result<Json<Vec<Cue>>, ApiError> {
    let rows = sqlx::query_as::<_, Cue>(&format!(
        "{SELECT} WHERE cue_list_id = ? ORDER BY number ASC"
    ))
    .bind(&cue_list_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn create(
    State(state): State<AppState>,
    Path((_concert_id, cue_list_id)): Path<(String, String)>,
    Json(body): Json<CreateCue>,
) -> Result<(StatusCode, Json<Cue>), ApiError> {
    let id = Uuid::new_v4().to_string();
    let scene_str = serde_json::to_string(&body.scene_json).unwrap();

    sqlx::query(
        "INSERT INTO cues (id, cue_list_id, number, name, position, pre_wait_ms, fade_time_ms, post_wait_ms, auto_follow, trigger_type, scene_json, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&cue_list_id)
    .bind(body.number)
    .bind(&body.name)
    .bind(body.position)
    .bind(body.pre_wait_ms)
    .bind(body.fade_time_ms)
    .bind(body.post_wait_ms)
    .bind(body.auto_follow)
    .bind(&body.trigger_type)
    .bind(&scene_str)
    .bind(&body.notes)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Cue>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update(
    State(state): State<AppState>,
    Path((_concert_id, _cue_list_id, id)): Path<(String, String, String)>,
    Json(body): Json<UpdateCue>,
) -> Result<Json<Cue>, ApiError> {
    let current: Cue = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "cue",
    )
    .await?;

    let number = body.number.unwrap_or(current.number);
    let name = body.name.unwrap_or(current.name);
    let position = body.position.unwrap_or(current.position);
    let pre_wait_ms = body.pre_wait_ms.unwrap_or(current.pre_wait_ms);
    let fade_time_ms = body.fade_time_ms.unwrap_or(current.fade_time_ms);
    let post_wait_ms = body.post_wait_ms.unwrap_or(current.post_wait_ms);
    let auto_follow = body.auto_follow.unwrap_or(current.auto_follow);
    let trigger_type = body.trigger_type.unwrap_or(current.trigger_type);
    let scene_str = match body.scene_json {
        Some(v) => serde_json::to_string(&v).unwrap(),
        None => current.scene_json,
    };
    let notes = body.notes.unwrap_or(current.notes);

    sqlx::query(
        "UPDATE cues SET number = ?, name = ?, position = ?, pre_wait_ms = ?, fade_time_ms = ?, post_wait_ms = ?, auto_follow = ?, trigger_type = ?, scene_json = ?, notes = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(number)
    .bind(&name)
    .bind(position)
    .bind(pre_wait_ms)
    .bind(fade_time_ms)
    .bind(post_wait_ms)
    .bind(auto_follow)
    .bind(&trigger_type)
    .bind(&scene_str)
    .bind(&notes)
    .bind(&id)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Cue>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    Path((_concert_id, _cue_list_id, id)): Path<(String, String, String)>,
) -> Result<StatusCode, ApiError> {
    delete_or_not_found("DELETE FROM cues WHERE id = ?", &id, &state.db, "cue").await?;
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
    async fn create_and_list_ordered() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;
        let cl_id = create_cue_list(&app, &concert_id, "Main").await;

        app.clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues"),
                Some(r#"{"number":2.0,"name":"Cue 2","fade_time_ms":1000}"#),
            ))
            .await
            .unwrap();

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues"),
                Some(r#"{"number":1.0,"name":"Cue 1","fade_time_ms":500}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
        let created = body_json(resp).await;
        assert_eq!(created["name"], "Cue 1");
        assert_eq!(created["fade_time_ms"], 500);

        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues"),
                None,
            ))
            .await
            .unwrap();
        let list = body_json(resp).await;
        let arr = list.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["number"], 1.0);
        assert_eq!(arr[1]["number"], 2.0);
    }

    #[tokio::test]
    async fn create_with_scene_json() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;
        let cl_id = create_cue_list(&app, &concert_id, "Main").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues"),
                Some(r#"{"number":1.0,"scene_json":{"fixtures":[{"dimmer":255}]}}"#),
            ))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::CREATED);
        let body = body_json(resp).await;
        let scene: serde_json::Value =
            serde_json::from_str(body["scene_json"].as_str().unwrap()).unwrap();
        assert!(scene["fixtures"].is_array());
    }

    #[tokio::test]
    async fn delete_cue() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;
        let cl_id = create_cue_list(&app, &concert_id, "Main").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues"),
                Some(r#"{"number":1.0}"#),
            ))
            .await
            .unwrap();
        let id = body_json(resp).await["id"].as_str().unwrap().to_string();

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues/{id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn cascade_delete_with_cue_list() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;
        let cl_id = create_cue_list(&app, &concert_id, "Main").await;

        app.clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues"),
                Some(r#"{"number":1.0}"#),
            ))
            .await
            .unwrap();

        app.clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}"),
                None,
            ))
            .await
            .unwrap();

        let resp = app
            .oneshot(json_request(
                Method::GET,
                &format!("/api/concerts/{concert_id}/cue-lists/{cl_id}/cues"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(body_json(resp).await.as_array().unwrap().len(), 0);
    }
}
