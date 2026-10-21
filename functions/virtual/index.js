import { lazyAutoPublish } from "../_lib/autopublish.js";
import { html, page, raw } from "../_lib/html.js";
import { shell, signupForm } from "../_lib/layout.js";
import { queryEvents, eventTags, costLabel } from "../_lib/events.js";
import { TOPICS, CITIES, eventPath, orgPath } from "../_lib/constants.js";
import { addDays, todayKey, nowLocalIso, toUtc } from "../_lib/dates.js";

// Bodies shown as a grouped organizer filter. Slugs must match organizations.slug.
export const BODIES = [
  ["isaca", "ISACA", ["isaca", "isaca-san-diego"]],
  ["isc2", "ISC2", ["isc2", "isc2-san-diego"]],
  ["iia", "IIA", ["iia", "iia-san-diego"]],
  ["iapp", "IAPP", ["iapp", "iapp-san-diego-knowledgenet"]],
  ["csa", "CSA", ["cloud-security-alliance", "csa-san-diego"]],
  ["sans", "SANS", ["sans", "sans-san-diego"]],
  ["owasp", "OWASP", ["owasp", "owasp-san-diego"]],
  ["gov", "NIST and CISA", ["nist", "cisa"]],
  ["media", "Media and training", ["brighttalk", "sc-media", "dark-reading", "help-net-security", "hack-the-box", "tryhackme"]],
  ["vendor", "Vendors", null],
];

export async function onRequestGet({ request, env, waitUntil }) {
  lazyAutoPublish(env.DB, waitUntil);
  const u = new URL(request.url); const q = u.searchParams;
  const f = {
    topic: TOPICS[q.get("topic")] ? q.get("topic") : "",
    body: BODIES.some(([k]) => k === q.get("body")) ? q.get("body") : "",
    cost: ["free", "paid"].includes(q.get("cost")) ? q.get("cost") : "",
    cpe: q.get("cpe") === "0" ? "" : "1", // CPE on by default; ?cpe=0 shows everything
    vendors: q.get("vendors") === "0" ? "0" : "1",
    q: (q.get("q") || "").slice(0, 80),
  };
  const today = todayKey();
  const horizon = addDays(today, 60);
  let events = await queryEvents(env.DB, { city: "virtual", from: nowLocalIso(), to: horizon + "T00:00", topic: f.topic, cost: f.cost, cpe: f.cpe, q: f.q, limit: 800 });
  if (f.body === "vendor") events = events.filter((e) => e.org_type === "vendor");
  else if (f.body) { const slugs = BODIES.find(([k]) => k === f.body)[2] || []; events = events.filter((e) => slugs.includes(e.org_slug)); }
  if (f.vendors === "0") events = events.filter((e) => e.org_type !== "vendor");
  const counts = { total: events.length, cpe: events.filter((e) => e.cpe_eligible).length, free: events.filter((e) => ["free", "members_free"].includes(e.cost_type)).length };

  const keep = (over) => { const p = new URLSearchParams(); Object.entries({ ...f, ...over }).forEach(([k, v]) => { if (v && !(k === "cpe" && v === "1") && !(k === "vendors" && v === "1")) p.set(k, v); }); const s = p.toString(); return "/virtual" + (s ? "?" + s : ""); };

  const body = html`
  <section class="cal-head">
    <div class="wrap">
      <div class="cal-title-row">
        <div>
          <p class="kicker">Live online, from anywhere</p>
          <h1>The Watch Virtual</h1>
          <p class="cal-sub">Webinars, virtual summits and online chapter meetings worth your hour, with CPE hours noted where the organizer offers them. ${counts.total} sessions in the next 60 days${counts.cpe ? html`, ${counts.cpe} with CPE` : ""}.</p>
        </div>
        <div class="view-toggle city-toggle" role="tablist" aria-label="Calendar">
          ${Object.values(CITIES).map((c) => html`<a role="tab" aria-selected="false" href="/${c.slug}">${c.name}</a>`)}
          <a role="tab" aria-selected="true" href="/virtual">Virtual</a>
        </div>
      </div>
      <form class="filters" method="get" action="/virtual">
        <label>Organizer<select name="body"><option value="">All organizers</option>${BODIES.map(([k, label]) => html`<option value="${k}" ${f.body === k ? raw("selected") : ""}>${label}</option>`)}</select></label>
        <label>Topic<select name="topic"><option value="">All topics</option>${Object.entries(TOPICS).filter(([k]) => k !== "social").map(([k, v]) => html`<option value="${k}" ${f.topic === k ? raw("selected") : ""}>${v}</option>`)}</select></label>
        <label>Cost<select name="cost"><option value="">Any cost</option><option value="free" ${f.cost === "free" ? raw("selected") : ""}>Free</option><option value="paid" ${f.cost === "paid" ? raw("selected") : ""}>Paid</option></select></label>
        <label class="check"><input type="checkbox" name="cpe" value="1" ${f.cpe ? raw("checked") : ""} data-off-value="0"> CPE eligible only</label>
        <label class="check"><input type="checkbox" name="vendors" value="1" ${f.vendors === "1" ? raw("checked") : ""} data-off-value="0"> Include vendor sessions</label>
        <label class="search">Search<input type="search" name="q" value="${f.q}" placeholder="Title or organizer"></label>
        <label>Show times in<select id="tz-select" aria-label="Time zone"><option value="auto">My time zone</option><option value="America/Los_Angeles">Pacific</option><option value="America/Denver">Mountain</option><option value="America/Chicago">Central</option><option value="America/New_York">Eastern</option><option value="UTC">UTC</option></select></label>
        <button class="btn btn-small btn-primary" type="submit">Apply</button>
        ${(f.topic || f.body || f.cost || f.q || !f.cpe || f.vendors === "0") ? html`<a class="clear" href="/virtual">Reset</a>` : ""}
      </form>
    </div>
  </section>
  <div class="wrap">
    <div id="virtual-list" data-virtual-list>
      ${events.length ? html`<ul class="event-list virtual-list">${events.map((e) => virtualRow(e))}</ul>` : html`<p class="empty">${f.cpe ? "No CPE eligible sessions match. Untick the CPE box to see everything, or " : "Nothing matches these filters. "}<a href="/submit">submit a session</a>.</p>`}
    </div>
    <p class="list-foot">Times are shown in your selected zone; the underlying schedule comes from each organizer's page, which stays authoritative. CPE hours are as the organizer reports them. <a href="/virtual/feed.ics">Subscribe to this calendar</a>.</p>
  </div>
  <section class="band band-navy band-tight"><div class="wrap split-center">
    <div><h2>Five of these, every Sunday.</h2><p>The Sunday email picks the week's best CPE eligible sessions alongside the San Diego calendar.</p></div>
    ${signupForm({ source: "virtual" })}
  </div></section>`;

  const res = page(shell({ title: "Virtual security webinars and CPE sessions", description: "Live online cybersecurity, audit, privacy and AI governance sessions from ISACA, ISC2, IIA, IAPP, SANS and vendors, with CPE hours noted.", body, city: "virtual", path: "/virtual", wide: true }), 200, { "Cache-Control": "public, max-age=120" });
  res.headers.append("Set-Cookie", "watch_city=virtual; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  return res;
}

// A row carrying UTC instants so the browser can render them in any zone.
function virtualRow(e) {
  const startUtc = e.start_utc || (toUtc(e.start_at, e.timezone) || new Date()).toISOString();
  const endUtc = e.end_utc || (e.end_at ? toUtc(e.end_at, e.timezone).toISOString() : "");
  return html`
  <li class="event-row virtual-row ${e.org_type === "vendor" ? "is-vendor" : ""} ${e.is_featured ? "is-featured" : ""}" data-start="${startUtc}" data-end="${endUtc}">
    <div class="event-time"><span class="v-date" data-tz-date>${startUtc.slice(0, 10)}</span><span class="v-time" data-tz-time>${startUtc.slice(11, 16)} UTC</span></div>
    <div class="event-main">
      <h3 class="event-title"><a href="${eventPath(e)}">${e.title}</a></h3>
      <p class="event-meta">${e.org_display ? html`<a href="${orgPath(e.org_slug, e.city)}">${e.org_display}</a>` : ""}${e.platform && e.platform !== "other" ? html`<span class="sep"></span>${e.platform}` : ""}${e.speakers ? html`<span class="sep"></span>${e.speakers}` : ""}</p>
      ${e.description_short ? html`<p class="event-blurb">${e.description_short}</p>` : ""}
      <div class="tags">${e.org_type === "vendor" ? html`<span class="tag tag-vendor">Vendor</span>` : ""}${eventTags(e, { showFormat: false })}</div>
    </div>
    <div class="event-actions">${e.registration_url ? html`<a class="btn btn-small btn-outline" href="/go/${e.id}?t=register" rel="noopener">Register</a>` : ""}${e.recording_url ? html`<a class="btn btn-small btn-ghost-dark" href="${e.recording_url}" rel="noopener" target="_blank">Recording</a>` : ""}</div>
  </li>`;
}
