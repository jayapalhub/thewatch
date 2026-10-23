-- Operations tables added after the 2026-10-23 D1 read limit outage.
-- usage_daily: rows read and written per day, flushed from the metered DB wrapper about once a minute per worker.
-- ops_runs: last run time and result of each scheduled job, read by /api/health.
CREATE TABLE IF NOT EXISTS usage_daily (
  day TEXT PRIMARY KEY,
  reads INTEGER NOT NULL DEFAULT 0,
  writes INTEGER NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ops_runs (
  name TEXT PRIMARY KEY,
  last_at TEXT NOT NULL,
  last_ok INTEGER NOT NULL DEFAULT 1,
  detail TEXT
);
