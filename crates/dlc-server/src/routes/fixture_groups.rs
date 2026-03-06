use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::db::{default_json_array, delete_or_not_found, fetch_or_not_found};
use crate::error::ApiError;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct FixtureGroup {
    pub id: String,
    pub concert_id: String,
    pub name: String,
    pub fixture_placement_ids_json: String,
}

#[derive(Deserialize)]
pub struct CreateFixtureGroup {
    pub name: String,
    #[serde(default = "default_json_array")]
    pub fixture_placement_ids_json: String,
}

#[derive(Deserialize)]
pub struct UpdateFixtureGroup {
    pub name: Option<String>,
    pub fixture_placement_ids_json: Option<String>,
}

const SELECT: &str = "SELECT id, concert_id, name, fixture_placement_ids_json FROM fixture_groups";

pub async fn list(
    State(state): State<AppState>,
    Path(concert_id): Path<String>,
) -> Result<Json<Vec<FixtureGroup>>, ApiError> {
    let rows = sqlx::query_as::<_, FixtureGroup>(&format!(
        "{SELECT} WHERE concert_id = ? ORDER BY name"
    ))
    .bind(&concert_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn create(
    State(state): State<AppState>,
    Path(concert_id): Path<String>,
    Json(body): Json<CreateFixtureGroup>,
) -> Result<(StatusCode, Json<FixtureGroup>), ApiError> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO fixture_groups (id, concert_id, name, fixture_placement_ids_json) VALUES (?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&concert_id)
    .bind(&body.name)
    .bind(&body.fixture_placement_ids_json)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, FixtureGroup>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update(
    State(state): State<AppState>,
    Path((_concert_id, id)): Path<(String, String)>,
    Json(body): Json<UpdateFixtureGroup>,
) -> Result<Json<FixtureGroup>, ApiError> {
    let current: FixtureGroup = fetch_or_not_found(
        &format!("{SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "fixture group",
    )
    .await?;

    let name = body.name.unwrap_or(current.name);
    let ids_json = body
        .fixture_placement_ids_json
        .unwrap_or(current.fixture_placement_ids_json);

    sqlx::query("UPDATE fixture_groups SET name = ?, fixture_placement_ids_json = ? WHERE id = ?")
        .bind(&name)
        .bind(&ids_json)
        .bind(&id)
        .execute(&state.db)
        .await?;

    let row = sqlx::query_as::<_, FixtureGroup>(&format!("{SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    Path((_concert_id, id)): Path<(String, String)>,
) -> Result<StatusCode, ApiError> {
    delete_or_not_found("DELETE FROM fixture_groups WHERE id = ?", &id, &state.db, "fixture group").await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use tower::ServiceExt;

    use crate::routes;
    use crate::test_helpers::{
        body_json, create_concert, create_stage, json_request, spawn_test_state,
    };

    #[tokio::test]
    async fn fixture_group_crud() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);
        let stage_id = create_stage(&app, "Stage").await;
        let concert_id = create_concert(&app, &stage_id, "Concert").await;

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/concerts/{concert_id}/fixture-groups"),
                Some(r#"{"name":"Front Wash"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
        let id = body_json(resp).await["id"].as_str().unwrap().to_string();

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::GET,
                &format!("/api/concerts/{concert_id}/fixture-groups"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(body_json(resp).await.as_array().unwrap().len(), 1);

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/concerts/{concert_id}/fixture-groups/{id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    }
}
