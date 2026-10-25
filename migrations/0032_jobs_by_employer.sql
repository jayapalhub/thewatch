-- The employer pages at /employers/<slug> list one organization's live roles across every board. That read is by
-- organization_id, which had no index.
CREATE INDEX IF NOT EXISTS idx_jobs_org_status ON jobs(organization_id, status, expires_at);
