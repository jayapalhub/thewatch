// LinkedIn company page posting. Two posts a week per city, written from the same data as the Sunday email:
//   Monday 9 AM local:   "This week in <City>": up to three events, with a link to the calendar.
//   Thursday 9 AM local: "Hiring in <City>": up to three roles, named ones first, with a link to the jobs page.
// Posts go out as the Better Security page through the Community Management API (w_organization_social). One
// connection row holds the page admin's token (60 days); the hourly job warns Jerome a week before it expires.
// Nothing here posts unless a token is connected and the connection is not paused. Every post is recorded in
// linkedin_posts first, so a post is never sent twice for the same city, kind and week.
// Delivery can also go through a webhook (Make or Zapier) when LINKEDIN_WEBHOOK_URL is set and no token exists.
import { queryEvents, costLabel } from "./events.js";
import { liveJobs, pickJobsFor } from "./jobs.js";
import { CITIES, SHOW_BS_EVENTS } from "./constants.js";
import { weekday3, month3, dayNum, fmtTime, addDays, mondayOf, todayKey } from "./dates.js";
import { notifyJerome } from "./integrations.js";
import { localNow } from "./dispatch.js";

export const LI_VERSION = "202509";
export const SCOPES = "w_organization_social r_organization_social";
const POST_HOUR = 9;

export async function getAuth(db) {
  try { return (await db.prepare("SELECT * FROM linkedin_auth WHERE id=1").first()) || null; } catch { return null; }
}
export function clientId(env, auth) { return env.LINKEDIN_CLIENT_ID || (auth && auth.client_id) || ""; }
export function clientSecret(env, auth) { return env.LINKEDIN_CLIENT_SECRET || (auth && auth.client_secret) || ""; }
export function redirectUri(env) { return `${env.SITE_URL || "https://bettersecurity.ai"}/admin/linkedin/callback`; }

export function tokenState(auth) {
  if (!auth || !auth.access_token) return "none";
  const exp = Date.parse(auth.token_expires_at || 0) || 0;
  if (exp <= Date.now()) return "expired";
  if (exp - Date.now() < 7 * 86400000) return "expiring";
  return "ok";
}

// Step one of the authorization: send the admin to LinkedIn with a one time state value.
export async function authorizeUrl(db, env, auth) {
  const state = crypto.randomUUID().replace(/-/g, "");
  await db.prepare("UPDATE linkedin_auth SET oauth_state=?, updated_at=datetime('now') WHERE id=1").bind(state).run();
  const p = new URLSearchParams({ response_type: "code", client_id: clientId(env, auth), redirect_uri: redirectUri(env), state, scope: SCOPES });
  return `https://www.linkedin.com/oauth/v2/authorization?${p}`;
}

// Step two: exchange the code for a token and store it.
export async function finishAuthorization(db, env, { code, state, by }) {
  const auth = await getAuth(db);
  if (!auth || !state || state !== auth.oauth_state) return { error: "The sign in did not match this site's request. Press Connect again." };
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(env), client_id: clientId(env, auth), client_secret: clientSecret(env, auth) });
  const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return { error: `LinkedIn refused the token exchange: ${j.error_description || j.error || r.status}` };
  const expires = new Date(Date.now() + (j.expires_in || 5184000) * 1000).toISOString();
  await db.prepare("UPDATE linkedin_auth SET access_token=?, token_expires_at=?, scope=?, connected_at=datetime('now'), connected_by=?, expiry_warned_at=NULL, oauth_state=NULL, updated_at=datetime('now') WHERE id=1")
    .bind(j.access_token, expires, j.scope || SCOPES, by || null).run();
  return { ok: true, expires };
}

// LinkedIn's commentary field treats these as markup unless escaped.
export function escapeCommentary(s) { return String(s || "").replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => "\\" + c); }

function trackUrl(siteUrl, path, kind) { return `${siteUrl}${path}?utm_source=linkedin&utm_medium=page&utm_campaign=${kind}`; }

function eventLine(e) {
  const when = `${weekday3(e.start_at)} ${fmtTime(e.start_at)}`;
  const where = e.format === "virtual" ? "online" : (e.venue_display || "");
  const cost = costLabel(e) && e.cost_type !== "unknown" ? costLabel(e) : "";
  const org = e.org_display && !String(e.title).toLowerCase().includes(String(e.org_display).toLowerCase()) ? e.org_display : ""; // skip "Authenticate 2026 (FIDO Alliance) (FIDO Alliance)"
  const paren = [org, where].filter(Boolean).join(", ");
  return `${when}: ${e.title}${paren ? ` (${paren})` : ""}${cost ? `, ${cost}` : ""}`;
}

// The Monday post: the coming week's events for a city. Featured first, then free in person, then the rest.
export async function composeEventsPost(db, citySlug, siteUrl, weekStart) {
  const city = CITIES[citySlug]; if (!city) return null;
  const from = `${weekStart}T00:00`, to = `${addDays(weekStart, 7)}T00:00`;
  const events = (await queryEvents(db, { city: citySlug, from, to, limit: 100 })).filter((e) => SHOW_BS_EVENTS || !e.is_better_security_event);
  if (!events.length) return null;
  const rank = (e) => (e.is_featured ? 0 : 1) * 10 + (e.format !== "virtual" ? 0 : 5) + (["free", "members_free", "donation"].includes(e.cost_type) ? 0 : 1);
  const picks = [...events].sort((a, b) => rank(a) - rank(b) || a.start_at.localeCompare(b.start_at)).slice(0, 3).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const n = events.length;
  const link = trackUrl(siteUrl, `/${citySlug}`, "events");
  const lines = [
    `This week in ${city.name}: ${n} security event${n === 1 ? "" : "s"} on The Watch.`,
    "",
    ...picks.map(eventLine),
    ...(n > picks.length ? ["", `Plus ${n - picks.length} more, with CPE hours, prices and registration links, on the calendar. Free Sunday email for ${city.name} at the same link.`] : ["", `CPE hours, prices and registration links are on the calendar. Free Sunday email for ${city.name} at the same link.`]),
    link,
  ];
  return { text: lines.join("\n"), link, count: n };
}

// The Thursday post: three live roles, named ones first (the board is tiered, see jobs.js).
export async function composeJobsPost(db, citySlug, siteUrl, weekStart) {
  const city = CITIES[citySlug]; if (!city) return null;
  const jobs = await liveJobs(db, citySlug, { limit: 100 });
  if (!jobs.length) return null;
  const picks = pickJobsFor(jobs, null, 3);
  const link = trackUrl(siteUrl, `/${citySlug}/jobs`, "jobs");
  const n = jobs.length;
  const lines = [
    `Hiring in ${city.name}: ${n} security, GRC and privacy role${n === 1 ? "" : "s"} on The Watch this week, each linked to the employer's own posting.`,
    "",
    ...picks.map((j) => `${j.title}, ${j.employer}${j.location ? ` (${j.location.split(";")[0].trim()})` : ""}${j.posted_by_name ? `, posted by ${j.posted_by_name}` : ""}`),
    "",
    n > picks.length ? `All ${n} roles, with pay ranges where the employer lists one:` : "Details and the employer's posting:",
    link,
  ];
  return { text: lines.join("\n"), link, count: n };
}

// The launch kit for a city: a one time "The Watch <city> is live" post for the Better Security page, a subscribe
// line for anywhere, and a short paragraph to send a chapter leader who asks what The Watch is. Built from live
// counts so the numbers are right on the day Jerome pastes them. Nothing here posts itself.
export async function composeLaunchKit(db, citySlug, siteUrl) {
  const city = CITIES[citySlug]; if (!city) return null;
  const today = todayKey(city.timezone);
  const events = (await queryEvents(db, { city: citySlug, from: `${today}T00:00`, to: `${addDays(today, 70)}T00:00`, limit: 200 })).filter((e) => SHOW_BS_EVENTS || !e.is_better_security_event);
  const jobs = await liveJobs(db, citySlug, { limit: 200 });
  const orgs = new Set(events.map((e) => e.org_display).filter(Boolean));
  const n = events.length, j = jobs.length;
  const subscribe = trackUrl(siteUrl, `/${citySlug}/subscribe`, "launch");
  const calendar = trackUrl(siteUrl, `/${citySlug}`, "launch");
  const sunday = city.newsletter === "sunday" ? `A free email every Sunday at 8 AM lists the week ahead, with a short note on which ones are worth your evening.` : `A free Sunday email for ${city.name} starts soon.`;
  const post = [
    `The Watch ${city.name} is live.`,
    "",
    `Every cybersecurity, AI security, privacy and audit event in ${city.region}, in one calendar: chapter meetings, meetups, summits and vendor sessions, with CPE hours, prices and the organizer's own registration link. ${n ? `${n} event${n === 1 ? " is" : "s are"} on it for the next ten weeks${orgs.size ? ` from ${orgs.size} organizer${orgs.size === 1 ? "" : "s"}` : ""}.` : ""}`,
    ...(j ? ["", `There is also a jobs board: ${j} local security, GRC and privacy role${j === 1 ? "" : "s"}, each linked to the employer's own posting, no aggregators.`] : []),
    "",
    sunday,
    "",
    `Calendar: ${calendar}`,
    `Sunday email: ${subscribe}`,
    "",
    `Organizers: submit an event at ${siteUrl}/submit and it appears once approved. Published by Better Security.`,
  ].join("\n");
  const line = `The Watch ${city.name}: every security event in ${city.region} in one calendar, and a free Sunday email with the week ahead. ${subscribe}`;
  const organizer = `The Watch is a free calendar of cybersecurity, AI security, privacy and audit events for ${city.region} at ${siteUrl}/${citySlug}, published by Better Security. Each event lists the date, venue, CPE hours and price and links to the organizer's own registration page, and a Sunday email sends the week ahead to local subscribers. Your chapter's meetings are listed from your public calendar; if you would like us to pull from a feed, feature a session, or correct anything, reply to this note or submit at ${siteUrl}/submit. There is no charge and no catch; the aim is to get more people in the room at the events that are already happening.`;
  return { post, line, organizer, events: n, jobs: j, organizers: orgs.size };
}

// Publish one post as the organization. Returns { urn } or throws.
export async function publishAsOrg(auth, text, link) {
  const body = {
    author: `urn:li:organization:${auth.org_id}`,
    commentary: escapeCommentary(text),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (link) body.content = { article: { source: link } };
  const r = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0", "LinkedIn-Version": LI_VERSION },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`LinkedIn ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return { urn: r.headers.get("x-restli-id") || r.headers.get("x-linkedin-id") || "" };
}

// Alternative delivery: hand the text to a Make or Zapier webhook that posts to the page.
async function publishViaWebhook(env, post) {
  const r = await fetch(env.LINKEDIN_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: post.text, link: post.link, city: post.city, kind: post.kind, week_start: post.week_start }) });
  if (!r.ok) throw new Error(`webhook ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { urn: "webhook" };
}

// Queue a post for (city, kind, week) if none exists. Returns the row or null when there is nothing to say.
export async function queuePost(db, env, citySlug, kind, weekStart) {
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const existing = await db.prepare("SELECT * FROM linkedin_posts WHERE city=? AND kind=? AND week_start=?").bind(citySlug, kind, weekStart).first();
  if (existing) return existing;
  const post = kind === "events" ? await composeEventsPost(db, citySlug, siteUrl, weekStart) : await composeJobsPost(db, citySlug, siteUrl, weekStart);
  if (!post) {
    await db.prepare("INSERT OR IGNORE INTO linkedin_posts (city, kind, week_start, text, status, error) VALUES (?,?,?,?,'skipped','nothing to post')").bind(citySlug, kind, weekStart, "").run();
    return null;
  }
  await db.prepare("INSERT OR IGNORE INTO linkedin_posts (city, kind, week_start, text, link, status) VALUES (?,?,?,?,?,'queued')").bind(citySlug, kind, weekStart, post.text, post.link).run();
  return db.prepare("SELECT * FROM linkedin_posts WHERE city=? AND kind=? AND week_start=?").bind(citySlug, kind, weekStart).first();
}

// Send one queued row. Claims it first so two runs cannot post it twice.
export async function sendQueued(db, env, row, auth) {
  const claim = await db.prepare("UPDATE linkedin_posts SET status='sending' WHERE id=? AND status='queued'").bind(row.id).run();
  if (!claim.meta || claim.meta.changes !== 1) return { skipped: "already handled" };
  try {
    const res = auth && tokenState(auth) !== "none" && tokenState(auth) !== "expired" ? await publishAsOrg(auth, row.text, row.link) : env.LINKEDIN_WEBHOOK_URL ? await publishViaWebhook(env, row) : null;
    if (!res) { await db.prepare("UPDATE linkedin_posts SET status='queued' WHERE id=?").bind(row.id).run(); return { skipped: "not connected" }; }
    await db.prepare("UPDATE linkedin_posts SET status='posted', post_urn=?, posted_at=datetime('now'), error=NULL WHERE id=?").bind(res.urn, row.id).run();
    return { posted: true, urn: res.urn };
  } catch (e) {
    await db.prepare("UPDATE linkedin_posts SET status='failed', error=? WHERE id=?").bind(String(e && e.message).slice(0, 400), row.id).run();
    return { failed: String(e && e.message) };
  }
}

// Hourly: queue and send what is due. Monday 9 AM local is the events post, Thursday 9 AM local the jobs post, per
// active city. A post stays queued (and is retried every hour that day) until the connection works; after that day
// it is left alone so a stale week never posts late. Also warns Jerome once when the token is a week from expiring.
export async function runLinkedInSchedule(env, { force = false } = {}) {
  const db = env.DB;
  const auth = await getAuth(db);
  const out = { posted: 0, queued: 0, skipped: 0, failed: 0, state: tokenState(auth) };
  if (!auth) return { ...out, error: "no linkedin_auth row" };
  if (auth.paused && !force) return { ...out, paused: true };
  const connected = ["ok", "expiring"].includes(tokenState(auth)) || !!env.LINKEDIN_WEBHOOK_URL;
  for (const city of Object.values(CITIES)) {
    const now = localNow(city.timezone);
    const weekStart = mondayOf(now.date);
    const due = now.weekday === "Mon" && now.hour >= POST_HOUR ? "events" : now.weekday === "Thu" && now.hour >= POST_HOUR ? "jobs" : null;
    if (!due && !force) continue;
    const kind = due || (now.weekday === "Thu" || now.weekday === "Fri" ? "jobs" : "events");
    const row = await queuePost(db, env, city.slug, kind, weekStart);
    if (!row) { out.skipped++; continue; }
    if (row.status !== "queued") continue;
    if (!connected) { out.queued++; continue; }
    const r = await sendQueued(db, env, row, auth);
    if (r.posted) out.posted++; else if (r.failed) out.failed++; else out.skipped++;
  }
  // Token expiry warning, once per token.
  if (auth.access_token && tokenState(auth) === "expiring" && !auth.expiry_warned_at) {
    await db.prepare("UPDATE linkedin_auth SET expiry_warned_at=datetime('now') WHERE id=1 AND expiry_warned_at IS NULL").run();
    const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
    await notifyJerome(env, "The Watch: reconnect LinkedIn this week", `<p>The LinkedIn connection that posts to the Better Security page expires on ${String(auth.token_expires_at).slice(0, 10)}. Press Reconnect at <a href="${siteUrl}/admin/linkedin">${siteUrl}/admin/linkedin</a> while signed in to LinkedIn as a page admin. It takes one click and the posts carry on.</p>`).catch(() => {});
  }
  return out;
}

// For the admin preview: what Monday's and Thursday's posts would say right now.
export async function previewPosts(db, env) {
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const out = [];
  for (const city of Object.values(CITIES)) {
    const now = localNow(city.timezone);
    const thisMon = mondayOf(now.date);
    const eventsWeek = now.weekday === "Sun" || now.weekday === "Sat" ? addDays(thisMon, 7) : thisMon;
    out.push({ city, kind: "events", week_start: eventsWeek, post: await composeEventsPost(db, city.slug, siteUrl, eventsWeek) });
    out.push({ city, kind: "jobs", week_start: thisMon, post: await composeJobsPost(db, city.slug, siteUrl, thisMon) });
  }
  return out;
}
