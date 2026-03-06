-- Concert programs, concerts, cue lists, and cues

CREATE TABLE IF NOT EXISTS concert_programs (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    entries_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS concerts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    program_id TEXT REFERENCES concert_programs(id) ON DELETE SET NULL,
    stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE RESTRICT,
    date TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    performers_json TEXT NOT NULL DEFAULT '[]',
    program_entries_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_concerts_stage_id ON concerts(stage_id);
CREATE INDEX IF NOT EXISTS idx_concerts_program_id ON concerts(program_id);

CREATE TABLE IF NOT EXISTS cue_lists (
    id TEXT PRIMARY KEY NOT NULL,
    concert_id TEXT NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    program_entry_id TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cue_lists_concert_id ON cue_lists(concert_id);

CREATE TABLE IF NOT EXISTS cues (
    id TEXT PRIMARY KEY NOT NULL,
    cue_list_id TEXT NOT NULL REFERENCES cue_lists(id) ON DELETE CASCADE,
    number REAL NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    pre_wait_ms INTEGER NOT NULL DEFAULT 0,
    fade_time_ms INTEGER NOT NULL DEFAULT 0,
    post_wait_ms INTEGER NOT NULL DEFAULT 0,
    auto_follow INTEGER NOT NULL DEFAULT 0,
    trigger_type TEXT NOT NULL DEFAULT 'manual',
    scene_json TEXT NOT NULL DEFAULT '{}',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cues_cue_list_id ON cues(cue_list_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cues_number ON cues(cue_list_id, number);
