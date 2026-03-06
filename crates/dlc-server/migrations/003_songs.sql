-- Songs, versions (composite PK), and recordings

CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS song_versions (
    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    bpm REAL,
    duration_ms INTEGER,
    key_signature TEXT NOT NULL DEFAULT '',
    structure_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (song_id, id)
);
CREATE INDEX IF NOT EXISTS idx_song_versions_song_id ON song_versions(song_id);

CREATE TABLE IF NOT EXISTS recordings (
    id TEXT PRIMARY KEY NOT NULL,
    song_id TEXT NOT NULL,
    version_id INTEGER NOT NULL,
    file_path TEXT NOT NULL DEFAULT '',
    file_hash TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER,
    fingerprint_path TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (song_id, version_id) REFERENCES song_versions(song_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_recordings_version ON recordings(song_id, version_id);
