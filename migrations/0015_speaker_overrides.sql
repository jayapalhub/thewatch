-- Speaker board admin decisions. The board itself is computed from events.speakers on every request; this table only
-- records Jerome's corrections, keyed by the normalized name (lowercase, no accents, no honorifics or periods).
-- action 'merge' folds name_key into target_key (another spelling of the same person); 'hide' keeps a name off the board.
CREATE TABLE IF NOT EXISTS speaker_overrides (
  name_key TEXT PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('merge', 'hide')),
  target_key TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
