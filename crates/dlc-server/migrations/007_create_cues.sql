CREATE TABLE IF NOT EXISTS cues (
    id TEXT PRIMARY KEY NOT NULL,
    cue_list_id TEXT NOT NULL REFERENCES cue_lists(id) ON DELETE CASCADE,
    cue_number REAL NOT NULL,        -- supports decimal: 1, 1.5, 2, etc.
    label TEXT NOT NULL DEFAULT '',
    fade_up_ms INTEGER NOT NULL DEFAULT 0,
    fade_down_ms INTEGER NOT NULL DEFAULT 0,
    follow_ms INTEGER,               -- NULL = manual trigger, value = auto-follow delay
    preset_refs_json TEXT NOT NULL DEFAULT '[]',  -- array of preset IDs + fixture assignments
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cues_cue_list_id ON cues(cue_list_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cues_number ON cues(cue_list_id, cue_number);
