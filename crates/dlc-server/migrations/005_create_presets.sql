CREATE TABLE IF NOT EXISTS presets (
    id TEXT PRIMARY KEY NOT NULL,
    show_id TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    fixture_type TEXT NOT NULL,
    mode TEXT NOT NULL,
    values_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_presets_show_id ON presets(show_id);
