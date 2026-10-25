-- One row per board per day: how many roles were live and how many of them were named by someone at the employer
-- (posted_by_name set). Written once a day by the hourly run (snapshotCoverage in coverage.js) and read by
-- /admin/jobs/coverage, which tracks each city toward the threshold for showing named roles only.
CREATE TABLE IF NOT EXISTS job_coverage_daily (
  day TEXT NOT NULL,                    -- YYYY-MM-DD, UTC
  city TEXT NOT NULL,                   -- cities.slug or 'remote'
  total INTEGER NOT NULL,
  named INTEGER NOT NULL,
  PRIMARY KEY (day, city)
);
