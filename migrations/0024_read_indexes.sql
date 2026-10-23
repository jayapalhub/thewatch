-- Indexes that keep duplicate checks and maintenance queries from scanning whole tables.
-- Context (2026-10-23): bulk research seeds checked for duplicates with unindexed lookups (registration_url,
-- lower(title), organization names, feed urls), each scanning the events or organizations table, and together with
-- normal traffic that spent the D1 free tier's daily read allowance.
CREATE INDEX IF NOT EXISTS idx_events_registration_url ON events(registration_url);
CREATE INDEX IF NOT EXISTS idx_events_title_lower ON events(lower(title));
CREATE INDEX IF NOT EXISTS idx_events_start_at ON events(start_at);
CREATE INDEX IF NOT EXISTS idx_organizations_name_lower ON organizations(lower(name));
CREATE INDEX IF NOT EXISTS idx_feed_sources_url ON feed_sources(url);
CREATE INDEX IF NOT EXISTS idx_job_sources_city_employer ON job_sources(city, lower(employer_name));
CREATE INDEX IF NOT EXISTS idx_jobs_status_expires ON jobs(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status_checked ON jobs(status, last_checked_at);
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON jobs(status, hold, auto_publish_at);
