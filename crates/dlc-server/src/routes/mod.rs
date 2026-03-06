pub mod concert_programs;
pub mod concerts;
pub mod cue_lists;
pub mod cues;
pub mod dmx;
pub mod fixture_groups;
pub mod fixture_types;
pub mod fixtures;
pub mod health;
pub mod objects;
pub mod placements;
pub mod playback;
pub mod songs;
pub mod stages;
pub mod ws;

use axum::{
    http::{header, Method, StatusCode},
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

use crate::state::AppState;

pub fn build_api_router(state: AppState) -> Router {
    let static_dir = state.config.static_dir().to_string();
    let index_html =
        std::fs::read_to_string(format!("{static_dir}/index.html")).unwrap_or_default();

    let mut cors = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);
    if state.config.cors_allow_any {
        cors = cors.allow_origin(Any);
    }

    let api_routes = Router::new()
        // Health
        .route("/health", get(health::health))
        // Fixture types (read-only from memory)
        .route("/api/fixture-types", get(fixture_types::list))
        .route("/api/fixture-types/{id}", get(fixture_types::get))
        // Fixtures (inventory CRUD)
        .route(
            "/api/fixtures",
            get(fixtures::list).post(fixtures::create),
        )
        .route(
            "/api/fixtures/{id}",
            get(fixtures::get)
                .put(fixtures::update)
                .delete(fixtures::delete),
        )
        .route(
            "/api/fixtures/{id}/avatar",
            axum::routing::put(fixtures::upload_avatar)
                .delete(fixtures::delete_avatar),
        )
        // Stages (top-level CRUD)
        .route(
            "/api/stages",
            get(stages::list).post(stages::create),
        )
        .route(
            "/api/stages/{id}",
            get(stages::get)
                .put(stages::update)
                .delete(stages::delete),
        )
        // Fixture placements (nested under stages)
        .route(
            "/api/stages/{stage_id}/placements",
            get(placements::list).post(placements::create),
        )
        .route(
            "/api/stages/{stage_id}/placements/{id}",
            get(placements::get)
                .put(placements::update)
                .delete(placements::delete),
        )
        // Stage objects (nested under stages)
        .route(
            "/api/stages/{stage_id}/objects",
            get(objects::list)
                .post(objects::create)
                .put(objects::put_bulk),
        )
        .route(
            "/api/stages/{stage_id}/objects/{id}",
            get(objects::get)
                .put(objects::update)
                .delete(objects::delete),
        )
        // Songs
        .route(
            "/api/songs",
            get(songs::list).post(songs::create),
        )
        .route(
            "/api/songs/{id}",
            get(songs::get)
                .put(songs::update)
                .delete(songs::delete),
        )
        // Song versions (nested under songs)
        .route(
            "/api/songs/{song_id}/versions",
            get(songs::list_versions).post(songs::create_version),
        )
        .route(
            "/api/songs/{song_id}/versions/{id}",
            axum::routing::delete(songs::delete_version),
        )
        // Recordings (nested under song versions)
        .route(
            "/api/songs/{song_id}/versions/{version_id}/recordings",
            get(songs::list_recordings).post(songs::create_recording),
        )
        .route(
            "/api/songs/{song_id}/versions/{version_id}/recordings/{id}",
            axum::routing::delete(songs::delete_recording),
        )
        // Concert programs
        .route(
            "/api/concert-programs",
            get(concert_programs::list).post(concert_programs::create),
        )
        .route(
            "/api/concert-programs/{id}",
            get(concert_programs::get)
                .put(concert_programs::update)
                .delete(concert_programs::delete),
        )
        // Concerts
        .route(
            "/api/concerts",
            get(concerts::list).post(concerts::create),
        )
        .route(
            "/api/concerts/{id}",
            get(concerts::get)
                .put(concerts::update)
                .delete(concerts::delete),
        )
        .route(
            "/api/concerts/{id}/status",
            axum::routing::patch(concerts::update_status),
        )
        // Fixture groups (nested under concerts)
        .route(
            "/api/concerts/{concert_id}/fixture-groups",
            get(fixture_groups::list).post(fixture_groups::create),
        )
        .route(
            "/api/concerts/{concert_id}/fixture-groups/{id}",
            axum::routing::put(fixture_groups::update)
                .delete(fixture_groups::delete),
        )
        // Cue lists (nested under concerts)
        .route(
            "/api/concerts/{concert_id}/cue-lists",
            get(cue_lists::list).post(cue_lists::create),
        )
        .route(
            "/api/concerts/{concert_id}/cue-lists/{id}",
            axum::routing::put(cue_lists::update)
                .delete(cue_lists::delete),
        )
        // Cues (nested under cue lists)
        .route(
            "/api/concerts/{concert_id}/cue-lists/{cue_list_id}/cues",
            get(cues::list).post(cues::create),
        )
        .route(
            "/api/concerts/{concert_id}/cue-lists/{cue_list_id}/cues/{id}",
            axum::routing::put(cues::update)
                .delete(cues::delete),
        )
        // Playback (nested under concert cue lists)
        .route(
            "/api/concerts/{concert_id}/cue-lists/{id}/go",
            axum::routing::post(playback::go),
        )
        .route(
            "/api/concerts/{concert_id}/cue-lists/{id}/stop",
            axum::routing::post(playback::stop),
        )
        // DMX direct control
        .route(
            "/api/universes/{universe}/channels/{channel}",
            axum::routing::put(dmx::set_channel),
        )
        .route(
            "/api/dmx/reconnect",
            axum::routing::post(dmx::reconnect),
        );

    Router::new()
        .merge(api_routes)
        .nest_service("/data", ServeDir::new("data"))
        .fallback_service(ServeDir::new(&static_dir).fallback(get(move || {
            let html = index_html.clone();
            async move {
                if html.is_empty() {
                    StatusCode::NOT_FOUND.into_response()
                } else {
                    Html(html).into_response()
                }
            }
        })))
        .layer(cors)
        .with_state(state)
}

pub fn build_ws_router(state: AppState) -> Router {
    Router::new()
        .route("/ws", get(ws::upgrade))
        .route("/health", get(health::health))
        .with_state(state)
}
