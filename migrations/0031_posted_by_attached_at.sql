-- When a named person was attached to a role (posted_by_name set), so the coverage page and the Monday digest can count
-- people attached in the last seven days even when the role itself is older. Rows that already carry a name are
-- backfilled with the time the role went live, the closest date on record.
ALTER TABLE jobs ADD COLUMN posted_by_attached_at TEXT;
UPDATE jobs SET posted_by_attached_at = COALESCE(published_at, created_at) WHERE posted_by_name IS NOT NULL AND posted_by_name != '' AND posted_by_attached_at IS NULL;
