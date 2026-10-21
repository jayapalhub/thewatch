-- Referrals: every subscriber gets a public share link bettersecurity.ai/r/<ref_code>.
-- ref_code is a separate short code on purpose: profile_token opens /profile and /cpe, so it must never be shared.
-- referred_by is set only when a brand new subscriber signs up with a referral cookie.
-- A thank you email goes once at 3 and once at 10 referrals; referral_thanked_level records the last one sent (0, 3 or 10).
ALTER TABLE subscribers ADD COLUMN referred_by INTEGER;
ALTER TABLE subscribers ADD COLUMN referral_thanked_at TEXT;
ALTER TABLE subscribers ADD COLUMN referral_thanked_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscribers ADD COLUMN ref_code TEXT;
UPDATE subscribers SET ref_code = lower(hex(randomblob(5))) WHERE ref_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_ref_code ON subscribers(ref_code);
CREATE INDEX IF NOT EXISTS idx_subscribers_referred_by ON subscribers(referred_by);
