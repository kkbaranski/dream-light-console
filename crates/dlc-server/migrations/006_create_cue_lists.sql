CREATE TABLE IF NOT EXISTS cue_lists (
    id TEXT PRIMARY KEY NOT NULL,
    show_id TEXT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tracking_mode TEXT NOT NULL DEFAULT 'tracking',  -- 'tracking' | 'cue_only' | 'assert'
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cue_lists_show_id ON cue_lists(show_id);
