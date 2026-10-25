-- Invitation requests: the second offer next to the free calendar. One row per request, kept as a business record.
-- areas is a JSON array of keys from INVITE_AREAS; seniority a key from INVITE_SENIORITY; status new, invited or declined.
CREATE TABLE IF NOT EXISTS invitation_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  company TEXT NOT NULL,
  job_title TEXT NOT NULL,
  seniority TEXT NOT NULL,
  areas TEXT NOT NULL DEFAULT '[]',
  linkedin_url TEXT NOT NULL,
  vendor INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  source TEXT,
  ip_hash TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  reviewer_notes TEXT,
  confirmation_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invitation_requests_email ON invitation_requests(email);
CREATE INDEX IF NOT EXISTS idx_invitation_requests_created ON invitation_requests(created_at);
