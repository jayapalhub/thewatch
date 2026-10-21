-- Standing sponsors: one logo on the city calendar page and one "Supported by" line above the Sunday email footer.
-- A sponsor set on an individual issue (issues.sponsor_*) still wins in that issue's email.
CREATE TABLE IF NOT EXISTS sponsors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  logo_url TEXT,                          -- https URL or a site path like /assets/sponsors/acme.png
  url TEXT,                               -- where the logo and line link to
  tagline TEXT,                           -- one short line, shown beside the logo and in the email
  city TEXT,                              -- cities.slug, or NULL for every city
  placement TEXT NOT NULL DEFAULT 'both', -- page, email or both
  starts_at TEXT,                         -- YYYY-MM-DD, local to the city; NULL means now
  ends_at TEXT,                           -- YYYY-MM-DD inclusive; NULL means open ended
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,                             -- private: deal terms, contact
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sponsors_live ON sponsors(active, city, placement);

CREATE TABLE IF NOT EXISTS sponsor_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sponsor_id INTEGER NOT NULL,
  placement TEXT NOT NULL,                -- page or email
  city TEXT,
  issue_id INTEGER,
  ua_hash TEXT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sponsor_clicks ON sponsor_clicks(sponsor_id, placement);
