use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::mpsc;
use std::sync::Arc;
use std::time::Duration;

use dlc_protocol::{EngineCommand, ENGINE_HZ};
use serde::Deserialize;
use serde_json::Value;
use sqlx::SqlitePool;
use tokio::sync::Mutex;

use crate::fixture_types::FixtureTypeDef;

/// A fixture state entry within a cue's scene_json.
/// The scene_json contains all data needed to resolve DMX channels without
/// additional DB lookups.
#[derive(Debug, Deserialize)]
struct FixtureState {
    fixture_type_id: String,
    dmx_mode: String,
    universe: u16,
    dmx_address: u16,
    #[serde(default)]
    values: serde_json::Map<String, Value>,
}

/// The scene_json structure stored in cues.
#[derive(Debug, Deserialize)]
struct SceneData {
    #[serde(default)]
    fixtures: Vec<FixtureState>,
}

#[derive(Debug, sqlx::FromRow)]
struct CueRow {
    id: String,
    cue_list_id: String,
    number: f64,
    fade_time_ms: i64,
    auto_follow: bool,
    post_wait_ms: i64,
    scene_json: String,
}

#[derive(Debug)]
pub enum CueError {
    CueNotFound(String),
    FixtureNotFound(String),
    NoCuesInList,
    EndOfList,
    Database(sqlx::Error),
    InvalidJson(serde_json::Error),
}

impl std::fmt::Display for CueError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::CueNotFound(id) => write!(f, "cue not found: {id}"),
            Self::FixtureNotFound(id) => write!(f, "fixture type not found: {id}"),
            Self::NoCuesInList => write!(f, "no cues in list"),
            Self::EndOfList => write!(f, "end of cue list"),
            Self::Database(e) => write!(f, "database error: {e}"),
            Self::InvalidJson(e) => write!(f, "json parse error: {e}"),
        }
    }
}

impl From<sqlx::Error> for CueError {
    fn from(e: sqlx::Error) -> Self {
        Self::Database(e)
    }
}

impl From<serde_json::Error> for CueError {
    fn from(e: serde_json::Error) -> Self {
        Self::InvalidJson(e)
    }
}

struct ResolvedChannel {
    universe: u16,
    channel: u16,
    target: u8,
}

struct ActiveCueList {
    current_cue_id: String,
    stop_signal: Arc<tokio::sync::Notify>,
    /// Last resolved channel values for fade direction comparison.
    /// Key: (universe, channel), Value: target DMX value from previous cue.
    last_values: HashMap<(u16, u16), u8>,
}

#[derive(Clone)]
pub struct CueExecutor {
    db: SqlitePool,
    engine_tx: mpsc::SyncSender<EngineCommand>,
    active_lists: Arc<Mutex<HashMap<String, ActiveCueList>>>,
    fixture_types: Arc<HashMap<String, FixtureTypeDef>>,
}

impl CueExecutor {
    pub fn new(
        db: SqlitePool,
        engine_tx: mpsc::SyncSender<EngineCommand>,
        fixture_types: Arc<HashMap<String, FixtureTypeDef>>,
    ) -> Self {
        Self {
            db,
            engine_tx,
            active_lists: Arc::new(Mutex::new(HashMap::new())),
            fixture_types,
        }
    }

    pub async fn go(&self, cue_list_id: &str) -> Result<String, CueError> {
        let current_number = {
            let active = self.active_lists.lock().await;
            match active.get(cue_list_id) {
                Some(entry) => {
                    let cue = self.load_cue(&entry.current_cue_id).await?;
                    Some(cue.number)
                }
                None => None,
            }
        };

        let next_cue = match current_number {
            Some(num) => self.find_next_cue(cue_list_id, num).await?,
            None => self.find_first_cue(cue_list_id).await?,
        };

        match next_cue {
            Some(cue) => {
                let cue_id = cue.id.clone();
                self.execute_cue(cue).await?;
                Ok(cue_id)
            }
            None if current_number.is_some() => Err(CueError::EndOfList),
            None => Err(CueError::NoCuesInList),
        }
    }

    pub async fn fire(&self, cue_id: &str) -> Result<(), CueError> {
        let cue = self.load_cue(cue_id).await?;
        self.execute_cue(cue).await
    }

    pub async fn stop(&self, cue_list_id: &str) {
        let mut active = self.active_lists.lock().await;
        if let Some(entry) = active.remove(cue_list_id) {
            entry.stop_signal.notify_one();
        }
    }

    fn execute_cue(
        &self,
        cue: CueRow,
    ) -> Pin<Box<dyn Future<Output = Result<(), CueError>> + Send + '_>> {
        Box::pin(async move {
            let cue_list_id = cue.cue_list_id.clone();
            let cue_id = cue.id.clone();

            {
                let active = self.active_lists.lock().await;
                if let Some(entry) = active.get(&cue_list_id) {
                    entry.stop_signal.notify_one();
                }
            }

            let channels = self.resolve_cue_channels(&cue)?;

            let fade_frames = ms_to_frames(cue.fade_time_ms);

            // Read previous channel values for fade direction comparison.
            let prev_values = {
                let active = self.active_lists.lock().await;
                active
                    .get(&cue_list_id)
                    .map(|entry| entry.last_values.clone())
                    .unwrap_or_default()
            };

            for ch in &channels {
                let prev = prev_values.get(&(ch.universe, ch.channel)).copied().unwrap_or(0);
                let frames = if ch.target == prev {
                    0
                } else {
                    fade_frames
                };
                let _ = self.engine_tx.try_send(EngineCommand::FadeChannel {
                    universe: ch.universe,
                    channel: ch.channel,
                    target: ch.target,
                    frames,
                });
            }

            tracing::info!(
                cue_id = %cue_id,
                channels = channels.len(),
                fade_frames,
                "Fired cue"
            );

            let stop_signal = Arc::new(tokio::sync::Notify::new());

            if cue.auto_follow {
                let total_delay_ms = cue.fade_time_ms + cue.post_wait_ms;
                let total_delay = Duration::from_millis(total_delay_ms as u64);
                let executor = self.clone();
                let list_id = cue_list_id.clone();
                let cue_number = cue.number;
                let signal = stop_signal.clone();

                tokio::spawn(async move {
                    let cancelled = tokio::select! {
                        _ = signal.notified() => true,
                        _ = tokio::time::sleep(total_delay) => false,
                    };
                    if cancelled {
                        return;
                    }
                    if let Ok(Some(next)) =
                        executor.find_next_cue(&list_id, cue_number).await
                    {
                        let _ = executor.execute_cue(next).await;
                    }
                });
            }

            let new_values: HashMap<(u16, u16), u8> = channels
                .iter()
                .map(|ch| ((ch.universe, ch.channel), ch.target))
                .collect();

            let mut active = self.active_lists.lock().await;
            // Merge: start from previous values, overlay with new cue's values.
            let mut merged = prev_values;
            merged.extend(&new_values);

            active.insert(
                cue_list_id,
                ActiveCueList {
                    current_cue_id: cue_id,
                    stop_signal,
                    last_values: merged,
                },
            );

            Ok(())
        })
    }

    async fn load_cue(&self, cue_id: &str) -> Result<CueRow, CueError> {
        sqlx::query_as::<_, CueRow>(
            "SELECT id, cue_list_id, number, fade_time_ms, auto_follow, post_wait_ms, scene_json FROM cues WHERE id = ?",
        )
        .bind(cue_id)
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| CueError::CueNotFound(cue_id.to_string()))
    }

    async fn find_first_cue(&self, cue_list_id: &str) -> Result<Option<CueRow>, CueError> {
        Ok(sqlx::query_as::<_, CueRow>(
            "SELECT id, cue_list_id, number, fade_time_ms, auto_follow, post_wait_ms, scene_json FROM cues WHERE cue_list_id = ? ORDER BY number ASC LIMIT 1",
        )
        .bind(cue_list_id)
        .fetch_optional(&self.db)
        .await?)
    }

    async fn find_next_cue(
        &self,
        cue_list_id: &str,
        after_number: f64,
    ) -> Result<Option<CueRow>, CueError> {
        Ok(sqlx::query_as::<_, CueRow>(
            "SELECT id, cue_list_id, number, fade_time_ms, auto_follow, post_wait_ms, scene_json FROM cues WHERE cue_list_id = ? AND number > ? ORDER BY number ASC LIMIT 1",
        )
        .bind(cue_list_id)
        .bind(after_number)
        .fetch_optional(&self.db)
        .await?)
    }

    /// Resolve a cue's scene_json into DMX channel targets.
    /// Scene JSON contains fixture states with denormalized fixture type info.
    fn resolve_cue_channels(&self, cue: &CueRow) -> Result<Vec<ResolvedChannel>, CueError> {
        let scene: SceneData = serde_json::from_str(&cue.scene_json)?;
        let mut channels = Vec::new();

        for fixture_state in &scene.fixtures {
            let definition = self
                .fixture_types
                .get(&fixture_state.fixture_type_id)
                .map(|ft| &ft.definition)
                .ok_or_else(|| {
                    CueError::FixtureNotFound(fixture_state.fixture_type_id.clone())
                })?;

            let mode_config = definition
                .get("modes")
                .and_then(|m| m.get(&fixture_state.dmx_mode))
                .ok_or_else(|| {
                    CueError::FixtureNotFound(format!(
                        "{}:{}",
                        fixture_state.fixture_type_id, fixture_state.dmx_mode
                    ))
                })?;

            let base = fixture_state.dmx_address.saturating_sub(1);
            let resolved = resolve_mode_channels(
                mode_config,
                &fixture_state.values,
                fixture_state.universe,
                base,
            );
            channels.extend(resolved);
        }

        Ok(channels)
    }
}

fn resolve_mode_channels(
    mode_config: &Value,
    values: &serde_json::Map<String, Value>,
    universe: u16,
    base_channel: u16,
) -> Vec<ResolvedChannel> {
    let mode_obj = match mode_config.as_object() {
        Some(obj) => obj,
        None => return vec![],
    };

    let mut channels = Vec::new();
    for (feature_name, feature_config) in mode_obj {
        let resolved = resolve_feature(feature_name, feature_config, values, universe, base_channel);
        channels.extend(resolved);
    }
    channels
}

fn resolve_feature(
    feature_name: &str,
    feature_config: &Value,
    values: &serde_json::Map<String, Value>,
    universe: u16,
    base: u16,
) -> Vec<ResolvedChannel> {
    let dmx_config = match feature_config.get("dmx") {
        Some(d) if d.is_object() && !d.as_object().unwrap().is_empty() => d,
        _ => return vec![],
    };

    match feature_name {
        "dimmer" | "pan" | "tilt" | "colorWheel" => {
            let field = if feature_name == "colorWheel" {
                "colorWheelIndex"
            } else {
                feature_name
            };
            resolve_linear8(dmx_config, field, values, universe, base)
        }
        "beam" => resolve_linear8(dmx_config, "coneAngle", values, universe, base),
        "rgbColor" => resolve_rgb(dmx_config, values, universe, base),
        "dualWhite" => resolve_dual_white(dmx_config, values, universe, base),
        _ => vec![],
    }
}

fn resolve_linear8(
    dmx_config: &Value,
    field_name: &str,
    values: &serde_json::Map<String, Value>,
    universe: u16,
    base: u16,
) -> Vec<ResolvedChannel> {
    let offset = match dmx_config.get("offset").and_then(|v| v.as_u64()) {
        Some(o) => o as u16,
        None => return vec![],
    };
    let value = values
        .get(field_name)
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u8;
    vec![ResolvedChannel {
        universe,
        channel: base + offset,
        target: value,
    }]
}

fn resolve_rgb(
    dmx_config: &Value,
    values: &serde_json::Map<String, Value>,
    universe: u16,
    base: u16,
) -> Vec<ResolvedChannel> {
    let red_offset = dmx_config
        .get("red")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u16;
    let green_offset = dmx_config
        .get("green")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u16;
    let blue_offset = dmx_config
        .get("blue")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u16;
    let hex = values
        .get("color")
        .and_then(|v| v.as_str())
        .unwrap_or("#000000");
    let (r, g, b) = parse_hex_color(hex);
    vec![
        ResolvedChannel {
            universe,
            channel: base + red_offset,
            target: r,
        },
        ResolvedChannel {
            universe,
            channel: base + green_offset,
            target: g,
        },
        ResolvedChannel {
            universe,
            channel: base + blue_offset,
            target: b,
        },
    ]
}

fn resolve_dual_white(
    dmx_config: &Value,
    values: &serde_json::Map<String, Value>,
    universe: u16,
    base: u16,
) -> Vec<ResolvedChannel> {
    let warm_offset = dmx_config
        .get("warm")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u16;
    let cold_offset = dmx_config
        .get("cold")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u16;
    let warm = values
        .get("warmWhite")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u8;
    let cold = values
        .get("coldWhite")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u8;
    vec![
        ResolvedChannel {
            universe,
            channel: base + warm_offset,
            target: warm,
        },
        ResolvedChannel {
            universe,
            channel: base + cold_offset,
            target: cold,
        },
    ]
}

fn parse_hex_color(hex: &str) -> (u8, u8, u8) {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 {
        return (0, 0, 0);
    }
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
    (r, g, b)
}

fn ms_to_frames(ms: i64) -> u32 {
    if ms <= 0 {
        return 0;
    }
    ((ms as u64 * ENGINE_HZ as u64) / 1000) as u32
}
