# Research brief for a new city on The Watch (bettersecurity.ai)

The Watch is a free calendar of in-person cybersecurity, GRC, privacy, audit and AI security events per city, plus a jobs board of security roles linked to each employer's own careers posting. You are researching ONE city. Use only WebSearch and WebFetch. Do not use a browser, do not sign in anywhere, do not contact anyone. Write your result as JSON to the output path you were given, then reply with a short summary (counts and thin spots). Today is 2026-10-22.

WebFetch only works on URLs that appeared in a search result or an earlier fetch; if a fetch is refused, search for the page title so the URL shows up, then fetch it. Spend effort on being right, not on being exhaustive: 15 well-sourced organizers beat 40 guesses.

## Agent A: organizers and events  ->  <slug>_events.json

Output shape:
{
  "organizers": [ {
    "slug": "isaca-chicago",                 // lowercase-hyphen, chapter-city style
    "name": "ISACA Chicago Chapter",
    "type": "chapter|meetup|conference|university|community|government|vendor|media",
    "website": "https://...", "events_url": "https://...",
    "description": "One plain sentence on who they are.",
    "cadence": "Monthly, usually the third Thursday, lunch",   // as stated on their pages; "" if unknown
    "cpe_notes": "ISACA CPE at chapter meetings" or "",
    "default_venue_name": "", "default_venue_address": "",       // ONLY if every recent meeting is at the same place
    "luma_calendar_id": "cal-XXXX" or "",   // from a lu.ma calendar page, if they run one
    "meetup_slug": "" ,                     // e.g. "chicago-security-meetup" from meetup.com/<slug>/
    "active": true,                         // false if the newest event you can find is older than 12 months
    "notes": "what you could and could not verify"
  } ],
  "events": [ {
    "title": "...", "organizer_slug": "isaca-chicago",
    "date": "2026-11-12", "start_time": "11:30", "end_time": "13:30",   // 24h local; "" if not stated
    "end_date": "",                          // only for multi-day
    "venue_name": "...", "venue_address": "street, city, state zip",
    "format": "in_person|hybrid|virtual",
    "registration_url": "https://...",       // the organizer's own page, Luma, Meetup, Eventbrite, or the conference site. NEVER an aggregator (allevents, eventbrite search pages are fine only as discovery, 10times, infosec-conferences.com, cybersecurityventures, etc.)
    "cost": "free | $25 members, $40 non members | ...",
    "cpe": "2 CPE (ISACA)" or "",
    "description": "Two or three plain sentences: what it is, who speaks, why go.",
    "topics": ["grc","ai_security","appsec","cloud","threat_intel","privacy","audit","identity","careers","networking","leadership","ot_ics"],
    "source_url": "the page where you SAW this date",
    "confidence": "high|medium",
    "notes": ""
  } ]
}

Rules: only events dated between 2026-10-23 and 2027-04-30. Only dates you saw on a page; never extrapolate from a cadence ("third Thursday" is not an event). In-person or hybrid events in the metro only (virtual-only chapter webinars may be included with format virtual). Skip pure sales webinars and anything outside the metro geography you were given.

Who to look for, in this order: ISACA chapter(s), ISC2 chapter(s), ISSA chapter(s), OWASP chapter, IIA chapter, IAPP KnowledgeNet, Cloud Security Alliance chapter, InfraGard members alliance, AFCEA chapter, WiCyS affiliate, BSides, the DEF CON group (DCxxx) and 2600 meeting, hackerspaces with security nights, universities with public security talks or centers, local AI security or AI governance meetups (search lu.ma and meetup.com), CISO groups, and the touring conference series when they have a date in this city: Official Cybersecurity Summit (CyberRisk Alliance), FutureCon, SecureWorld, Data Connectors, Evanta CISO summits, GPSEC, CISO XC, IANS forums, Gartner, SANS training cities, CactusCon-style regional cons. For the touring series use these existing slugs instead of inventing new ones: cyberrisk-alliance, futurecon, secureworld, evanta, eds-x-series, sans, gartner-conferences, hmg-strategy, f2f-events, elevateit, ciomeet, owasp-foundation, executive-womens-forum. Data Connectors, IANS and GPSEC have no slug yet; give them data-connectors, ians, gpsec.

## Agent B: employer job boards  ->  <slug>_boards.json

Output shape: [ {
  "employer": "Northern Trust", "slug": "northern-trust",
  "website": "https://www.northerntrust.com",
  "description": "One sentence: what they are and their presence in this metro.",
  "careers_url": "https://...myworkdayjobs.com/...",
  "kind": "workday|greenhouse|lever|ashby|smartrecruiters|eightfold|radancy|phenom|icims|successfactors|existing|unsupported",
  "config": { ... },
  "evidence": "the URL or search result that shows the ATS",
  "notes": ""
} ]

Find 30 to 40 employers with a headquarters or a large office in the metro that post security, GRC, privacy, IT audit or AI security roles: banks and insurers, health systems, utilities, airlines, retailers, telecom, defense, big tech offices, security vendors headquartered there, universities, consultancies. Skip employers that post every role as remote with no city.

Config per kind (derive from the careers URL; search for "<employer> myworkdayjobs", "<employer> greenhouse jobs", "boards.greenhouse.io/<x>", "jobs.lever.co/<x>", "jobs.ashbyhq.com/<x>" to see the real URL):
- workday: https://<tenant>.<host>.myworkdayjobs.com/<site>  ->  {"tenant","host","site"}  (host like wd1, wd5, wd12, wd108, wd501)
- greenhouse: boards.greenhouse.io/<board> or job-boards.greenhouse.io/<board>  ->  {"board"}
- lever: jobs.lever.co/<company>  ->  {"company"}
- ashby: jobs.ashbyhq.com/<board>  ->  {"board"}
- smartrecruiters: jobs.smartrecruiters.com/<Company>  ->  {"company"}
- eightfold: <host>/careers on eightfold  ->  {"host","company"}
- radancy (TalentBrew sites like jobs.<company>.com/search-jobs)  ->  {"host"}
- phenom (careers.<co>.com/us/en/search-results)  ->  {"host","path":"us/en","state":"<State name>"}
- icims (careers-<co>.icims.com or a host whose job URLs contain /jobs/<id>/<slug>/job)  ->  {"host"}; mark classic iCIMS portals and Jibe sites as unsupported
- successfactors (jobs.<co>.com with /job/<city>-<title>/<id>/ URLs, or career*.sapsf.com)  ->  {"host","base":"/"}
- existing: the employer is already on another city's board (list below); give config {} and we reuse it.
- unsupported: Oracle Taleo/HCM, Avature, custom sites. List them anyway with kind unsupported, since we may add an adapter later.

Already on a board elsewhere (use kind "existing" for these if they have a large office in this metro): Adobe, Airbnb, Amgen, Anduril, Applied Materials, Arrow Electronics, Axon, BAE Systems, BD, Block, Boeing, Booz Allen Hamilton, Broadcom, Capital Group, Charles Schwab, Charter Communications (Spectrum), Chewy, Chipotle, Cloudflare, Coalfire, Comcast, CrowdStrike, CVS Health, Databricks, DaVita, Danaher, Docusign, DraftKings, eBay, Expedia, Experian, Figma, GoDaddy, Gusto, HP, Intel, Intuit, Johnson & Johnson, Kaiser Permanente, Leidos, Lyft, Mayo Clinic, Microchip, Micron, Northern Trust, Northrop Grumman, NVIDIA, Okta, Optiv, Palantir, Palo Alto Networks, PayPal, Pfizer, Republic Services, Rivian, RTX, Salesforce, Samsara, ServiceNow, SpaceX, State Farm, Stripe, T-Mobile, Thermo Fisher, United Airlines, USAA, Vanguard, Wells Fargo, Workday, Zillow, Zoom, Zscaler.
