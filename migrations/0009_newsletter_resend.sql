-- The newsletter is sent by the site through Resend, per city, publish by default.
ALTER TABLE subscribers ADD COLUMN city TEXT;
ALTER TABLE subscribers ADD COLUMN unsub_token TEXT;
UPDATE subscribers SET city = CASE WHEN source LIKE 'calendar:%' THEN substr(source, 10) ELSE 'sandiego' END WHERE city IS NULL;
UPDATE subscribers SET unsub_token = lower(hex(randomblob(16))) WHERE unsub_token IS NULL;
CREATE INDEX IF NOT EXISTS idx_subscribers_city_status ON subscribers(city, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_unsub ON subscribers(unsub_token);
ALTER TABLE issues ADD COLUMN preview_sent_at TEXT;
ALTER TABLE issues ADD COLUMN dispatched_at TEXT;
ALTER TABLE issues ADD COLUMN completed_at TEXT;
ALTER TABLE issues ADD COLUMN sent_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE issues ADD COLUMN last_sent_subscriber_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE issues ADD COLUMN send_error TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_city_week ON issues(city, week_start);
