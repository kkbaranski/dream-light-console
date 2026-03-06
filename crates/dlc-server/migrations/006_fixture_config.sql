-- Per-fixture runtime config (channel map, wheel slot overrides)
ALTER TABLE fixtures ADD COLUMN config_json TEXT NOT NULL DEFAULT '{}';
