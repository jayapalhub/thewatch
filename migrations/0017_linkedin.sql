-- LinkedIn company page posting. The site posts as the Better Security page through the Community Management API:
-- Monday "This week in <city>" and Thursday "Hiring in <city>" per city, from the same data as the Sunday email.
-- One connection row (the page admin authorizes once; tokens last 60 days and the admin reconnects when nudged).
CREATE TABLE IF NOT EXISTS linkedin_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  client_id TEXT,                 -- from the LinkedIn developer app (env LINKEDIN_CLIENT_ID wins when set)
  client_secret TEXT,             -- same; kept here only because Pages secrets need the dashboard
  org_id TEXT,                    -- the company page's numeric id (urn:li:organization:<id>)
  access_token TEXT,
  token_expires_at TEXT,          -- ISO UTC
  scope TEXT,
  connected_at TEXT,
  connected_by TEXT,              -- admin email who pressed Connect
  paused INTEGER NOT NULL DEFAULT 0,
  expiry_warned_at TEXT,
  oauth_state TEXT,               -- one time value for the authorization round trip
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO linkedin_auth (id, org_id) VALUES (1, '131373999');

CREATE TABLE IF NOT EXISTS linkedin_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  kind TEXT NOT NULL,             -- events | jobs
  week_start TEXT NOT NULL,       -- the Monday of the week the post is about
  text TEXT NOT NULL,
  link TEXT,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | posted | failed | skipped
  post_urn TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_linkedin_posts_week ON linkedin_posts(city, kind, week_start);
