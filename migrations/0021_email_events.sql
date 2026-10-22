-- Delivery events from Resend (bounces and complaints), one row each, written by /api/newsletter/resend-webhook.
-- A permanent bounce sets the subscriber to 'bounced'; a complaint sets 'unsubscribed'. Transient bounces are logged only.
CREATE TABLE IF NOT EXISTS email_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT UNIQUE,          -- svix message id, so a redelivered webhook is applied once
  type TEXT NOT NULL,               -- email.bounced | email.complained | other types as they arrive
  email TEXT,
  subscriber_id INTEGER,
  email_id TEXT,                    -- Resend email id
  subject TEXT,
  detail TEXT,                      -- bounce type and message, or the complaint feedback
  action TEXT,                      -- bounced | unsubscribed | logged
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_events_created ON email_events(created_at);
CREATE INDEX IF NOT EXISTS idx_email_events_email ON email_events(email);
