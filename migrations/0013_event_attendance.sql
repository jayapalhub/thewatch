-- Personal CPE log: events a subscriber marked as attended, behind their profile token at /cpe. Never public.
-- hours starts as the organizer's reported cpe_hours and the subscriber can edit it.
CREATE TABLE IF NOT EXISTS event_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  hours REAL,                               -- NULL when the organizer reported none and the subscriber has not set it
  source TEXT NOT NULL DEFAULT 'event_page', -- event_page or reminder_email
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT,
  UNIQUE (subscriber_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_subscriber ON event_attendance(subscriber_id);
