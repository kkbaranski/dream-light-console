-- Fixture inventory

CREATE TABLE IF NOT EXISTS fixtures (
    id TEXT PRIMARY KEY NOT NULL,
    fixture_type_id TEXT NOT NULL,
    dmx_mode TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL DEFAULT '',
    serial_number TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    avatar_path TEXT NOT NULL DEFAULT '',
    default_universe INTEGER NOT NULL DEFAULT 1,
    default_address INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
