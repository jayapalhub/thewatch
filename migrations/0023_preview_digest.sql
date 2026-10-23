-- Saturday previews: a city with no subscribers builds its issue but sends no preview email; those cities are listed
-- in one Saturday digest instead. preview_skipped marks such an issue; weekend_digests claims the one digest per week.
ALTER TABLE issues ADD COLUMN preview_skipped INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS weekend_digests (week_start TEXT PRIMARY KEY, sent_at TEXT NOT NULL DEFAULT (datetime('now')), body TEXT);
