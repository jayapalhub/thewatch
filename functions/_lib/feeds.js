// Feed adapters: pull BrightTALK Atom channels and iCal feeds into the review queue.
// Everything lands as status='pending_review' with source='feed'; nothing publishes itself.
import { slugify } from "./html.js";
import { toUtc, TZ } from "./dates.js";
import { autoPublishAt } from "./autopublish.js";
import { cityTz, loadCities } from "./constants.js";

const WINDOW_DAYS = 90;

// ---------- small text helpers ----------
function decodeEntities(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/â€™/g, "'").replace(/â€œ|â€\x9d/g, '"').replace(/â€["”“]/g, ", ").replace(/â€¯|â€\u00af/g, " ").replace(/â€\S?/g, "'");
}
function stripHtml(s) { return decodeEntities(String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(); }
// Meetup descriptions arrive as markdown. Drop emphasis markers, rules and bare labels ("**Description:**") before the
// short blurb is cut, and skip a leading headline line (a panel title ending without a period) when a paragraph follows.
export function plainText(text) {
  return String(text || "")
    .replace(/^\s*(\*{3,}|-{3,}|_{3,})\s*$/gm, "")
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1").replace(/(^|\s)_{1,2}([^_\n]+)_{1,2}(?=\s|$)/g, "$1$2")
    .replace(/^\s*(description|about|details|agenda|summary)\s*:\s*$/gim, "")
    .trim();
}
export function firstSentence(text, max = 200) {
  const lines = plainText(text).split("\n").map((l) => l.trim()).filter(Boolean);
  while (lines.length > 1 && lines[0].length < 120 && !/[.!?]$/.test(lines[0])) lines.shift(); // headline lines before the first real sentence
  const t = lines.join(" ").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (end > 80) return cut.slice(0, end + 1);
  const sp = cut.lastIndexOf(" ");
  return cut.slice(0, sp > 60 ? sp : max).trim();
}
// UTC Date -> local wall-clock "YYYY-MM-DDTHH:MM:00" in tz
export function utcToLocalIso(date, tz = TZ) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const o = {}; f.formatToParts(date).forEach((x) => { o[x.type] = x.value; });
  return `${o.year}-${o.month}-${o.day}T${o.hour === "24" ? "00" : o.hour}:${o.minute}:00`;
}
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`)); return m ? m[1].trim() : ""; };

// ---------- BrightTALK Atom ----------
export function parseBrightTalk(xml) {
  const out = [];
  const entries = xml.split(/<entry>/).slice(1);
  for (const raw of entries) {
    const status = tag(raw, "bt:status");
    if (status !== "upcoming") continue;
    const start = parseInt(tag(raw, "bt:start"), 10);
    if (!start) continue;
    const duration = parseInt(tag(raw, "bt:duration"), 10) || 3600;
    const commId = (raw.match(/<bt:communication id="(\d+)"/) || [])[1] || "";
    const alt = (raw.match(/<link href="([^"]+)" rel="alternate"/) || [])[1] || "";
    const title = decodeEntities(tag(raw, "title"));
    const summary = stripHtml(tag(raw, "summary"));
    const author = decodeEntities(tag(raw, "name"));
    const cpe = /\bCPE\b/i.test(summary) ? 1 : null;
    out.push({
      uid: `brighttalk:${commId}`,
      title, startUtc: new Date(start * 1000), endUtc: new Date((start + duration) * 1000),
      url: decodeEntities(alt) || `https://www.brighttalk.com/webcast/${(raw.match(/<bt:channel id="(\d+)"/) || [])[1] || ""}/${commId}`,
      summary, speakers: author.replace(/\s*;\s*/g, "; ").replace(/\s{2,}/g, " ").slice(0, 300) || null,
      platform: "BrightTALK", cpeHint: cpe,
    });
  }
  return out;
}

// ---------- iCal ----------
function unfold(text) { return String(text).replace(/\r\n/g, "\n").replace(/\n[ \t]/g, ""); }
function icsUnescape(s) { return String(s || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\"); }
function parseIcsDate(value, params, defaultTz) {
  // 20261105T160000Z | 20261105T110000 (with TZID or floating) | 20261105 (all day)
  const m = String(value).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  if (!m[4]) return { allDay: true, date: `${m[1]}-${m[2]}-${m[3]}` };
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || "00"}`;
  if (m[7] === "Z") return { utc: new Date(`${iso}Z`) };
  const tz = (params.match(/TZID=([^;:]+)/) || [])[1] || defaultTz;
  const d = toUtc(iso, tz.replace(/^"|"$/g, ""));
  return d ? { utc: d } : null;
}
export function parseIcal(text, defaultTz = TZ) {
  const out = [];
  const blocks = unfold(text).split("BEGIN:VEVENT").slice(1);
  for (const b of blocks) {
    const body = b.split("END:VEVENT")[0];
    const props = {};
    for (const line of body.split("\n")) {
      const i = line.indexOf(":"); if (i < 1) continue;
      const left = line.slice(0, i), val = line.slice(i + 1);
      const name = left.split(";")[0].toUpperCase();
      props[name] = { params: left.slice(name.length), value: val };
    }
    const ds = props.DTSTART && parseIcsDate(props.DTSTART.value, props.DTSTART.params, defaultTz);
    if (!ds || ds.allDay) continue; // no confirmed start time
    const de = props.DTEND && parseIcsDate(props.DTEND.value, props.DTEND.params, defaultTz);
    const endUtc = de && de.utc ? de.utc : new Date(ds.utc.getTime() + 3600000);
    const desc = stripHtml(icsUnescape(props.DESCRIPTION?.value || "")).replace(/^[^\n]{0,80}\n+(?=#+\s|\S)/, (m) => (/meetup|group|chapter/i.test(m) ? "" : m)).replace(/^#+\s*/gm, "").trim();
    let location = icsUnescape(props.LOCATION?.value || "").trim();
    const url = (props.URL?.value || (desc.match(/https?:\/\/\S+/) || [])[0] || "").trim();
    // Luma puts its own event link in LOCATION when the address is shown only after registration. That is an in person
    // event with a withheld address, not an online one, unless the title says so.
    const meetingLink = /zoom\.|teams\.microsoft|webex\.|meet\.google|youtube\.|youtu\.be|linkedin\.com\/events|brighttalk|on24|streamyard|gotowebinar/i;
    const titleSaysOnline = /\b(virtual|online|webinar)\b/i.test(props.SUMMARY?.value || "");
    if (/^https?:\/\//i.test(location) && !meetingLink.test(location) && !titleSaysOnline) location = "Address shared on registration";
    out.push({
      uid: `ical:${(props.UID?.value || url || props.SUMMARY?.value || "").trim()}`,
      title: icsUnescape(props.SUMMARY?.value || "").trim(),
      startUtc: ds.utc, endUtc, url, summary: desc, speakers: null, location,
      platform: /zoom/i.test(location + " " + url) ? "Zoom" : /teams/i.test(location) ? "Teams" : "other",
      // No LOCATION line (Meetup leaves it out for in person events too) means in person unless the text says online.
      online: location ? (titleSaysOnline || /online|virtual|zoom|webinar|teams|webex|https?:/i.test(location)) : (titleSaysOnline || /\b(online event|virtual event|zoom|webinar|join online|livestream)\b/i.test(desc.slice(0, 400))),
      cpeHint: /\bCPE\b/.test(desc) ? 1 : null,
    });
  }
  return out;
}

// ---------- ingest ----------
export async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "TheWatchFeedBot/1.0 (+https://bettersecurity.ai)" }, cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}


// Aggregator pages (The Events Calendar sites such as Free Live CPE) list someone else's webinar.
// Follow the event page to find the organizer's own registration link and the organizer name,
// so the listing sends readers to Deloitte, not to the aggregator.
const AGGREGATOR_HOSTS = ["www.freelivecpe.com", "freelivecpe.com"];
export function parseAggregatorPage(html) {
  const out = { registrationUrl: null, organizerName: null, organizerUrl: null };
  const site = html.match(/tribe-block__event-website[\s\S]{0,400}?<a[^>]+href="([^"]+)"/i) || html.match(/tribe-events-event-url[\s\S]{0,300}?<a[^>]+href="([^"]+)"/i);
  if (site) out.registrationUrl = decodeEntities(site[1]);
  const org = html.match(/tribe-block__organizer__title[\s\S]{0,300}?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) || html.match(/tribe-organizer[\s\S]{0,200}?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  if (org) { out.organizerUrl = decodeEntities(org[1]); out.organizerName = decodeEntities(org[2].replace(/<[^>]+>/g, "")); }
  const web = html.match(/tribe-block__organizer__website[\s\S]{0,200}?<a[^>]+href="([^"]+)"/i);
  if (web) out.organizerWebsite = decodeEntities(web[1]);
  return out;
}
export async function enrichFromAggregator(db, it) {
  let host = ""; try { host = new URL(it.url).hostname; } catch { return; }
  if (!AGGREGATOR_HOSTS.includes(host)) return;
  let page; try { page = parseAggregatorPage(await fetchText(it.url)); } catch { return; }
  it.aggregatorUrl = it.url;
  if (page.registrationUrl && /^https?:/.test(page.registrationUrl) && !AGGREGATOR_HOSTS.includes(new URL(page.registrationUrl).hostname)) it.url = page.registrationUrl;
  if (page.organizerName) {
    const name = page.organizerName.slice(0, 120);
    const existing = await db.prepare("SELECT id FROM organizations WHERE lower(name)=lower(?) OR lower(short_name)=lower(?) OR slug=? LIMIT 1").bind(name, name, slugify(name)).first();
    if (existing) it.organizationId = existing.id;
    else {
      const slug = slugify(name).slice(0, 80);
      await db.prepare("INSERT INTO organizations (slug, name, type, website, default_city, notes) VALUES (?,?,?,?,?,?) ON CONFLICT(slug) DO NOTHING").bind(slug, name, "vendor", page.organizerWebsite || null, "virtual", `Created by the feed importer from an aggregator listing (${host}); check type`).run();
      const row = await db.prepare("SELECT id FROM organizations WHERE slug=?").bind(slug).first();
      if (row) it.organizationId = row.id;
    }
  }
}

// ---------- SANS webcasts ----------
// sans.org/webcasts is an Algolia index behind the site's own proxy. One POST returns the upcoming webcasts with UTC
// times, speakers, the CPE count and a description; every one is free and online. The feed row's url is the proxy.
export async function fetchSans(url, now = new Date()) {
  const body = { requests: [{ indexName: "webinar_single_startDateTimestamp_asc", params: { hitsPerPage: 100, page: 0, query: "", numericFilters: [`endDateTimestamp>=${Math.floor(now.getTime() / 1000)}`] } }] };
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "TheWatchFeedBot/1.0 (+https://bettersecurity.ai)", Referer: "https://www.sans.org/webcasts/" }, body: JSON.stringify(body), cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return parseSans(j);
}
export function parseSans(j) {
  const hits = (j && j.results && j.results[0] && j.results[0].hits) || [];
  const out = [];
  for (const h of hits) {
    if (!h.utcStartDate || !h.utcStartTime || !h.title) continue;
    const startUtc = new Date(`${h.utcStartDate}T${h.utcStartTime}Z`);
    const endUtc = h.utcEndDate && h.utcEndTime ? new Date(`${h.utcEndDate}T${h.utcEndTime}Z`) : new Date(startUtc.getTime() + 3600000);
    if (isNaN(startUtc)) continue;
    const speakers = Array.isArray(h.speakers) ? h.speakers.map((sp) => (typeof sp === "string" ? sp : sp && (sp.name || sp.title))).filter(Boolean).join("; ") : null;
    out.push({ uid: `sans:${h.webcastId || h.uid || h.objectID}`, title: String(h.title).trim(), startUtc, endUtc, url: /^https?:/.test(h.url || "") ? h.url : `https://www.sans.org${h.url || ""}`,
      summary: String(h.description || "").trim(), speakers: speakers ? speakers.slice(0, 300) : null, platform: "SANS", cpeHint: parseFloat(h.cpesGiven) > 0 ? 1 : null, cpeHours: parseFloat(h.cpesGiven) || null, online: true });
  }
  return out;
}

export async function runSource(db, src, { now = new Date() } = {}) {
  // A city added in the last minute may not be in this isolate's cached list yet, and cityTz would then fall back to
  // Pacific and shift every wall clock time. Refresh when the source's city is unknown.
  if (src.city !== "virtual" && cityTz(src.city) === "America/Los_Angeles") await loadCities(db, { force: true });
  const stats = { source_id: src.id, name: src.name, fetched: 0, added: 0, skipped: 0, error: null };
  let items = [];
  try {
    if (src.kind === "sans") items = await fetchSans(src.url, now);
    else { const text = await fetchText(src.url); items = src.kind === "brighttalk" ? parseBrightTalk(text) : parseIcal(text, src.timezone || TZ); }
  } catch (e) {
    stats.error = String(e && e.message || e);
    await logRun(db, src, stats);
    return stats;
  }
  const horizon = new Date(now.getTime() + WINDOW_DAYS * 86400000);
  const defaultVenues = new Map(); // organization id -> default venue row, looked up once per run
  let topics = []; try { topics = JSON.parse(src.topics || "[]"); } catch {}
  // Whole-word keyword filter for mixed feeds ("AI" must not match "detail"). A list that starts with "title:" is
  // matched against the title only, for feeds whose descriptions mention everything (Free Live CPE).
  const titleOnly = /^\s*title:/i.test(src.keywords || "");
  const kw = String(src.keywords || "").replace(/^\s*title:/i, "").split(",").map((k) => k.trim()).filter(Boolean)
    .map((k) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "i"));
  for (const it of items) {
    if (kw.length) {
      const hay = titleOnly ? String(it.title || "") : `${it.title} ${it.summary || ""}`;
      if (!kw.some((re) => re.test(hay))) { stats.skipped++; continue; }
    }
    if (!it.title || !it.startUtc || !(it.url || "").startsWith("http")) { stats.skipped++; continue; }
    // English calendar: sessions titled in Japanese, Chinese, Korean, Cyrillic, Arabic, Hebrew or Thai are skipped.
    if (/[Ѐ-ӿ֐-ۿ฀-๿぀-ヿ㐀-鿿가-힯]/.test(it.title)) { stats.skipped++; continue; }
    if (it.startUtc < now || it.startUtc > horizon) { stats.skipped++; continue; }
    stats.fetched++;
    await enrichFromAggregator(db, it);
    const tz = cityTz(src.city); // the calendar's own zone; virtual rows stay in Pacific
    const startLocal = utcToLocalIso(it.startUtc, tz), endLocal = utcToLocalIso(it.endUtc, tz);
    const day = startLocal.slice(0, 10);
    // Dedupe: the same feed uid keeps it out in any status (a rejected feed row must not come back on the next pull);
    // registration url or same title on the same day keeps it out unless that row was rejected
    const dup = await db.prepare(`SELECT id FROM events WHERE feed_uid=? OR ((registration_url=? OR registration_url=? OR (lower(title)=lower(?) AND substr(start_at,1,10)=?)) AND status!='rejected') LIMIT 1`)
      .bind(it.uid, it.url, it.aggregatorUrl || it.url, it.title, day).first();
    if (dup) { stats.skipped++; continue; }
    let slug = `${slugify(it.title).slice(0, 80).replace(/-+$/, "")}-${day}`;
    const clash = await db.prepare("SELECT id FROM events WHERE slug=?").bind(slug).first();
    if (clash) slug += "-" + Math.random().toString(36).slice(2, 6);
    const isSd = src.city !== "virtual";
    const online = src.kind === "brighttalk" || src.kind === "sans" ? true : it.online;
    // Meetup and Luma feeds often carry no venue. The organizer record can hold its usual one (default_venue_name
    // and default_venue_address on /admin/organizations); that fills the row so it does not arrive as "see the organizer's page".
    const orgId = it.organizationId || src.organization_id || null;
    let dv = null;
    if (isSd && !online && !it.location && orgId) {
      if (!defaultVenues.has(orgId)) defaultVenues.set(orgId, await db.prepare("SELECT default_venue_name, default_venue_address FROM organizations WHERE id=?").bind(orgId).first().catch(() => null));
      dv = defaultVenues.get(orgId);
      if (dv && !dv.default_venue_name) dv = null;
    }
    const venueName = isSd && !online ? (it.location || (dv && dv.default_venue_name) || "See the organizer's page for the venue") : (online ? it.platform : null);
    const venueAddress = isSd && !online ? (it.location || (dv && dv.default_venue_address) || null) : "Virtual";
    const format = isSd ? (online ? "virtual" : "in_person") : "virtual";
    const cpe = src.cpe_default || it.cpeHint ? 1 : 0;
    const notes = `Feed import ${now.toISOString().slice(0, 10)} from ${src.name}.${it.aggregatorUrl ? ` Registration link and organizer taken from the organizer's own page via ${it.aggregatorUrl}.` : ""} Time taken from the feed (UTC ${it.startUtc.toISOString().slice(0, 16)}Z). Publishes automatically in 24 hours unless held or rejected.`;
    await db.prepare(`INSERT INTO events (slug, city, title, organization_id, venue_name, venue_address, start_at, end_at, start_utc, end_utc, timezone, format, platform, speakers,
        description_short, description_long, registration_url, cost_type, cost_min, cost_max, cpe_eligible, cpe_hours, cpe_body, topics, audience_level, also_virtual, is_better_security_event,
        status, source, source_url, reviewer_notes, feed_uid, auto_publish_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(slug, src.city, it.title.slice(0, 140), it.organizationId || src.organization_id || null,
        venueName, venueAddress,
        startLocal, endLocal, it.startUtc.toISOString(), it.endUtc.toISOString(), tz, format, online ? it.platform : null, it.speakers,
        firstSentence(it.summary, 200) || it.title, it.summary ? plainText(it.summary).slice(0, 4000) : null, it.url,
        src.kind === "brighttalk" || src.kind === "sans" ? "free" : "unknown", src.kind === "brighttalk" || src.kind === "sans" ? 0 : null, src.kind === "brighttalk" || src.kind === "sans" ? 0 : null,
        cpe, it.cpeHours || (cpe && src.cpe_default ? 1 : null), cpe ? (src.cpe_body || "self_reported") : null, JSON.stringify(topics.length ? topics : ["threat_intel"]), "practitioner",
        isSd && online ? 1 : 0, 0, "pending_review", "feed", it.aggregatorUrl || src.url, notes, it.uid, autoPublishAt()).run();
    stats.added++;
  }
  await logRun(db, src, stats);
  return stats;
}

async function logRun(db, src, s) {
  await db.batch([
    db.prepare("INSERT INTO feed_runs (source_id, fetched, added, skipped, error) VALUES (?,?,?,?,?)").bind(src.id, s.fetched, s.added, s.skipped, s.error),
    db.prepare("UPDATE feed_sources SET last_run_at=datetime('now'), last_status=?, last_added=? WHERE id=?").bind(s.error ? `error: ${s.error}`.slice(0, 200) : `ok, ${s.fetched} upcoming, ${s.added} new`, s.added, src.id),
  ]);
}

export async function runAllSources(db, { onlyId = null, dueOnly = false, max = null } = {}) {
  // dueOnly: only sources not pulled in the last day, oldest first, up to max; the hourly tick uses this so every
  // feed is read about daily instead of once a week.
  const sql = onlyId ? "SELECT * FROM feed_sources WHERE id=?"
    : dueOnly ? "SELECT * FROM feed_sources WHERE active=1 AND (last_run_at IS NULL OR last_run_at < datetime('now', '-23 hours')) ORDER BY last_run_at IS NOT NULL, last_run_at, id LIMIT ?"
    : "SELECT * FROM feed_sources WHERE active=1 ORDER BY id";
  const { results } = await db.prepare(sql).bind(...(onlyId ? [onlyId] : dueOnly ? [max || 3] : [])).all();
  const out = [];
  for (const src of results) out.push(await runSource(db, src));
  return out;
}
