-- The Watch San Diego: initial schema
-- Times are stored as ISO 8601 local wall-clock strings ("2026-11-05T08:00:00")
-- with the IANA zone in the timezone column. ISO strings sort correctly as text.

CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT,
  type TEXT NOT NULL DEFAULT 'community', -- chapter|meetup|conference|vendor|university|government|community|media
  website TEXT,
  events_url TEXT,
  contact_name TEXT,
  contact_email TEXT,
  linkedin_url TEXT,
  logo_url TEXT,
  description TEXT,
  usual_cadence_text TEXT,
  cadence_rule TEXT,           -- iCal RRULE when reliable
  default_city TEXT NOT NULL DEFAULT 'sandiego',
  default_venue_id INTEGER,
  cost_notes TEXT,
  cpe_notes TEXT,
  notes TEXT,
  trusted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address_line TEXT,
  city TEXT,
  state TEXT DEFAULT 'CA',
  zip TEXT,
  neighborhood TEXT,
  lat REAL,
  lng REAL,
  website TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL DEFAULT 'sandiego',
  title TEXT NOT NULL,
  organization_id INTEGER REFERENCES organizations(id),
  venue_id INTEGER REFERENCES venues(id),
  venue_name TEXT,               -- denormalized fallback when no venue row
  venue_address TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  format TEXT NOT NULL DEFAULT 'in_person', -- in_person|virtual|hybrid
  description_short TEXT,
  description_long TEXT,
  registration_url TEXT,
  cost_type TEXT NOT NULL DEFAULT 'unknown', -- free|paid|members_free|donation|unknown
  cost_min REAL,
  cost_max REAL,
  cost_notes TEXT,
  member_price_notes TEXT,
  cpe_eligible INTEGER,          -- 1, 0 or NULL (unknown)
  cpe_hours REAL,
  cpe_body TEXT,                 -- ISACA|ISC2|IIA|IAPP|other|self_reported
  cpe_notes TEXT,
  topics TEXT NOT NULL DEFAULT '[]', -- JSON array
  audience_level TEXT NOT NULL DEFAULT 'open', -- open|early_career|practitioner|senior
  discount_code TEXT,
  discount_text TEXT,
  is_better_security_event INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_review', -- draft|pending_review|published|cancelled|rejected
  source TEXT NOT NULL DEFAULT 'manual', -- manual|submission|feed|recurrence|research
  source_url TEXT,
  submitted_by_name TEXT,
  submitted_by_email TEXT,
  reviewer_notes TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_city_status_start ON events(city, status, start_at);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(organization_id);

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'active', -- pending|active|unsubscribed|bounced
  source TEXT,
  consent_text_version TEXT,
  consented_at TEXT,
  ip_hash TEXT,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  role_title TEXT,
  seniority TEXT,                -- student|early_career|practitioner|manager|director|executive
  interests TEXT NOT NULL DEFAULT '[]',
  linkedin_url TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  beehiiv_subscriber_id TEXT,
  profile_completed_at TEXT,
  profile_token TEXT UNIQUE,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_interest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id),
  event_key TEXT NOT NULL,       -- padel_2027 | ai_security_conf_2027 | dinner_series | event:<id>
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(subscriber_id, event_key)
);

CREATE TABLE IF NOT EXISTS sponsor_inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  contact_name TEXT,
  email TEXT NOT NULL,
  role_title TEXT,
  interest TEXT,                 -- newsletter|event|dinner|conference|multiple
  message TEXT,
  budget_range TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new|replied|call_booked|proposal_sent|won|lost
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_number INTEGER,
  city TEXT NOT NULL DEFAULT 'sandiego',
  week_start TEXT NOT NULL,      -- YYYY-MM-DD (Monday)
  week_end TEXT NOT NULL,        -- YYYY-MM-DD (Sunday)
  send_at TEXT,
  subject TEXT,
  preheader TEXT,
  personal_note TEXT,
  featured_event_ids TEXT NOT NULL DEFAULT '[]',
  sponsor_name TEXT,
  sponsor_logo_url TEXT,
  sponsor_copy TEXT,
  sponsor_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft|pasted_to_beehiiv|sent
  beehiiv_post_url TEXT,
  generated_html TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS link_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,
  issue_id INTEGER,
  target TEXT,                   -- page|register
  target_url TEXT,
  referrer TEXT,
  ua_hash TEXT,
  clicked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clicks_event ON link_clicks(event_id);
