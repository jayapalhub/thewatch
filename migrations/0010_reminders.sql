-- "Email me a reminder": one queued email per (event, address), sent the morning before the event.
-- A reminder is not registration; the email says so and links to the organizer.
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  subscriber_id INTEGER,                 -- set when the address is already on the Sunday email
  token TEXT NOT NULL UNIQUE,            -- used by the stop and join links in the email
  status TEXT NOT NULL DEFAULT 'queued', -- queued, sending, sent, skipped, cancelled
  requested_start_at TEXT,               -- event start when requested; the email flags a change
  ip_hash TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sent_at TEXT,
  UNIQUE (event_id, email)
);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status, event_id);
CREATE INDEX IF NOT EXISTS idx_reminders_email ON reminders(email, status);

-- Addresses that clicked "stop these reminders". Cleared only if the same address asks for a new reminder.
CREATE TABLE IF NOT EXISTS reminder_optouts (
  email TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
