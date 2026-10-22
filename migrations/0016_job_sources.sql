-- Employer job boards the weekly sweep reads for security, GRC, privacy and audit roles, per city.
-- kind: workday (tenant + wd host + site), greenhouse (board token), lever (company), ashby (board name).
-- location_terms: comma separated words a posting's location must contain to count for this city.
-- Roles land as pending_review with a 24 hour auto publish, the same publish by default rule as events.
CREATE TABLE IF NOT EXISTS job_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,                       -- cities.slug
  organization_id INTEGER,                  -- the employer in organizations
  employer_name TEXT NOT NULL,
  kind TEXT NOT NULL,                       -- workday | greenhouse | lever | ashby
  config TEXT NOT NULL,                     -- JSON: workday {tenant, host, site}; greenhouse {board}; lever {company}; ashby {board}
  location_terms TEXT NOT NULL,             -- e.g. "San Diego, Carlsbad, Poway, Sorrento Valley, La Jolla"
  search_text TEXT NOT NULL DEFAULT 'security',
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_status TEXT,
  last_added INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_job_sources_city ON job_sources(city, active);
ALTER TABLE jobs ADD COLUMN source_id INTEGER;
ALTER TABLE jobs ADD COLUMN source_key TEXT;      -- the board's own id for the posting, for dedupe and close detection
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source_id, source_key);

INSERT INTO job_sources (city, employer_name, kind, config, location_terms, search_text, notes) VALUES
('sandiego', 'ICW Group', 'workday', '{"tenant":"icwgroup","host":"wd5","site":"ICW"}', 'San Diego', 'security', 'Insurance carrier, Kearny Mesa. Also lists Remote USA.'),
('sandiego', 'LPL Financial', 'workday', '{"tenant":"lplfinancial","host":"wd1","site":"External"}', 'San Diego', 'security', 'HQ split San Diego and Fort Mill; keep only roles that list San Diego.'),
('sandiego', 'Illumina', 'workday', '{"tenant":"illumina","host":"wd1","site":"illumina-careers"}', 'San Diego', 'security', NULL),
('sandiego', 'ResMed', 'workday', '{"tenant":"resmed","host":"wd3","site":"ResMed_External_Careers"}', 'San Diego', 'security', NULL),
('sandiego', 'Sony Interactive Entertainment', 'greenhouse', '{"board":"sonyinteractiveentertainmentglobal"}', 'San Diego', 'security', 'Corporate and regional security roles are physical security and are filtered out by title.'),
('sanjose', 'Adobe', 'workday', '{"tenant":"adobe","host":"wd5","site":"external_experienced"}', 'San Jose', 'security', NULL),
('sanjose', 'PayPal', 'workday', '{"tenant":"paypal","host":"wd1","site":"jobs"}', 'San Jose', 'security', NULL),
('sanjose', 'NVIDIA', 'workday', '{"tenant":"nvidia","host":"wd5","site":"NVIDIAExternalCareerSite"}', 'Santa Clara', 'security', NULL),
('sanjose', 'eBay', 'workday', '{"tenant":"ebay","host":"wd5","site":"apply"}', 'San Jose', 'security', NULL),
('sanjose', 'Broadcom', 'workday', '{"tenant":"broadcom","host":"wd1","site":"External_Career"}', 'San Jose, Palo Alto', 'security', NULL);
