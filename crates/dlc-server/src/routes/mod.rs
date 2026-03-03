mod cue_lists;
mod cues;
mod health;
pub(crate) mod library;
mod objects;
mod presets;
mod shows;
mod stages;

use axum::{
    http::{header, Method, StatusCode},
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

use crate::state::AppState;

pub fn build_router(state: AppState) -> Router {
    let static_dir = state.config.static_dir().to_string();
    let index_html =
        std::fs::read_to_string(format!("{static_dir}/index.html")).unwrap_or_default();

    let mut cors = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);
    if state.config.cors_allow_any {
        cors = cors.allow_origin(Any);
    }

    let api_routes = Router::new()
        .route("/health", get(health::health))
        .route("/api/shows", get(shows::list).post(shows::create))
        .route(
            "/api/shows/{id}",
            get(shows::get).put(shows::update).delete(shows::delete),
        )
        .route(
            "/api/shows/{show_id}/stages",
            get(stages::list).post(stages::create),
        )
        .route(
            "/api/stages/{id}",
            get(stages::get).put(stages::update).delete(stages::delete),
        )
        .route(
            "/api/stages/{id}/objects",
            get(objects::get).put(objects::put),
        )
        .route(
            "/api/fixtures/library",
            get(library::list).post(library::create),
        )
        .route(
            "/api/fixtures/library/{id}",
            axum::routing::delete(library::delete),
        )
        .route(
            "/api/presets",
            get(presets::list).post(presets::create),
        )
        .route(
            "/api/presets/{id}",
            get(presets::get).put(presets::update).delete(presets::delete),
        )
        .route(
            "/api/shows/{show_id}/cuelists",
            get(cue_lists::list).post(cue_lists::create),
        )
        .route(
            "/api/cuelists/{id}",
            axum::routing::put(cue_lists::update).delete(cue_lists::delete),
        )
        .route(
            "/api/cuelists/{id}/cues",
            get(cues::list).post(cues::create),
        )
        .route(
            "/api/cues/{id}",
            axum::routing::put(cues::update).delete(cues::delete),
        );

    Router::new()
        .merge(api_routes)
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
