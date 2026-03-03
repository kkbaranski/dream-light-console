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
    use axum::http::{Method, StatusCode};
    use tower::ServiceExt;

    use crate::routes;
    use crate::test_helpers::{body_json, create_show, create_stage, json_request, spawn_test_state};

    #[tokio::test]
    async fn get_empty_by_default() {
        let state = spawn_test_state().await;
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
        let state = spawn_test_state().await;
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
        let state = spawn_test_state().await;
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
        let state = spawn_test_state().await;
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
