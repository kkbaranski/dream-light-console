CREATE TABLE IF NOT EXISTS fixture_library (
    id TEXT PRIMARY KEY NOT NULL,
    label TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'builtin',  -- 'builtin' | 'gdtf' | 'custom'
    definition_json TEXT NOT NULL,           -- Full DeviceDef as JSON
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
