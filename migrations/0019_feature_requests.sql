-- Feature a role: an employer asks for the featured slot on a city's jobs board. No payment on the site; Jerome
-- approves and invoices by hand, then the role is pinned with featured_until. settings holds the few text values
-- the admin edits in place (the price line on the public page).
CREATE TABLE IF NOT EXISTS feature_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  job_id INTEGER,                   -- the listing when the request names one already on the board
  employer TEXT NOT NULL,
  title TEXT,
  url TEXT,                         -- the employer's own posting
  weeks INTEGER NOT NULL DEFAULT 2,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_title TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',  -- new | invoiced | live | declined
  featured_from TEXT,
  featured_until TEXT,
  admin_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
