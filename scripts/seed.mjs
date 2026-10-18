// Generates SQL to seed organizations and events from data/seed/*.json.
// Usage: node scripts/seed.mjs > scripts/seed.sql
//        npx wrangler d1 execute thewatch --local --file scripts/seed.sql
// Safe to re-run: organizations upsert by slug, events upsert by slug.
import { readFileSync, existsSync } from "node:fs";

const q = (v) => (v == null || v === "" ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 80);
const SKIP_ORGS = new Set(["data-connectors", "evanta-southern-california-ciso", "cyberrisk-collaborative"]);
const ORG_TYPES = new Set(["chapter", "meetup", "conference", "vendor", "university", "government", "community", "media"]);

const out = [];
const orgs = existsSync("data/seed/orgs.json") ? JSON.parse(readFileSync("data/seed/orgs.json", "utf8")) : [];
const events = existsSync("data/seed/events.json") ? JSON.parse(readFileSync("data/seed/events.json", "utf8")) : [];

// Better Security itself
orgs.push({ slug: "better-security", name: "Better Security", short_name: "Better Security", type: "community", website: "https://bettersecurity.ai", events_url: "https://bettersecurity.ai/events", description: "San Diego events company that publishes The Watch San Diego and runs a small number of elevated events for the security community.", usual_cadence_text: "A few events a year", trusted: 1 });

for (const o of orgs) {
  if (SKIP_ORGS.has(o.slug)) continue;
  const row = {
    slug: o.slug, name: o.name, short_name: o.short_name, type: ORG_TYPES.has(o.type) ? o.type : "community",
    website: o.website, events_url: o.events_url, contact_email: o.contact_email, linkedin_url: o.linkedin_url,
    description: o.description, usual_cadence_text: o.usual_cadence_text, cadence_rule: o.cadence_rule,
    cost_notes: o.cost_notes, cpe_notes: o.cpe_notes,
    notes: [o.default_venue ? `Usual venue: ${o.default_venue}` : "", o.notes || "", Array.isArray(o.source_urls) && o.source_urls.length ? `Sources: ${o.source_urls.join(" ")}` : ""].filter(Boolean).join("\n"),
    trusted: o.trusted ? 1 : 0,
  };
  const cols = Object.keys(row);
  out.push(`INSERT INTO organizations (${cols.join(",")}) VALUES (${cols.map((c) => q(row[c])).join(",")}) ON CONFLICT(slug) DO UPDATE SET ${cols.filter((c) => c !== "slug").map((c) => `${c}=excluded.${c}`).join(",")}, updated_at=datetime('now');`);
}

// Padel Social as a Better Security event
events.push({
  title: "Padel Social 2027", organization_slug: "better-security", start_at: "2027-03-18T17:30:00", end_at: "2027-03-18T19:30:00", format: "in_person",
  venue_name: "Padel N9NE", venue_address: "Sorrento Valley, San Diego", description_short: "Padel, food and a DJ with San Diego's security community. Coaching for first timers. $35.",
  description_long: "Two hours of padel with coaching for first timers, open play for everyone else, food, a DJ and a room full of San Diego security, audit, risk and privacy people. Paddles and balls provided.",
  registration_url: "https://bettersecurity.ai/events/padel-social-2027", cost_type: "paid", cost_min: 35, cost_max: 35, topics: ["social"], audience_level: "practitioner",
  is_better_security_event: 1, status: "published", source: "manual", confidence: "high",
});

// Organizers referenced by events but missing from orgs.json get a minimal row to edit later.
const known = new Set(orgs.map((o) => o.slug));
for (const e of events) {
  const s = e.organization_slug || (e.organization_name ? slugify(e.organization_name) : null);
  if (s && !known.has(s)) { known.add(s); out.push(`INSERT INTO organizations (slug, name, type, notes) VALUES (${q(s)}, ${q(e.organization_name || s)}, 'community', 'Auto-created from event seed; fill in details') ON CONFLICT(slug) DO NOTHING;`); }
}

const TOPICS = new Set(["grc", "ai", "cloud", "appsec", "privacy", "audit", "identity", "network", "threat_intel", "leadership", "careers", "social"]);
const seen = new Set();
for (const e of events) {
  if (!e.title || !e.start_at || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(e.start_at)) continue;
  const slug = `${slugify(e.title)}-${e.start_at.slice(0, 10)}`;
  if (seen.has(slug)) continue; seen.add(slug);
  const orgSlug = e.organization_slug || (e.organization_name ? slugify(e.organization_name) : null);
  const status = e.status || (e.confidence === "low" ? "pending_review" : "published");
  const row = {
    slug, city: "sandiego", title: e.title.slice(0, 140),
    venue_name: e.venue_name, venue_address: e.venue_address || e.neighborhood_or_city,
    start_at: e.start_at.slice(0, 19), end_at: e.end_at ? e.end_at.slice(0, 19) : null, timezone: "America/Los_Angeles",
    format: ["in_person", "virtual", "hybrid"].includes(e.format) ? e.format : "in_person",
    description_short: (e.description_short || "").slice(0, 200), description_long: e.description_long,
    registration_url: e.registration_url, cost_type: ["free", "paid", "members_free", "donation"].includes(e.cost_type) ? e.cost_type : "unknown",
    cost_min: e.cost_min == null ? null : Number(e.cost_min), cost_max: e.cost_max == null ? null : Number(e.cost_max), cost_notes: e.cost_notes,
    cpe_eligible: e.cpe_eligible === true ? 1 : e.cpe_eligible === false ? 0 : null, cpe_hours: e.cpe_hours == null ? null : Number(e.cpe_hours), cpe_body: e.cpe_body,
    topics: JSON.stringify((e.topics || []).filter((t) => TOPICS.has(t)).slice(0, 4)),
    audience_level: ["open", "early_career", "practitioner", "senior"].includes(e.audience_level) ? e.audience_level : "open",
    is_better_security_event: e.is_better_security_event ? 1 : 0, status, source: e.source || "research", source_url: e.source_url,
    reviewer_notes: e.confidence ? `Research confidence: ${e.confidence}${e.confidence_note ? ". " + e.confidence_note : ""}` : null,
    published_at: status === "published" ? new Date().toISOString() : null,
  };
  const cols = Object.keys(row);
  out.push(`INSERT INTO events (${cols.join(",")}, organization_id) VALUES (${cols.map((c) => q(row[c])).join(",")}, (SELECT id FROM organizations WHERE slug=${q(orgSlug)})) ON CONFLICT(slug) DO UPDATE SET ${cols.filter((c) => !["slug", "published_at"].includes(c)).map((c) => `${c}=excluded.${c}`).join(",")}, organization_id=excluded.organization_id, updated_at=datetime('now');`);
}
process.stdout.write(out.join("\n") + "\n");
console.error(`orgs: ${orgs.length - [...SKIP_ORGS].length}, events: ${seen.size}`);
