-- Publish by default: pending rows from feeds and research carry an auto_publish_at time.
-- hold=1 keeps a row waiting for a human (missing venue, time behind a login, doubtful fit).
ALTER TABLE events ADD COLUMN auto_publish_at TEXT;
ALTER TABLE events ADD COLUMN hold INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_events_autopub ON events(status, auto_publish_at);
