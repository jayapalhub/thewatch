-- Roles people post about (CLAUDE.md standing rule, decided 2026-10-23). posted_by_role says who the person is:
-- hiring_manager, leader (a security leader) or recruiter (in house; staffing agency posts stay out). announced is 1
-- when the role was announced in a post but is not yet on the employer's own site, so url is the post link; it goes
-- back to 0 when the employer's posting appears (by hand in the admin, or when a board run matches the role).
ALTER TABLE jobs ADD COLUMN posted_by_role TEXT;
ALTER TABLE jobs ADD COLUMN announced INTEGER NOT NULL DEFAULT 0;
