-- Monday numbers email: one row per week so the hourly tick sends it once.
CREATE TABLE IF NOT EXISTS digest_log (
  week_start TEXT PRIMARY KEY,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
