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
pub struct Song {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub tags_json: String,
    pub notes: String,
}

#[derive(Deserialize)]
pub struct CreateSong {
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default = "default_json_array")]
    pub tags_json: String,
    #[serde(default)]
    pub notes: String,
}

#[derive(Deserialize)]
pub struct UpdateSong {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub tags_json: Option<String>,
    pub notes: Option<String>,
}

const SONG_SELECT: &str = "SELECT id, title, artist, tags_json, notes FROM songs";

pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<Song>>, ApiError> {
    let rows = sqlx::query_as::<_, Song>(&format!("{SONG_SELECT} ORDER BY title"))
        .fetch_all(&state.db)
        .await?;
    Ok(Json(rows))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Song>, ApiError> {
    let row: Song = fetch_or_not_found(
        &format!("{SONG_SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "song",
    )
    .await?;
    Ok(Json(row))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateSong>,
) -> Result<(StatusCode, Json<Song>), ApiError> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO songs (id, title, artist, tags_json, notes) VALUES (?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&body.title)
        .bind(&body.artist)
        .bind(&body.tags_json)
        .bind(&body.notes)
        .execute(&state.db)
        .await?;

    let row = sqlx::query_as::<_, Song>(&format!("{SONG_SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateSong>,
) -> Result<Json<Song>, ApiError> {
    let current: Song = fetch_or_not_found(
        &format!("{SONG_SELECT} WHERE id = ?"),
        &id,
        &state.db,
        "song",
    )
    .await?;

    let title = body.title.unwrap_or(current.title);
    let artist = body.artist.unwrap_or(current.artist);
    let tags_json = body.tags_json.unwrap_or(current.tags_json);
    let notes = body.notes.unwrap_or(current.notes);

    sqlx::query("UPDATE songs SET title = ?, artist = ?, tags_json = ?, notes = ? WHERE id = ?")
        .bind(&title)
        .bind(&artist)
        .bind(&tags_json)
        .bind(&notes)
        .bind(&id)
        .execute(&state.db)
        .await?;

    let row = sqlx::query_as::<_, Song>(&format!("{SONG_SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    delete_or_not_found("DELETE FROM songs WHERE id = ?", &id, &state.db, "song").await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct SongVersion {
    pub song_id: String,
    pub id: i64,
    pub name: String,
    pub bpm: Option<f64>,
    pub duration_ms: Option<i64>,
    pub key_signature: String,
    pub structure_json: String,
    pub notes: String,
}

#[derive(Deserialize)]
pub struct CreateSongVersion {
    #[serde(default)]
    pub name: String,
    pub bpm: Option<f64>,
    pub duration_ms: Option<i64>,
    #[serde(default)]
    pub key_signature: String,
    #[serde(default = "default_json_array")]
    pub structure_json: String,
    #[serde(default)]
    pub notes: String,
}

const VERSION_SELECT: &str = "SELECT song_id, id, name, bpm, duration_ms, key_signature, structure_json, notes FROM song_versions";

pub async fn list_versions(
    State(state): State<AppState>,
    Path(song_id): Path<String>,
) -> Result<Json<Vec<SongVersion>>, ApiError> {
    let rows = sqlx::query_as::<_, SongVersion>(&format!(
        "{VERSION_SELECT} WHERE song_id = ? ORDER BY name"
    ))
    .bind(&song_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn create_version(
    State(state): State<AppState>,
    Path(song_id): Path<String>,
    Json(body): Json<CreateSongVersion>,
) -> Result<(StatusCode, Json<SongVersion>), ApiError> {
    let max_id: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(id) FROM song_versions WHERE song_id = ?",
    )
    .bind(&song_id)
    .fetch_one(&state.db)
    .await?;
    let id = max_id.unwrap_or(0) + 1;

    sqlx::query(
        "INSERT INTO song_versions (song_id, id, name, bpm, duration_ms, key_signature, structure_json, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&song_id)
    .bind(id)
    .bind(&body.name)
    .bind(body.bpm)
    .bind(body.duration_ms)
    .bind(&body.key_signature)
    .bind(&body.structure_json)
    .bind(&body.notes)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, SongVersion>(&format!("{VERSION_SELECT} WHERE song_id = ? AND id = ?"))
        .bind(&song_id)
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn delete_version(
    State(state): State<AppState>,
    Path((song_id, id)): Path<(String, i64)>,
) -> Result<StatusCode, ApiError> {
    let result = sqlx::query("DELETE FROM song_versions WHERE song_id = ? AND id = ?")
        .bind(&song_id)
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("song version not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Recording {
    pub id: String,
    pub song_id: String,
    pub version_id: i64,
    pub file_path: String,
    pub file_hash: String,
    pub source: String,
    pub duration_ms: Option<i64>,
    pub fingerprint_path: String,
}

#[derive(Deserialize)]
pub struct CreateRecording {
    #[serde(default)]
    pub file_path: String,
    #[serde(default)]
    pub file_hash: String,
    #[serde(default)]
    pub source: String,
    pub duration_ms: Option<i64>,
    #[serde(default)]
    pub fingerprint_path: String,
}

const RECORDING_SELECT: &str = "SELECT id, song_id, version_id, file_path, file_hash, source, duration_ms, fingerprint_path FROM recordings";

pub async fn list_recordings(
    State(state): State<AppState>,
    Path((song_id, version_id)): Path<(String, i64)>,
) -> Result<Json<Vec<Recording>>, ApiError> {
    let rows = sqlx::query_as::<_, Recording>(&format!(
        "{RECORDING_SELECT} WHERE song_id = ? AND version_id = ?"
    ))
    .bind(&song_id)
    .bind(version_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn create_recording(
    State(state): State<AppState>,
    Path((song_id, version_id)): Path<(String, i64)>,
    Json(body): Json<CreateRecording>,
) -> Result<(StatusCode, Json<Recording>), ApiError> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO recordings (id, song_id, version_id, file_path, file_hash, source, duration_ms, fingerprint_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&song_id)
    .bind(version_id)
    .bind(&body.file_path)
    .bind(&body.file_hash)
    .bind(&body.source)
    .bind(body.duration_ms)
    .bind(&body.fingerprint_path)
    .execute(&state.db)
    .await?;

    let row = sqlx::query_as::<_, Recording>(&format!("{RECORDING_SELECT} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn delete_recording(
    State(state): State<AppState>,
    Path((_song_id, _version_id, id)): Path<(String, i64, String)>,
) -> Result<StatusCode, ApiError> {
    delete_or_not_found("DELETE FROM recordings WHERE id = ?", &id, &state.db, "recording").await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use tower::ServiceExt;

    use crate::routes;
    use crate::test_helpers::{body_json, json_request, spawn_test_state};

    #[tokio::test]
    async fn song_crud() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                "/api/songs",
                Some(r#"{"title":"Test Song","artist":"Test Artist"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
        let body = body_json(resp).await;
        let id = body["id"].as_str().unwrap().to_string();

        let resp = app
            .clone()
            .oneshot(json_request(Method::GET, "/api/songs", None))
            .await
            .unwrap();
        let list = body_json(resp).await;
        assert_eq!(list.as_array().unwrap().len(), 1);

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::PUT,
                &format!("/api/songs/{id}"),
                Some(r#"{"title":"Renamed"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(body_json(resp).await["title"], "Renamed");

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::DELETE,
                &format!("/api/songs/{id}"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn song_versions_and_recordings() {
        let state = spawn_test_state().await;
        let app = routes::build_router(state);

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                "/api/songs",
                Some(r#"{"title":"Song"}"#),
            ))
            .await
            .unwrap();
        let song_id = body_json(resp).await["id"].as_str().unwrap().to_string();

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/songs/{song_id}/versions"),
                Some(r#"{"name":"Studio Mix","bpm":120.0}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
        let version_id = body_json(resp).await["id"].as_i64().unwrap();

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::GET,
                &format!("/api/songs/{song_id}/versions"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(body_json(resp).await.as_array().unwrap().len(), 1);

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                &format!("/api/songs/{song_id}/versions/{version_id}/recordings"),
                Some(r#"{"file_path":"/audio/song.wav","source":"studio"}"#),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);

        let resp = app
            .clone()
            .oneshot(json_request(
                Method::GET,
                &format!("/api/songs/{song_id}/versions/{version_id}/recordings"),
                None,
            ))
            .await
            .unwrap();
        assert_eq!(body_json(resp).await.as_array().unwrap().len(), 1);
    }
}
