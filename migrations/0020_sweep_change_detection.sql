-- Change detection for the weekly sweep: the hourly tick fetches each sweep target's page, hashes its text, and
-- records when it last changed, so the Friday research agents only read pages that moved. has_feed marks a target
-- whose events already arrive through a feed_sources row, so the sweep skips it.
ALTER TABLE sweep_targets ADD COLUMN content_hash TEXT;
ALTER TABLE sweep_targets ADD COLUMN content_checked_at TEXT;
ALTER TABLE sweep_targets ADD COLUMN content_changed_at TEXT;
ALTER TABLE sweep_targets ADD COLUMN fetch_error TEXT;
ALTER TABLE sweep_targets ADD COLUMN has_feed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sweep_targets ADD COLUMN feed_source_id INTEGER;
