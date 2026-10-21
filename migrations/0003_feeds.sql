-- Feed adapters: sources that are pulled automatically into the review queue.
CREATE TABLE IF NOT EXISTS feed_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- brighttalk | ical
  url TEXT NOT NULL,
  organization_id INTEGER,
  city TEXT NOT NULL DEFAULT 'virtual',  -- sandiego | virtual
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles', -- for floating iCal times
  cpe_default INTEGER NOT NULL DEFAULT 0,
  cpe_body TEXT,
  topics TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_status TEXT,
  last_added INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS feed_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER,
  ran_at TEXT NOT NULL DEFAULT (datetime('now')),
  fetched INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
ALTER TABLE events ADD COLUMN feed_uid TEXT;
CREATE INDEX IF NOT EXISTS idx_events_feed_uid ON events(feed_uid);

INSERT INTO feed_sources (name, kind, url, organization_id, city, cpe_default, cpe_body, topics, notes) VALUES
('ISC2 Security Briefings (BrightTALK 13159)', 'brighttalk', 'https://www.brighttalk.com/service/channel/v2/channel/13159/feed?size=60&page=1', (SELECT id FROM organizations WHERE slug='isc2'), 'virtual', 1, 'ISC2', '["threat_intel"]', 'ISC2 vendor sponsored briefings, 1 CPE each'),
('ISC2 Membership (BrightTALK 19929)', 'brighttalk', 'https://www.brighttalk.com/service/channel/v2/channel/19929/feed?size=60&page=1', (SELECT id FROM organizations WHERE slug='isc2'), 'virtual', 0, NULL, '["careers"]', 'Member town halls and orientation sessions'),
('CSA CloudBytes (BrightTALK 10415)', 'brighttalk', 'https://www.brighttalk.com/service/channel/v2/channel/10415/feed?size=60&page=1', (SELECT id FROM organizations WHERE slug='cloud-security-alliance'), 'virtual', 1, 'self_reported', '["cloud"]', NULL),
('Rapid7 (BrightTALK 10457)', 'brighttalk', 'https://www.brighttalk.com/service/channel/v2/channel/10457/feed?size=60&page=1', (SELECT id FROM organizations WHERE slug='rapid7'), 'virtual', 0, NULL, '["threat_intel"]', NULL),
('Qualys (BrightTALK 11673)', 'brighttalk', 'https://www.brighttalk.com/service/channel/v2/channel/11673/feed?size=60&page=1', (SELECT id FROM organizations WHERE slug='qualys'), 'virtual', 0, NULL, '["threat_intel"]', NULL),
('OpenText Cybersecurity (BrightTALK 8241)', 'brighttalk', 'https://www.brighttalk.com/service/channel/v2/channel/8241/feed?size=60&page=1', (SELECT id FROM organizations WHERE slug='opentext'), 'virtual', 0, NULL, '["threat_intel"]', NULL),
('Free Live CPE (iCal)', 'ical', 'https://www.freelivecpe.com/?ical=1', NULL, 'virtual', 1, 'other', '["grc"]', 'Accounting firm webcasts with NASBA CPE; organizer is set per event from the title when possible'),
('CS2AI San Diego (Meetup iCal)', 'ical', 'https://www.meetup.com/san-diego-cyber-security-for-control-systems/events/ical/', (SELECT id FROM organizations WHERE slug='cs2ai-san-diego'), 'sandiego', 0, NULL, '["network"]', NULL);
