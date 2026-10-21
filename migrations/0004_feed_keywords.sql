ALTER TABLE feed_sources ADD COLUMN keywords TEXT;
UPDATE feed_sources SET keywords='cyber, security, privacy, ransomware, breach, identity, GRC, risk management, internal audit, IT audit, IT controls, SOC, compliance, artificial intelligence, AI, data governance, fraud, resilience' WHERE kind='ical' AND url LIKE '%freelivecpe%';
UPDATE feed_sources SET keywords='cyber, security, threat, ransomware, phishing, attack, breach, identity, MFA, detection, response, backup, recovery, email' WHERE url LIKE '%channel/8241/%';
