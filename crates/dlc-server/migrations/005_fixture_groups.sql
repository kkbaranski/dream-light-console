-- Fixture groups for concerts

CREATE TABLE IF NOT EXISTS fixture_groups (
    id TEXT PRIMARY KEY NOT NULL,
    concert_id TEXT NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    fixture_placement_ids_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_fixture_groups_concert_id ON fixture_groups(concert_id);
