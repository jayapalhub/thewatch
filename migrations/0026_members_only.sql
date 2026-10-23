-- Events open only to members of the organizing group (IAPP KnowledgeNet, some chapter meetings). Jerome, 2026-10-23:
-- list them, but say so on the listing. 1 shows a "Members only" tag and a line in the event's cost facts.
ALTER TABLE events ADD COLUMN members_only INTEGER NOT NULL DEFAULT 0;
