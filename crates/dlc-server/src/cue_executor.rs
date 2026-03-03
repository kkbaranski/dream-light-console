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

#[derive(Debug, Deserialize)]
struct PresetRef {
    preset_id: String,
    #[serde(default)]
    targets: Vec<DmxTarget>,
}

#[derive(Debug, Deserialize)]
struct DmxTarget {
    universe: u16,
    start_channel: u16,
}

#[derive(Debug, sqlx::FromRow)]
struct CueRow {
    id: String,
    cue_list_id: String,
    cue_number: f64,
    fade_up_ms: i64,
    fade_down_ms: i64,
    follow_ms: Option<i64>,
    preset_refs_json: String,
}

#[derive(Debug, sqlx::FromRow)]
struct PresetRow {
    fixture_type: String,
    mode: String,
    values_json: String,
}

#[derive(Debug)]
pub enum CueError {
    CueNotFound(String),
    PresetNotFound(String),
    FixtureNotFound(String),
    NoCuesInList,
    Database(sqlx::Error),
    InvalidJson(serde_json::Error),
}

impl std::fmt::Display for CueError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::CueNotFound(id) => write!(f, "cue not found: {id}"),
            Self::PresetNotFound(id) => write!(f, "preset not found: {id}"),
            Self::FixtureNotFound(id) => write!(f, "fixture not found: {id}"),
            Self::NoCuesInList => write!(f, "no cues in list"),
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
}

#[derive(Clone)]
pub struct CueExecutor {
    db: SqlitePool,
    engine_tx: mpsc::SyncSender<EngineCommand>,
    active_lists: Arc<Mutex<HashMap<String, ActiveCueList>>>,
}

impl CueExecutor {
    pub fn new(db: SqlitePool, engine_tx: mpsc::SyncSender<EngineCommand>) -> Self {
        Self {
            db,
            engine_tx,
            active_lists: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn go(&self, cue_list_id: &str) -> Result<String, CueError> {
        let current_number = {
            let active = self.active_lists.lock().await;
            match active.get(cue_list_id) {
                Some(entry) => {
                    let cue = self.load_cue(&entry.current_cue_id).await?;
                    Some(cue.cue_number)
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

            let channels = self.resolve_cue_channels(&cue).await?;

            let fade_up_frames = ms_to_frames(cue.fade_up_ms);
            let fade_down_frames = ms_to_frames(cue.fade_down_ms);
            let fade_frames = fade_up_frames.max(fade_down_frames);

            for ch in &channels {
                let _ = self.engine_tx.try_send(EngineCommand::FadeChannel {
                    universe: ch.universe,
                    channel: ch.channel,
                    target: ch.target,
                    frames: fade_frames,
                });
            }

            tracing::info!(
                cue_id = %cue_id,
                channels = channels.len(),
                fade_frames,
                "Fired cue"
            );

            let stop_signal = Arc::new(tokio::sync::Notify::new());

            if let Some(follow_ms) = cue.follow_ms {
                let max_fade_ms = cue.fade_up_ms.max(cue.fade_down_ms);
                let total_delay = Duration::from_millis((max_fade_ms + follow_ms) as u64);
                let executor = self.clone();
                let list_id = cue_list_id.clone();
                let cue_number = cue.cue_number;
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

            let mut active = self.active_lists.lock().await;
            active.insert(
                cue_list_id,
                ActiveCueList {
                    current_cue_id: cue_id,
                    stop_signal,
                },
            );

            Ok(())
        })
    }

    async fn load_cue(&self, cue_id: &str) -> Result<CueRow, CueError> {
        sqlx::query_as::<_, CueRow>(
            "SELECT id, cue_list_id, cue_number, fade_up_ms, fade_down_ms, follow_ms, preset_refs_json FROM cues WHERE id = ?",
        )
        .bind(cue_id)
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| CueError::CueNotFound(cue_id.to_string()))
    }

    async fn find_first_cue(&self, cue_list_id: &str) -> Result<Option<CueRow>, CueError> {
        Ok(sqlx::query_as::<_, CueRow>(
            "SELECT id, cue_list_id, cue_number, fade_up_ms, fade_down_ms, follow_ms, preset_refs_json FROM cues WHERE cue_list_id = ? ORDER BY cue_number ASC LIMIT 1",
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
            "SELECT id, cue_list_id, cue_number, fade_up_ms, fade_down_ms, follow_ms, preset_refs_json FROM cues WHERE cue_list_id = ? AND cue_number > ? ORDER BY cue_number ASC LIMIT 1",
        )
        .bind(cue_list_id)
        .bind(after_number)
        .fetch_optional(&self.db)
        .await?)
    }

    async fn load_preset(&self, preset_id: &str) -> Result<PresetRow, CueError> {
        sqlx::query_as::<_, PresetRow>(
            "SELECT fixture_type, mode, values_json FROM presets WHERE id = ?",
        )
        .bind(preset_id)
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| CueError::PresetNotFound(preset_id.to_string()))
    }

    async fn load_fixture_definition(&self, fixture_type: &str) -> Result<Value, CueError> {
        let json_str: String = sqlx::query_scalar(
            "SELECT definition_json FROM fixture_library WHERE id = ?",
        )
        .bind(fixture_type)
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| CueError::FixtureNotFound(fixture_type.to_string()))?;

        Ok(serde_json::from_str(&json_str)?)
    }

    async fn resolve_cue_channels(&self, cue: &CueRow) -> Result<Vec<ResolvedChannel>, CueError> {
        let preset_refs: Vec<PresetRef> = serde_json::from_str(&cue.preset_refs_json)?;
        let mut channels = Vec::new();

        for preset_ref in &preset_refs {
            let preset = self.load_preset(&preset_ref.preset_id).await?;
            let definition = self.load_fixture_definition(&preset.fixture_type).await?;
            let values: serde_json::Map<String, Value> =
                serde_json::from_str(&preset.values_json)?;

            let mode_config = definition
                .get("modes")
                .and_then(|m| m.get(&preset.mode))
                .ok_or_else(|| {
                    CueError::FixtureNotFound(format!("{}:{}", preset.fixture_type, preset.mode))
                })?;

            for target in &preset_ref.targets {
                let base = target.start_channel.saturating_sub(1);
                let resolved =
                    resolve_mode_channels(mode_config, &values, target.universe, base);
                channels.extend(resolved);
            }
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
    for (cap_name, cap_config) in mode_obj {
        let resolved = resolve_capability(cap_name, cap_config, values, universe, base_channel);
        channels.extend(resolved);
    }
    channels
}

fn resolve_capability(
    cap_name: &str,
    cap_config: &Value,
    values: &serde_json::Map<String, Value>,
    universe: u16,
    base: u16,
) -> Vec<ResolvedChannel> {
    let dmx_config = match cap_config.get("dmx") {
        Some(d) if d.is_object() && !d.as_object().unwrap().is_empty() => d,
        _ => return vec![],
    };

    match cap_name {
        "dimmer" | "pan" | "tilt" | "colorWheel" => {
            let field = if cap_name == "colorWheel" {
                "colorWheelIndex"
            } else {
                cap_name
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
    let r_off = dmx_config
        .get("red")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u16;
    let g_off = dmx_config
        .get("green")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u16;
    let b_off = dmx_config
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
            channel: base + r_off,
            target: r,
        },
        ResolvedChannel {
            universe,
            channel: base + g_off,
            target: g,
        },
        ResolvedChannel {
            universe,
            channel: base + b_off,
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
    let warm_off = dmx_config
        .get("warm")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u16;
    let cold_off = dmx_config
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
            channel: base + warm_off,
            target: warm,
        },
        ResolvedChannel {
            universe,
            channel: base + cold_off,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ms_to_frames_conversion() {
        assert_eq!(ms_to_frames(0), 0);
        assert_eq!(ms_to_frames(-100), 0);
        assert_eq!(ms_to_frames(1000), 44);
        assert_eq!(ms_to_frames(2000), 88);
        assert_eq!(ms_to_frames(500), 22);
        assert_eq!(ms_to_frames(100), 4);
    }

    #[test]
    fn parse_hex_color_valid() {
        assert_eq!(parse_hex_color("#ff0000"), (255, 0, 0));
        assert_eq!(parse_hex_color("#00ff00"), (0, 255, 0));
        assert_eq!(parse_hex_color("#0000ff"), (0, 0, 255));
        assert_eq!(parse_hex_color("#ffffff"), (255, 255, 255));
        assert_eq!(parse_hex_color("#000000"), (0, 0, 0));
    }

    #[test]
    fn parse_hex_color_invalid() {
        assert_eq!(parse_hex_color("invalid"), (0, 0, 0));
        assert_eq!(parse_hex_color("#abc"), (0, 0, 0));
        assert_eq!(parse_hex_color(""), (0, 0, 0));
    }

    fn moving_head_mode() -> Value {
        serde_json::json!({
            "label": "7 Channel",
            "name": { "defaultName": "Moving Head" },
            "dmx": {},
            "power": {},
            "transform": {},
            "dimmer": { "dmx": { "offset": 0 } },
            "pan": { "dmx": { "offset": 1 }, "modelNode": "Yoke", "totalDegrees": 540 },
            "tilt": { "dmx": { "offset": 2 }, "modelNode": "Head" },
            "rgbColor": { "dmx": { "red": 3, "green": 4, "blue": 5 }, "defaultColor": "#ffffff" },
            "beam": { "dmx": { "offset": 6 }, "glowMaterialName": "Glow" }
        })
    }

    fn fresnel_mode() -> Value {
        serde_json::json!({
            "label": "4 Channel",
            "name": { "defaultName": "Fresnel" },
            "dmx": {},
            "power": {},
            "transform": {},
            "dimmer": { "dmx": { "offset": 0 } },
            "dualWhite": { "dmx": { "warm": 1, "cold": 2 } },
            "tilt": { "modelNode": "Base", "startDegrees": -60 },
            "beam": { "dmx": { "offset": 3 } }
        })
    }

    fn to_map(json: &str) -> serde_json::Map<String, Value> {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn resolve_moving_head_full_state() {
        let mode = moving_head_mode();
        let values = to_map(
            r##"{"dimmer": 255, "pan": 128, "tilt": 64, "color": "#ff0000", "coneAngle": 15}"##,
        );

        let channels = resolve_mode_channels(&mode, &values, 1, 0);
        let mut by_channel: Vec<(u16, u8)> =
            channels.iter().map(|c| (c.channel, c.target)).collect();
        by_channel.sort_by_key(|&(ch, _)| ch);

        assert_eq!(
            by_channel,
            vec![
                (0, 255), // dimmer
                (1, 128), // pan
                (2, 64),  // tilt
                (3, 255), // red
                (4, 0),   // green
                (5, 0),   // blue
                (6, 15),  // beam
            ]
        );
    }

    #[test]
    fn resolve_moving_head_partial_state() {
        let mode = moving_head_mode();
        let values = to_map(r#"{"dimmer": 200}"#);

        let channels = resolve_mode_channels(&mode, &values, 1, 0);
        let by_channel: HashMap<u16, u8> =
            channels.iter().map(|c| (c.channel, c.target)).collect();

        assert_eq!(*by_channel.get(&0).unwrap(), 200);
        assert_eq!(*by_channel.get(&1).unwrap(), 0); // pan defaults to 0
    }

    #[test]
    fn resolve_with_start_channel_offset() {
        let mode = moving_head_mode();
        let values = to_map(r#"{"dimmer": 255}"#);

        let channels = resolve_mode_channels(&mode, &values, 1, 9);
        let dimmer = channels.iter().find(|c| c.target == 255).unwrap();
        assert_eq!(dimmer.channel, 9); // base(9) + offset(0)
    }

    #[test]
    fn resolve_fresnel_dual_white() {
        let mode = fresnel_mode();
        let values = to_map(r#"{"dimmer": 200, "warmWhite": 180, "coldWhite": 100, "coneAngle": 30}"#);

        let channels = resolve_mode_channels(&mode, &values, 2, 0);
        let by_channel: HashMap<u16, u8> =
            channels.iter().map(|c| (c.channel, c.target)).collect();

        assert_eq!(*by_channel.get(&0).unwrap(), 200); // dimmer
        assert_eq!(*by_channel.get(&1).unwrap(), 180); // warm white
        assert_eq!(*by_channel.get(&2).unwrap(), 100); // cold white
        assert_eq!(*by_channel.get(&3).unwrap(), 30); // beam
    }

    #[test]
    fn resolve_skips_tilt_without_dmx() {
        let mode = fresnel_mode();
        let values = to_map(r#"{"tilt": 128}"#);

        let channels = resolve_mode_channels(&mode, &values, 1, 0);
        let tilt_channels: Vec<_> = channels
            .iter()
            .filter(|c| c.target == 128)
            .collect();
        assert!(tilt_channels.is_empty());
    }

    #[test]
    fn resolve_empty_values_defaults_to_zero() {
        let mode = moving_head_mode();
        let values = to_map(r#"{}"#);

        let channels = resolve_mode_channels(&mode, &values, 1, 0);
        assert!(channels.iter().all(|c| c.target == 0));
    }

    #[test]
    fn resolve_preserves_universe() {
        let mode = moving_head_mode();
        let values = to_map(r#"{"dimmer": 100}"#);

        let channels = resolve_mode_channels(&mode, &values, 3, 0);
        assert!(channels.iter().all(|c| c.universe == 3));
    }
}
