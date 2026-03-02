use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub engine_hz: u32,
    pub connected_clients: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ShowSummary {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StageSummary {
    pub id: String,
    pub show_id: String,
    pub name: String,
    pub floor_material_id: String,
    pub wall_material_id: String,
    pub floor_tile_size: f64,
    pub wall_tile_size: f64,
    pub stage_model_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum MergeMode {
    Htp,
    Ltp,
}
