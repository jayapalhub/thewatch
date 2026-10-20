-- The Watch Virtual: live online sessions from anywhere.
-- Virtual events live in the same events table with city = 'virtual'.
-- start_utc / end_utc hold the instant in UTC so the page can show any zone.
ALTER TABLE events ADD COLUMN start_utc TEXT;
ALTER TABLE events ADD COLUMN end_utc TEXT;
ALTER TABLE events ADD COLUMN platform TEXT;        -- Zoom|Webex|BrightTALK|LinkedIn Live|YouTube|other
ALTER TABLE events ADD COLUMN speakers TEXT;
ALTER TABLE events ADD COLUMN recording_url TEXT;   -- filled in after the session airs
ALTER TABLE events ADD COLUMN also_virtual INTEGER NOT NULL DEFAULT 0; -- a San Diego organizer's online event also listed on /virtual
CREATE INDEX IF NOT EXISTS idx_events_start_utc ON events(city, status, start_utc);
