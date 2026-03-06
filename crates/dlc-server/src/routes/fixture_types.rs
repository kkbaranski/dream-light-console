use axum::{
    extract::{Path, State},
    Json,
};

use crate::error::ApiError;
use crate::state::AppState;

pub async fn list(State(state): State<AppState>) -> Json<Vec<serde_json::Value>> {
    let mut items: Vec<serde_json::Value> = state
        .fixture_types
        .values()
        .map(|ft| {
            serde_json::json!({
                "id": ft.id,
                "label": ft.label,
            })
        })
        .collect();
    items.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
    Json(items)
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let ft = state
        .fixture_types
        .get(&id)
        .ok_or_else(|| ApiError::not_found("fixture type not found"))?;
    Ok(Json(serde_json::json!({
        "id": ft.id,
        "label": ft.label,
        "definition": ft.definition,
    })))
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use tower::ServiceExt;

    use crate::routes;
    use crate::test_helpers::{body_json, json_request, spawn_test_state};

    #[tokio::test]
    async fn list_fixture_types() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(Method::GET, "/api/fixture-types", None))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let body = body_json(resp).await;
        let arr = body.as_array().unwrap();
        assert!(arr.len() >= 11);
    }

    #[tokio::test]
    async fn get_fixture_type() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .clone()
            .oneshot(json_request(Method::GET, "/api/fixture-types/moving_head", None))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::OK);
        let body = body_json(resp).await;
        assert_eq!(body["id"], "moving_head");
        assert_eq!(body["label"], "Moving Head");
        assert!(body["definition"].is_object());
    }

    #[tokio::test]
    async fn get_fixture_type_not_found() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .oneshot(json_request(Method::GET, "/api/fixture-types/nonexistent", None))
            .await
            .unwrap();

        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
}
