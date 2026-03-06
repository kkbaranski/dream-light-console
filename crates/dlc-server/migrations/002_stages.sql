-- Stages, fixture placements, and scene objects

CREATE TABLE IF NOT EXISTS stages (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    location_name TEXT NOT NULL DEFAULT '',
    location_address TEXT NOT NULL DEFAULT '',
    dimensions_json TEXT NOT NULL DEFAULT '{}',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fixture_placements (
    id TEXT PRIMARY KEY NOT NULL,
    stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    fixture_id TEXT NOT NULL REFERENCES fixtures(id) ON DELETE RESTRICT,
    universe INTEGER NOT NULL DEFAULT 1,
    dmx_address INTEGER NOT NULL DEFAULT 1,
    position_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"z":0}',
    orientation_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"z":0}',
    label_override TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_fixture_placements_stage_id ON fixture_placements(stage_id);
CREATE INDEX IF NOT EXISTS idx_fixture_placements_fixture_id ON fixture_placements(fixture_id);

CREATE TABLE IF NOT EXISTS stage_objects (
    id TEXT PRIMARY KEY NOT NULL,
    stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    object_type TEXT NOT NULL,
    position_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"z":0}',
    dimensions_json TEXT NOT NULL DEFAULT '{}',
    model_ref TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_stage_objects_stage_id ON stage_objects(stage_id);
