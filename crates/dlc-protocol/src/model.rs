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
pub struct StageSummary {
    pub id: String,
    pub name: String,
    pub location_name: String,
    pub location_address: String,
    pub dimensions_json: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ConcertSummary {
    pub id: String,
    pub name: String,
    pub stage_id: String,
    pub date: String,
    pub status: ConcertStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum ConcertStatus {
    Draft,
    Rehearsal,
    Ready,
    Live,
    Completed,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SongSummary {
    pub id: String,
    pub title: String,
    pub artist: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FixtureTypeSummary {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum MergeMode {
    Htp,
    Ltp,
}
