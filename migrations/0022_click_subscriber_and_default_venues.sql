-- Subscriber click attribution and organizer default venues.
-- 1. Sunday email links carry a per subscriber click token (&s=...). The /go redirects resolve it to a subscriber id
--    when that subscriber has personalization on, so the picks can learn from what each reader opens.
-- 2. A subscriber can turn this off on the profile page (personalize = 0): links then carry no token.
-- 3. Organizer records can hold a default venue, used by the feed importer when a Meetup or Luma item names none.
ALTER TABLE link_clicks ADD COLUMN subscriber_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_link_clicks_subscriber ON link_clicks(subscriber_id);
ALTER TABLE subscribers ADD COLUMN personalize INTEGER NOT NULL DEFAULT 1;
ALTER TABLE subscribers ADD COLUMN click_token TEXT;
UPDATE subscribers SET click_token = lower(hex(randomblob(10))) WHERE click_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_click_token ON subscribers(click_token);
ALTER TABLE organizations ADD COLUMN default_venue_name TEXT;
ALTER TABLE organizations ADD COLUMN default_venue_address TEXT;
