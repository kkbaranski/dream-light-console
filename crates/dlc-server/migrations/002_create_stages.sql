CREATE TABLE IF NOT EXISTS stages (
    id TEXT PRIMARY KEY NOT NULL,
    show_id TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    floor_material_id TEXT NOT NULL DEFAULT 'floor-pavement',
    wall_material_id TEXT NOT NULL DEFAULT 'wall-white',
    floor_tile_size REAL NOT NULL DEFAULT 1.0,
    wall_tile_size REAL NOT NULL DEFAULT 1.0,
    stage_model_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stages_show_id ON stages(show_id);
