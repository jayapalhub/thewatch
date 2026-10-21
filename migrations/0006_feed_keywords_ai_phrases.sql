-- Bare "AI" / "artificial intelligence" let accounting ethics and economics sessions through.
-- Only count AI when it appears in a security or governance phrase; drop fraud and incident too.
UPDATE feed_sources SET keywords='cyber, cybersecurity, security, privacy, ransomware, breach, identity, GRC, cyber risk, IT audit, IT controls, SOC, SOC 2, AI governance, AI risk, AI security, responsible AI, data governance, resilience' WHERE kind='ical' AND url LIKE '%freelivecpe%';
