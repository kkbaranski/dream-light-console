-- Scene objects stored as a JSON array per stage.
-- This avoids normalizing the capability system into SQL columns.
CREATE TABLE IF NOT EXISTS stage_objects (
    stage_id TEXT PRIMARY KEY NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    objects_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
