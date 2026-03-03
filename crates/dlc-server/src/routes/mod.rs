mod health;
mod objects;
mod shows;
mod stages;

use axum::{
    http::StatusCode,
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use tower_http::services::ServeDir;

use crate::state::AppState;

pub fn build_router(state: AppState) -> Router {
    let static_dir = state.config.static_dir().to_string();
    let index_html =
        std::fs::read_to_string(format!("{static_dir}/index.html")).unwrap_or_default();

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
        .with_state(state)
}
