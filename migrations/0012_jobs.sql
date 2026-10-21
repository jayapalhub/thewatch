-- Jobs: curated local security, GRC, privacy and audit roles at /<city>/jobs, plus a Hiring this week block in the Sunday email.
-- Every row links to the employer's own posting. posted_by_* names a person only when they posted publicly about the role
-- (a LinkedIn post or the employer's posting page), and links to that post. See project doc 125.
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,                       -- cities.slug
  organization_id INTEGER,                  -- the employer, in organizations (type 'employer' when created here)
  employer_name TEXT,                       -- shown when there is no organization row
  title TEXT NOT NULL,
  url TEXT NOT NULL,                        -- the employer's own posting, never an aggregator
  location TEXT,                            -- neighborhood or city, e.g. Sorrento Valley
  remote TEXT NOT NULL DEFAULT 'onsite',    -- onsite, hybrid, remote
  seniority TEXT,                           -- SENIORITY key
  topics TEXT NOT NULL DEFAULT '[]',        -- JSON array of TOPICS keys
  salary_text TEXT,                         -- only when the posting states it
  posted_at TEXT,                           -- YYYY-MM-DD the role was posted
  expires_at TEXT,                          -- YYYY-MM-DD; defaults to 30 days after it goes live
  status TEXT NOT NULL DEFAULT 'pending_review', -- draft, pending_review, published, rejected, expired, closed
  hold INTEGER NOT NULL DEFAULT 0,
  auto_publish_at TEXT,                     -- publish by default, same as events
  featured_until TEXT,                      -- YYYY-MM-DD; pinned with logo and guaranteed in the email until then
  source TEXT NOT NULL DEFAULT 'manual',    -- manual, employer_form, sweep, linkedin
  posted_by_name TEXT,
  posted_by_title TEXT,
  posted_by_url TEXT,                       -- link to their public post
  posted_by_kind TEXT,                      -- employer or staffing
  posted_by_date TEXT,                      -- YYYY-MM-DD of the post
  submitted_by_name TEXT,                   -- private: who used the employer form
  submitted_by_email TEXT,
  reviewer_notes TEXT,
  apply_clicks INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT,                     -- weekly recheck of the posting URL
  closed_reason TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_city_status ON jobs(city, status, posted_at);
CREATE INDEX IF NOT EXISTS idx_jobs_url ON jobs(url);
