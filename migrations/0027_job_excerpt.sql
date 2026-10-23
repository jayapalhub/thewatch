-- The opening of the employer's own description, about three sentences, shown on the role page and in its JobPosting
-- markup. Filled from what each board already returns (no extra requests); NULL where the board gives no text.
ALTER TABLE jobs ADD COLUMN excerpt TEXT;
