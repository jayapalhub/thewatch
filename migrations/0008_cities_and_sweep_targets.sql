-- Cities as data. The code keeps a fallback map, but the site reads this table on every request (cached one minute).
CREATE TABLE IF NOT EXISTS cities (
  slug TEXT PRIMARY KEY,                 -- one lowercase word: sandiego, sanjose, losangeles
  name TEXT NOT NULL,                    -- San Jose
  title TEXT NOT NULL,                   -- The Watch San Jose
  region TEXT NOT NULL,                  -- kicker on the calendar page
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  description TEXT,                      -- meta description
  empty_copy TEXT,                       -- shown when the calendar has nothing yet
  sweep_notes TEXT,                      -- geography and search hints for the weekly sweep
  newsletter TEXT,                       -- 'sunday' when the city has its own send, else NULL
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO cities (slug, name, title, region, description, empty_copy, sweep_notes, newsletter, sort) VALUES
('sandiego', 'San Diego', 'The Watch San Diego', 'San Diego County',
 'Every cybersecurity, AI security, privacy and audit event in San Diego County, in one calendar and one Sunday email.',
 'Nothing published yet. Organizers can submit events and they appear here once approved.',
 'Geography: San Diego County. Meetup and Eventbrite searches within 30 miles of San Diego. Vendor field events that recur locally count.', 'sunday', 10),
('sanjose', 'San Jose', 'The Watch San Jose', 'San Jose, Silicon Valley and the Peninsula',
 'Every cybersecurity, AI security, privacy and audit event in San Jose, Silicon Valley and the Peninsula, in one calendar.',
 'The San Jose calendar is new and filling up. Organizers can submit events and they appear here once approved.',
 'Geography: Santa Clara County and the Peninsula down to San Mateo, plus Fremont and Milpitas. Meetup search within 25 miles of San Jose; Eventbrite searches for San Jose, Santa Clara, Palo Alto and Mountain View. Leave San Francisco and Oakland out unless a major conference, and then hold it with a note.', NULL, 20);

-- Where the weekly sweep looks, per city. kind: organizer (a group with an events page), search (a query to run), listing (an aggregator or venue calendar).
CREATE TABLE IF NOT EXISTS sweep_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,                    -- cities.slug or 'virtual'
  kind TEXT NOT NULL DEFAULT 'organizer',
  name TEXT NOT NULL,
  url TEXT,
  notes TEXT,                            -- cadence, login walls, what to skip
  active INTEGER NOT NULL DEFAULT 1,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sweep_targets_city ON sweep_targets(city, active);
INSERT INTO sweep_targets (city, kind, name, url, notes) VALUES
('sandiego','organizer','ISACA San Diego Chapter','https://engage.isaca.org/sandiegochapter/events/calendar',NULL),
('sandiego','organizer','ISSA San Diego',NULL,NULL),
('sandiego','organizer','OWASP San Diego','https://www.meetup.com/owasp-san-diego/events/',NULL),
('sandiego','organizer','IIA San Diego',NULL,NULL),
('sandiego','organizer','IAPP San Diego KnowledgeNet','https://iapp.org/community/iapp-chapters/san-diego-ca','Registration details sit behind the myIAPP login; hold if time or venue is missing'),
('sandiego','organizer','ISC2 San Diego Chapter',NULL,NULL),
('sandiego','organizer','InfraGard San Diego',NULL,NULL),
('sandiego','organizer','Cloud Security Alliance San Diego',NULL,NULL),
('sandiego','organizer','San Diego Cyber Security Meetup','https://www.meetup.com/san-diego-cyber-security-meetup/events/',NULL),
('sandiego','organizer','North County Cyber Meetup',NULL,NULL),
('sandiego','organizer','CS2AI San Diego','https://www.meetup.com/san-diego-cyber-security-for-control-systems/events/','Also pulled by the iCal feed adapter'),
('sandiego','organizer','BSides San Diego',NULL,NULL),
('sandiego','organizer','Cyber Center of Excellence (CCOE)','https://sdccoe.org/events/',NULL),
('sandiego','organizer','WiCyS San Diego affiliate',NULL,NULL),
('sandiego','organizer','SDSU, UCSD, National University, CSUSM security programs',NULL,'Public talks and career events only'),
('sandiego','organizer','FutureCon San Diego','https://futureconevents.com/',NULL),
('sandiego','organizer','Official Cybersecurity Summit San Diego','https://cybersecuritysummit.com/',NULL),
('sandiego','organizer','Data Connectors San Diego',NULL,NULL),
('sandiego','organizer','Evanta San Diego CISO community',NULL,'Application only; add with a note'),
('sandiego','search','Meetup search: cybersecurity within 30 miles of San Diego','https://www.meetup.com/find/?keywords=cybersecurity&location=us--ca--San%20Diego&source=EVENTS',NULL),
('sandiego','search','Eventbrite search: cybersecurity, information security, privacy, GRC in San Diego',NULL,NULL),
('sanjose','organizer','ISSA Silicon Valley Chapter','https://luma.com/user/usr-FK6SzZ7ujN8ujlJ','Third Tuesday 5:30 PM at HPE, 6280 America Center Dr, San Jose'),
('sanjose','organizer','ISC2 Silicon Valley Chapter','https://luma.com/calendar/cal-MxyPbooIAaHiHqL','Second Tuesday 6 PM, San Jose or Santa Clara'),
('sanjose','organizer','ISACA Silicon Valley Chapter','https://engage.isaca.org/siliconvalleychapter/events/calendar',NULL),
('sanjose','organizer','OWASP Bay Area','https://www.meetup.com/bay-area-owasp/events/','Monthly, rotating host offices'),
('sanjose','organizer','Hacker Dojo AI security meetup','https://www.meetup.com/hackerdojo/events/','Every other Sunday 2:30 PM'),
('sanjose','organizer','CSA Silicon Valley',NULL,NULL),
('sanjose','organizer','IIA San Jose',NULL,NULL),
('sanjose','organizer','IAPP Silicon Valley KnowledgeNet','https://iapp.org/community/iapp-chapters/silicon-valley-ca','Details behind myIAPP login; hold if time or venue is missing'),
('sanjose','organizer','InfraGard San Francisco Bay Area',NULL,NULL),
('sanjose','organizer','AFCEA Silicon Valley','https://siliconvalley.afceachapters.org/',NULL),
('sanjose','organizer','WiCyS Silicon Valley affiliate',NULL,NULL),
('sanjose','organizer','Women in Security and Privacy (WISP)','https://www.wisporg.com/events',NULL),
('sanjose','organizer','DC408',NULL,'Third Thursdays; only add dated instances'),
('sanjose','organizer','BSides San Francisco','https://bsidessf.org/','San Francisco; hold with a note'),
('sanjose','organizer','SJSU, Santa Clara University and Stanford public security talks',NULL,NULL),
('sanjose','organizer','GuidePoint GPSEC Bay Area','https://www.guidepointsecurity.com/events/',NULL),
('sanjose','organizer','Evanta San Francisco CISO community','https://www.evanta.com/ciso/san-francisco','Application only'),
('sanjose','organizer','EDS CISO X','https://edsxevents.com/',NULL),
('sanjose','organizer','The CISO Society Anti-Summit','https://events.confide.group/',NULL),
('sanjose','organizer','Official Cybersecurity Summit Silicon Valley','https://cybersecuritysummit.com/',NULL),
('sanjose','organizer','FutureCon Silicon Valley','https://futureconevents.com/',NULL),
('sanjose','organizer','SecureWorld Bay Area','https://www.secureworld.io/events',NULL),
('sanjose','organizer','Data Connectors Silicon Valley',NULL,NULL),
('sanjose','search','Meetup search: cybersecurity within 25 miles of San Jose','https://www.meetup.com/find/?keywords=cybersecurity&location=us--ca--San%20Jose&source=EVENTS&distance=twentyFiveMiles',NULL),
('sanjose','search','Eventbrite search: cybersecurity, information security, privacy, GRC in San Jose, Santa Clara, Palo Alto, Mountain View',NULL,NULL),
('sanjose','search','Vendor in-person events in San Jose, Santa Clara, Sunnyvale, Mountain View, Palo Alto, Menlo Park, Redwood City, San Mateo',NULL,'Wiz, CrowdStrike, Palo Alto Networks, Okta, Snyk, Vanta, Cisco, Zscaler, Netskope, Cloudflare, Google Cloud, AWS, Microsoft'),
('virtual','listing','Repo file data/seed/virtual-sources.md (GitHub jayapalhub/thewatch, main)',NULL,'Feed URLs and listings for ISACA, ISC2, IIA, IAPP, CSA, SANS, OWASP, NIST, CISA, SC Media, Dark Reading, Help Net Security'),
('virtual','organizer','Vendor webinar pages: Wiz, Duo, Veeam, Delinea, KnowBe4, Snyk, Qualys, Rapid7, OpenText',NULL,'BrightTALK channels, Free Live CPE and the CS2AI Meetup iCal are already pulled by the feed adapters every Thursday; skip those'),
('virtual','listing','Sponsor list rotation: Sponsors!A2:D816 in the ISACA SD Hub spreadsheet','https://docs.google.com/spreadsheets/d/1d6po4KNrKc63wowmCwRWjPc_QE7D8DkNN83-5gPk2Ag','Skip enterprise employers, investors and unverified rows. ISO week number mod 8 picks one eighth of the list each week.');
