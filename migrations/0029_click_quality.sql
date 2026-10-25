-- Trustworthy click counts. Every /go request is still stored, but a row now says whether it counts: is_bot marks
-- link scanners, preview bots, prefetches, HEAD requests, clicks within two seconds of the send and clients that hit
-- the hidden trap link (bot_reason says which); is_dup marks a second click on the same listing by the same subscriber
-- (or, with no subscriber, the same salted IP hash) on the same day. listing is the key the counts group by
-- (event:12, job:5, sponsor:3, issue:9), city the board the listing belongs to. The raw IP is never stored.
ALTER TABLE link_clicks ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE link_clicks ADD COLUMN bot_reason TEXT;
ALTER TABLE link_clicks ADD COLUMN is_dup INTEGER NOT NULL DEFAULT 0;
ALTER TABLE link_clicks ADD COLUMN ip_hash TEXT;
ALTER TABLE link_clicks ADD COLUMN listing TEXT;
ALTER TABLE link_clicks ADD COLUMN city TEXT;
ALTER TABLE link_clicks ADD COLUMN job_id INTEGER;
ALTER TABLE link_clicks ADD COLUMN sponsor_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_link_clicks_listing_day ON link_clicks(listing, clicked_at);
CREATE INDEX IF NOT EXISTS idx_link_clicks_issue_client ON link_clicks(issue_id, ua_hash, ip_hash);
CREATE INDEX IF NOT EXISTS idx_link_clicks_clicked_at ON link_clicks(clicked_at);
