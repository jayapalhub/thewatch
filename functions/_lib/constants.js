// City calendars. The live list comes from the D1 `cities` table (see loadCities); this map is the
// fallback and the seed, and it is mutated in place so every consumer sees the database rows.
export const CITIES = {
  sandiego: { slug: "sandiego", name: "San Diego", title: "The Watch San Diego", region: "San Diego County", timezone: "America/Los_Angeles", description: "Every cybersecurity, AI security, privacy and audit event in San Diego County, in one calendar and one Sunday email.", empty: "Nothing published yet. Organizers can submit events and they appear here once approved.", newsletter: "sunday", sort: 10 },
  sanjose: { slug: "sanjose", name: "San Jose", title: "The Watch San Jose", region: "San Jose, Silicon Valley and the Peninsula", timezone: "America/Los_Angeles", description: "Every cybersecurity, AI security, privacy and audit event in San Jose, Silicon Valley and the Peninsula, in one calendar.", empty: "The San Jose calendar is new and filling up. Organizers can submit events and they appear here once approved.", newsletter: null, sort: 20 },
};
export const DEFAULT_CITY = "sandiego";
export const VIRTUAL = { slug: "virtual", name: "Virtual", title: "The Watch Virtual", region: "Online", timezone: "America/Los_Angeles" };

let citiesLoadedAt = 0;
// Refresh CITIES from D1 at most once a minute per isolate. Safe to call on every request.
export async function loadCities(db, { force = false } = {}) {
  if (!db || (!force && Date.now() - citiesLoadedAt < 60000)) return CITIES;
  try {
    const { results } = await db.prepare("SELECT * FROM cities WHERE active=1 ORDER BY sort, name").all();
    if (results && results.length) {
      for (const k of Object.keys(CITIES)) delete CITIES[k];
      for (const r of results) CITIES[r.slug] = { slug: r.slug, name: r.name, title: r.title, region: r.region, timezone: r.timezone || "America/Los_Angeles", description: r.description || "", empty: r.empty_copy || "Nothing published yet. Organizers can submit events and they appear here once approved.", newsletter: r.newsletter || null, sort: r.sort };
    }
    citiesLoadedAt = Date.now();
  } catch { /* table missing or query failed: keep the fallback map */ }
  return CITIES;
}

export function cityOf(slug) { return CITIES[slug] || (slug === "virtual" ? VIRTUAL : null); }
// Canonical paths. Virtual events live at /virtual/events/<slug>; city events at /<city>/events/<slug>.
export function eventPath(e) { return `/${cityOf(e.city) ? e.city : DEFAULT_CITY}/events/${e.slug}`; }
export function orgPath(orgSlug, city) { return `/${cityOf(city) && city !== "virtual" ? city : DEFAULT_CITY}/organizers/${orgSlug}`; }
export function calendarPath(city) { return `/${cityOf(city) ? city : DEFAULT_CITY}`; }

export const TOPICS = {
  grc: "GRC",
  ai: "AI security",
  cloud: "Cloud",
  appsec: "AppSec",
  privacy: "Privacy",
  audit: "Audit",
  identity: "Identity",
  network: "Network",
  threat_intel: "Threat intel",
  leadership: "Leadership",
  careers: "Careers",
  tech: "Tech and IT leadership",
  social: "Social",
};

export const FORMATS = { in_person: "In person", virtual: "Virtual", hybrid: "Hybrid" };
export const COST_TYPES = { free: "Free", paid: "Paid", members_free: "Free for members", donation: "Donation", unknown: "Cost not listed" };
export const AUDIENCE = { open: "Open to all", early_career: "Early career", practitioner: "Practitioners", senior: "Senior" };
export const ORG_TYPES = ["chapter", "meetup", "conference", "vendor", "university", "government", "community", "media"];
export const EVENT_STATUSES = ["draft", "pending_review", "published", "cancelled", "rejected"];
export const SENIORITY = { student: "Student", early_career: "Early career", practitioner: "Practitioner", manager: "Manager", director: "Director or VP", executive: "Executive" };

export const BS_EVENT_KEYS = {
  padel_2027: "Padel Social 2027",
  ai_security_conf_2027: "AI Security Conference 2027",
  dinner_series: "Sponsored dinner series",
  roundtables: "Executive roundtables",
};

// Better Security's own events (Padel Social, dinners, conference) stay off public pages until the ISACA details are final.
export const SHOW_BS_EVENTS = false;

export const CONSENT_VERSION = "2026-10";
export const CONSENT_TEXT = "By subscribing you agree to receive The Watch weekly email and occasional notes about Better Security events. Unsubscribe any time with one click.";

export const MAIL_ADDRESS = "Better Security, 17190 Bernardo Center Drive, Suite 200, San Diego, CA 92128";

// Bump on any CSS or JS change so browsers fetch the new file.
export const ASSET_VERSION = "2026-10-21i";
