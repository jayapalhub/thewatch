# San Diego cyber event organizations: structured feeds

Compiled October 17, 2026. Companion to `orgs.json` (40 organizations). This file lists only the organizations that expose a machine readable feed, with the URL and whether it was verified by fetching it during research.

## Verified working iCal feeds (fetched and parsed)

| Organization | Platform | Feed URL | Notes |
|---|---|---|---|
| San Diego Cyber Group | Meetup | https://www.meetup.com/san-diego-cyber-meetup/events/ical/ | Returned Oct 28 and Nov 10, 2026 events with venues |
| OWASP San Diego | Meetup | https://www.meetup.com/open-web-application-security-project-san-diego-owasp-sd/events/ical/ | 10 recurring third Thursday meetings through Aug 2027; no LOCATION field |
| Cloud Security Alliance San Diego | Meetup | https://www.meetup.com/cloud-security-alliance-san-diego/events/ical/ | Oct 27, 2026 joint event with ISACA SD |
| (CS)2AI San Diego (control systems) | Meetup | https://www.meetup.com/san-diego-cyber-security-for-control-systems/events/ical/ | Online only seminars shared across all (CS)2AI groups |
| SD Tech Scene (Luma calendar) | Luma | https://api.lu.ma/ics/get?entity=calendar&id=cal-hCkcRgqEUK2UUbo | Only the Mingle events; the main sdtechscene.org calendar is separate |
| NDIA San Diego | The Events Calendar (WordPress) | https://www.ndia-sd.org/events/list/?ical=1 | Also webcal://www.ndia-sd.org/?post_type=tribe_events&ical=1&eventDisplay=list |
| Startup San Diego | The Events Calendar (WordPress) | webcal://startupsd.org/?post_type=tribe_events&ical=1&eventDisplay=list | Feed link shown on page; not fetched directly |

## Luma calendars (page based; iCal available through the Subscribe button, calendar ID not captured)

| Organization | Luma URL | Notes |
|---|---|---|
| SD ISSA | https://luma.com/sdissa | Primary ISSA feed; also curates partner events (FutureCon, San Diego CyberCon). The `api.lu.ma/calendar/get?slug=sdissa` lookup failed, so grab the cal- ID from the Subscribe button in a browser |
| Connect San Diego | https://luma.com/connect-sd | Office hours and signature events; accepts community submissions via Airtable |
| SDx (AI builder community) | https://luma.com/sdx | AI Coffee and AI Showcase series; invite only for some events |
| SD Tech Scene | https://luma.com/calendar/cal-hCkcRgqEUK2UUbo | Verified above |

## Meetup groups (standard `/events/ical/` path exists for every Meetup group)

| Organization | Meetup URL | Members |
|---|---|---|
| San Diego Cyber Group | https://www.meetup.com/san-diego-cyber-meetup/ | 2,851 |
| OWASP San Diego | https://www.meetup.com/open-web-application-security-project-san-diego-owasp-sd/ | 2,630 |
| San Diego AI Developers Group | https://www.meetup.com/sd-abcdtechtalk/ | 2,853 |
| Cloud Security Alliance San Diego | https://www.meetup.com/cloud-security-alliance-san-diego/ | 1,200 |
| Claude Code Users Group (San Diego, meets at USD Loma Hall first Thursdays) | https://www.meetup.com/claude-code-users-group/ | 838 |
| (CS)2AI San Diego | https://www.meetup.com/san-diego-cyber-security-for-control-systems/ | 351 |
| InfoSec Networking, San Diego ISSA Chapter | https://www.meetup.com/san-diego-chapter-issa/ | 179 |
| AI Tinkerers San Diego (mirror) | https://www.meetup.com/ai-tinkerers-san-diego/ | 38 |

## Eventbrite organizers

| Organization | Eventbrite | Notes |
|---|---|---|
| ISACA San Diego Chapter | Organizer name "ISACA San Diego Chapter"; event example https://www.eventbrite.com/e/isaca-san-diego-september-meeting-tickets-1997293569833 | Organizer numeric ID not captured (organizer page blocked) |
| InfraGard San Diego | Event example https://www.eventbrite.com/e/infragard-san-diego-cyber-futures-symposium-tickets-1995336539302 | Annual symposium |
| Startup San Diego | https://www.eventbrite.com/o/9236362099 | 1st Mondays |
| Data Connectors | https://www.eventbrite.com/o/data-connectors-6674159355 | No San Diego events listed |
| CyberTECH Network | Smart and Safe Cities symposium | Link on events page, no current events |

## Other WordPress The Events Calendar sites (iCal at `?ical=1`, unverified)

- WiCyS San Diego: https://wicyssandiego.org/events/list/?ical=1 (returned empty during research; calendar had no upcoming events)
- SD Tech Scene main calendar: https://sdtechscene.org/calendar/?ical=1 (fetch failed; site is confirmed to run The Events Calendar)

## Other ticketing platforms

- San Diego CyberCon: Zeffy, https://www.zeffy.com/en-US/ticketing/san-diego-cybercon--2026
- BSides San Diego: SimpleTix (link from https://www.bsidessd.org/tickets)
- Official Cybersecurity Summit: Swoogo, https://cyberriskalliance.swoogo.com/sandiego-2026
- SD ISSA sponsor packages: Ticket Tailor, https://www.tickettailor.com/events/sdissa
- IIA San Diego: Cvent
- ISC2 San Diego: Google Forms attendance only, no ticketing

## Aggregator pages worth scraping (HTML, no feed)

- CCOE news and events: https://sdccoe.org/news-and-events/ (lists partner events across the region)
- City of San Diego Cyber Lab events: https://sandiego.gov/cyber-lab/events plus the quarterly SDRCL newsletter PDF
- City of San Diego main events calendar carries DC858 meetings: https://www.sandiego.gov/event/def-con-san-diego-monthly-meeting
- WiCyS San Diego calendar cross lists ISC2 SD and DC858 meetings
- isaca-sd.org/events lists chapter and partner events
- isc2-san-diego-chapter.org/meetings lists monthly meetings (no feed)

## Not found

- No Hack the Box meetup group for San Diego (HTB directory lists none).
- No 2600 San Diego meeting on the official 2600 list (California entries are Fullerton, LA, Sacramento, SF, San Jose).
- No Blacks in Cybersecurity San Diego chapter; the closest is Blacks in Tech San Diego on Meetup, dormant since 2023.
- No organization called "SD Cyber Security Council"; the San Diego CISO Roundtable is the likely match.
- No Women in Security and Privacy (WISP) San Diego chapter; WISP only distributes passes to the San Diego summit.
- No San Diego specific Evanta programs scheduled; CISOs are served by the Southern California summit in LA and Orange County.
- Pacific Hackers Association, Cyberjutsu, Raices Cyber and OWASP Orange County are CyberCon co-organizers but are not San Diego based.
