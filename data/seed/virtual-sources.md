# The Watch Virtual: source sweep notes

Compiled 2026-10-19 for the 2026-10-20 to 2026-12-20 window. Fetching was done through WebFetch only (direct curl is blocked by the sandbox egress policy), so JavaScript-rendered listings could not be read. Where a listing page was unreadable, individual event pages or RSS feeds were used instead.

Feed legend: RSS = usable RSS/Atom feed found; iCal = .ics feed found; JSON = JSON endpoint found; none = no feed found or page is JS-only.

## Associations

| Source | URL used | Feed | Cadence | Notes |
|---|---|---|---|---|
| ISACA webinars | https://www.isaca.org/training-and-events/online-training/webinars | none (listing is a React component with "Load More") | 2 to 4 new webinars per month, plus sponsored (lms_sw) sessions | Listing shows dates but times only for some entries. Individual store pages (isaca.org/store/items/lms_*) render client side and rate limited WebFetch (HTTP 429). Only COBIT 7 (3 Nov, 12 PM ET) had a visible time. Dates known but time unverified, so omitted: State of Cyber 2026 (20 Oct), Your ISACA Year (22 Oct), Identity and Data: Governing Risk in the Age of Agentic AI (5 Nov), From AI Literacy to Digital Trust (11 Nov), Stress-Testing AI Trust: Prompt Injection in Action (12 Nov), The Leader's Compass (18 Nov). ISACA webinars are normally 12:00 PM ET and worth confirming by hand. |
| ISACA Virtual Conference | https://www.isaca.org/training-and-events/conferences/isaca-virtual-conference | none | Annual (1 to 3 Dec 2026) | Full agenda with CT times readable. Paid. |
| ISACA Engage global calendar | https://engage.isaca.org/events/calendar | none (Higher Logic; pagination not reachable, 341 events) | Continuous | Only page 1 readable. Chapter calendars at engage.isaca.org/<chapter>/events/calendar work when the chapter uses them (NY Metro yes; LA, San Diego, Atlanta empty; Toronto in person). |
| ISACA GWDC | https://isaca-gwdc.org/events/ | iCal likely (WordPress Events Calendar; append ?ical=1) | Several per month | Readable; event pages list times, prices and format. |
| ISACA Silicon Valley | https://isacasiliconvalley.org/calendar/ | none | Monthly | Calendar shows webinars 5 Nov and 3 Dec but the events list host (events.isacasiliconvalley.org) blocks robots, so no titles or times. |
| ISC2 webinars | https://www.isc2.org/professional-development/webinars | RSS: https://www.brighttalk.com/channel/13159/feed (Security Briefings, Americas), https://www.brighttalk.com/channel/13279/feed (EMEA), https://www.brighttalk.com/channel/14253/feed (APAC), https://www.brighttalk.com/channel/5385/feed (Think Tank), https://www.brighttalk.com/channel/19929/feed (Membership) | 2 to 6 per month across channels | The isc2.org pages are "Loading component" placeholders. The BrightTALK channel feeds are the reliable source and include UTC start timestamps and durations. Knowledge Vault channel ID not found. |
| ISC2 Security Congress | https://web.cvent.com/event/0bba3198-226e-4607-aad5-dbf9a382ef2e/... | none | Annual (24 to 28 Oct, Gaylord Rockies + virtual) | Virtual pass price and start time not readable; omitted. |
| ISC2 chapters | https://isc2-eastbay-chapter.org/events/ | none | Monthly | East Bay Fall Conference 13 Nov listed without time or format; omitted. Pikes Peak chapter pages not checked in depth. |
| IIA webinars | https://www.theiia.org/en/learning/online/webinars/ | none ("Load More" listing) | 3 to 6 per month | Listing shows dates and CPE; individual product pages give ET times, speakers and NASBA field of study. Prices blank on pages (sponsored webinars are free). Enterprise Risk Without Silos (17 Dec) page showed only webinar 1 of the series, so omitted. |
| IAPP web conferences | https://iapp.org/resources/upcoming-web-conferences | none | 3 to 6 per month | Best association source. Each event page gives PST/EST/CET times, 1.0 CPE and the eligible certifications. All 12 upcoming sessions captured. KnowledgeNets online not separately listed. |
| Cloud Security Alliance | https://cloudsecurityalliance.org/events and https://cloudsecurityalliance.org/events/webinars | RSS: https://www.brighttalk.com/channel/10415/feed (CloudBytes) | 3 to 5 CloudBytes per month plus periodic summits | Site lists summits only; CloudBytes schedule comes from the BrightTALK feed. Summit detail pages on Zoom Events show a start time but no agenda. CSA says CE credits are available but gives no hours. |
| ISSA International | https://www.issa.org/web-conferences/ | unknown | Monthly | Fetch failed. |
| OWASP | https://owasp.org/www-chapter-virtual/, https://owasp.org/events/, Meetup pro and chapter pages | none readable (Meetup is JS-only; owasp.org events page has no listing) | Virtual Chapter is monthly on third Wednesdays at 12 PM ET | Virtual Chapter page shows 2027 sessions only; nothing dated in the window. Meetup chapter pages returned 0 events because the listing is rendered client side. |

## Government

| Source | URL used | Feed | Cadence | Notes |
|---|---|---|---|---|
| NIST events (NICE and NCCoE) | https://www.nist.gov/news-events/upcoming-events/org/5641 and https://www.nccoe.nist.gov/get-involved/attend-events | none found on the org listing; nist.gov publishes RSS at https://www.nist.gov/news-events/events/rss.xml (site-wide, not verified this session) | 2 to 4 per month | Listing and event pages readable with ET times and ZoomGov registration links. |
| CISA | https://www.cisa.gov/news-events/events | none | Sparse | Page showed only 2025 entries; nothing in window. NICCS events page not readable. |

## Training

| Source | URL used | Feed | Cadence | Notes |
|---|---|---|---|---|
| SANS webcasts | https://www.sans.org/webcasts/ (unreadable: shows 2013 to 2020 archive) and https://www.govevents.com/orgs/489/sans-institute (readable mirror) | none on sans.org; GovEvents has no feed either | 8 to 15 webcasts per month | GovEvents is the workable index of SANS webcasts for the window; each GovEvents page gives ET times, speakers and the sans.org URL. Individual sans.org/webcasts/<slug> pages are readable once you have the slug. Fall Cyber Solutions Fest (17 to 19 Nov) captured as five tracks. |
| SANS summits | https://www.sans.org/cyber-security-training-events/ai-summit-fall-2026 | none | Several per quarter | Summit pages readable with full agendas in ET and virtual pass pricing. DFIR Summit (15 to 22 Oct) started before the window. ICS Europe Summit not dated on the free events page. |
| Hack The Box, TryHackMe, OffSec | https://www.hackthebox.com/events, https://www.hackthebox.com/cybersecurity-resources/webinars, https://www.offsec.com/events/ | none | Irregular | HTB webinar list renders 0 items without JS; OffSec page undated; TryHackMe not reachable. Nothing captured. |

## Media and event companies

| Source | URL used | Feed | Cadence | Notes |
|---|---|---|---|---|
| SC Media / CyberRisk Alliance cybercasts | https://www.scworld.com/cybercast | none | 6 to 10 per month | Listing readable with ET dates and times for the next several weeks; event pages give sponsor, speakers and duration. 11 captured. CPE not stated on pages. |
| CyberRisk Alliance events (Official Cybersecurity Summit virtual) | https://www.cyberriskalliance.com/events and cyberriskalliance.swoogo.com/* | none | 2 to 3 virtual summits per month | Swoogo pages readable with full agendas, US$95 pricing and CPE statement. MSSP Alert Live (17 to 18 Nov) has no times; omitted. |
| Infosecurity Magazine | https://www.infosecurity-magazine.com/webinars/ | RSS exists site-wide (https://www.infosecurity-magazine.com/rss/webinars/, not verified this session) | 4 to 8 per month | Listing readable; times shown without a zone (UK time by convention). Only four upcoming sessions posted beyond early November. |
| SecureWorld | https://www.secureworld.io/events and events.secureworld.io | none | 1 virtual conference per month | Event pages readable with ET times and 6 CPE; price not shown. Pages carry a stale "event has passed" banner. |
| SecurityWeek virtual events | https://www.securitysummits.com/ and register.securityweek.com | none | Monthly | Dates readable; times only partially (Cyber AI and Automation Summit shows 11 AM to 4 PM without zone; CISO Forum 10 to 11 Nov has no times, omitted). |
| Dark Reading webinars | https://www.darkreading.com/resources/webinars | none | 6 to 10 per month | Fetch failed (Informa site). |
| Help Net Security | https://www.helpnetsecurity.com/webinars/ | none | Several per month | Fetch failed. |
| Security Boulevard / Techstrong | https://webinars.securityboulevard.com/ and https://www.techstrongevents.com/ | none | Weekly | Webinars page failed; events page lists Cloud Native: The AI Stack (29 Oct) with no time. |
| ISMG | https://www.ismg.io/events/ and https://ismg.events/ | none | Weekly | Only in-person summits listed through 24 Oct; virtual roundtables not exposed. |
| The Hacker News webinars | https://thehackernews.com/p/webinar.html | none | Weekly | Fetch failed. |
| Redmondmag / 1105 Media summits | https://redmondmag.com/microsites/summits.aspx | none | Monthly | Robots disallowed; a March 2026 identity summit page was readable but out of window. |
| GovEvents | https://www.govevents.com/ | none | Daily additions | Search and listing pages fail without parameters; organization pages (for example /orgs/489) work and are the best mirror for SANS, Carahsoft and federal vendor webinars. |

## Free CPE aggregators (useful for Big 4 and advisory firm cyber and risk webcasts)

| Source | URL used | Feed | Cadence | Notes |
|---|---|---|---|---|
| Free Live CPE | https://www.freelivecpe.com/events/ and category month views such as https://www.freelivecpe.com/events/category/information-technology/2026-11/ | iCal: append ?ical=1 to any list or category URL (for example https://www.freelivecpe.com/events/category/auditing/2026-11/?ical=1) | 10 to 20 per weekday | Event pages give organizer, ET times, NASBA field of study and the organizer's registration URL. Category month views were the most useful way to find Deloitte, Forvis Mazars, BDO, Crowe, Withum, Baker Tilly and Optro sessions. |
| CPE Planner | https://cpeplanner.com/cpe-calendar/ | none | Daily | Only populated through 31 Oct at sweep time; times carry no zone (Eastern by convention). Used for CohnReznick, BDO, Plante Moran and two Deloitte sessions, marked medium confidence. |

## Vendors

| Vendor | URL used | Feed | Cadence | Result |
|---|---|---|---|---|
| CrowdStrike | https://www.crowdstrike.com/en-us/events/, /resources/crowdcasts/, events.crowdstrike.com/crowdstrike-fehl-ams/ | none | Weekly workshops | Workshop schedule renders client side; CrowdCasts are on demand. Nothing captured. |
| Palo Alto Networks | https://www.paloaltonetworks.com/events | none | Weekly | Fetch failed. Appears as sponsor of SANS (4 Nov) and SC Media (26 Oct) sessions. |
| Wiz | https://www.wiz.io/events | none | Monthly | AI for Security Summit (20 Oct) captured with ET agenda. |
| Zscaler | https://www.zscaler.com/resources/webinars | none | Monthly | Only item is an on-demand Gartner MQ recap. |
| Okta | https://www.okta.com/events/ | none | Monthly | Beyond Oktane (20 Oct) listed without time; product focused; omitted. |
| Microsoft Security, Google Cloud Security, AWS Security | not reached | none | | Not sweepable without JS this session; AWS appears as sponsor of the SANS 2 Nov workshop and Google Cloud in CRA summits. |
| Cloudflare | https://www.cloudflare.com/events/ | none | Quarterly | In-person only. |
| Tenable | https://www.tenable.com/webinars and BrightTALK channel 7927 feed | RSS: https://www.brighttalk.com/channel/7927/feed (stale since 2025) | Monthly | Webinar listing has dates but no times; mostly customer updates and regional sessions. Nothing captured. |
| Rapid7 | https://www.rapid7.com/about/events/ (failed) and RSS https://www.brighttalk.com/channel/10457/feed | RSS | 2 topics per month, each in NA/EMEA/APJ slots | 6 captured from feed. |
| Qualys | https://www.qualys.com/webinars/ redirects to BrightTALK channel 11673 | RSS: https://www.brighttalk.com/channel/11673/feed | 3 to 4 per month | Patch Tuesday briefings (12 Nov, 10 Dec) captured; two product-focused sessions excluded. |
| Snyk | https://snyk.io/events/ | none | Monthly | MCP Trust Chain (27 Oct, 1 CPE) captured. Snyk also sponsors SC Media 9 Nov. |
| Vanta | https://www.vanta.com/webinars | none | Monthly | Fetch failed. |
| Drata | https://drata.com/events | none | Monthly | In-person only. |
| Anecdotes | https://www.anecdotes.ai/webinars | none | Monthly | TPRM panel (28 Oct) captured. |
| AuditBoard / Optro | https://auditboard.com/events redirects to https://optro.ai/events | none (JS listing) | 2 to 4 per month | Listing unreadable; Shadow AI (28 Oct, 1 CPE) found through Free Live CPE. Optro also runs Infosec Compliance Now and GRC Now annual virtual events (dates not posted). |
| OneTrust | https://www.onetrust.com/resources/webinars/ | none | Monthly | Two November items are a release overview and a demo; excluded as product sessions. |
| Saviynt | https://saviynt.com/events | none | Monthly | Five virtual items listed without times; the 5 Nov Deloitte Dbriefs session captured via Deloitte's page. Persistent Systems case study (3 Nov) omitted for lack of a time. |
| SailPoint | https://www.sailpoint.com/events | none | Monthly | Webinars page not reached; events page in-person only. |
| CyberArk | https://www.cyberark.com/resources/webinars and BrightTALK 18084 feed | RSS (EMEA channel, stale since 2023) | Monthly | On demand only. |
| Delinea | https://delinea.com/events | none | 4 to 8 per month | Best vendor listing: dates and times in ET, SGT, AEDT and London time. 7 captured. |
| Illumio | BrightTALK channel 16729 feed | RSS: https://www.brighttalk.com/channel/16729/feed | Monthly | No upcoming sessions in feed; Illumio speaks at CSA CloudBytes 27 Oct. |
| Black Kite | https://blackkite.com/events/ | none | Quarterly | In-person only. |
| RegScale | https://regscale.com/events/ | none | Monthly | DoW RMF via Carahsoft (18 Nov) captured; also a speaker at CRA AI Exposure Summit. |
| Netskope | https://www.netskope.com/resources/webinars and /company/events | none (JS filter) | Monthly | No dated webinars readable. |
| Proofpoint | https://www.proofpoint.com/us/resources/webinars | none | Monthly | Fetch failed. |
| Abnormal | https://abnormal.ai/events | none | 2 per month | ThreatStream sessions 23 Oct and 19 Nov listed without times; registration page unreadable; omitted. |
| Sublime Security | https://sublime.security/events/ | none | Monthly | Two November and October sessions are product demos; excluded. |
| Arctic Wolf | BrightTALK channel 11871 feed | RSS: https://www.brighttalk.com/channel/11871/feed | Monthly | No upcoming sessions; Arctic Wolf speaks at SANS Identity track 18 Nov. |
| Huntress | https://www.huntress.com/events | none | Monthly | Robots disallowed. |
| KnowBe4 | https://www.knowbe4.com/webinars | none | 4 to 8 per month | Listing gives ET/GMT/SGT times; Phishing Threat Trends (21 and 22 Oct) captured; product demos excluded. Registration pages block robots. |
| Deloitte Dbriefs | https://www.deloitte.com/us/en/dbriefs-webcasts/upcoming-webcasts.html | none (JS) | 10+ per month | Listing unreadable, but individual Dbriefs pages are readable and offer CPE. Found through Free Live CPE, CPE Planner and Saviynt. |
| EY, KPMG, PwC webcasts | https://www.ey.com/en_us/webcasts, https://kpmg.com/us/en/webcasts.html | none | Several per month | EY event pages show UTC times and CPE; KPMG listing unreadable. One EY session captured. |

## Hardest sources to read

1. ISACA store pages (client-side rendering plus rate limiting), so ISACA global webinar times could not be verified beyond COBIT 7.
2. ISC2's own webinar pages (placeholders) and BrightTALK channel pages (React), although BrightTALK /feed RSS endpoints solved this.
3. Meetup (OWASP chapters) and Zoom Events agendas (CSA summits).
4. Dark Reading, Help Net Security, Security Boulevard webinars, The Hacker News, ISSA, Vanta, Proofpoint, Palo Alto Networks, Rapid7 and Qualys corporate event pages all failed outright in WebFetch; feeds or aggregators were used where available.
5. Deloitte Dbriefs, Optro and Netskope listings are JavaScript only.

## Recommended standing feeds for a weekly refresh

- BrightTALK channel feeds (RSS, include UTC timestamps): 13159, 13279, 14253, 5385, 19929 (ISC2); 10415 (CSA CloudBytes); 10457 (Rapid7); 11673 (Qualys); 16729 (Illumio); 11871 (Arctic Wolf); 7927 (Tenable).
- Free Live CPE iCal by category (auditing, information-technology) per month.
- ISACA GWDC iCal.
- Readable HTML listings worth scraping weekly: IAPP upcoming web conferences, IIA webinars, SC Media cybercast, CRA events, SecureWorld events, Delinea events, GovEvents SANS organization page, NIST upcoming events, Infosecurity Magazine webinars.
