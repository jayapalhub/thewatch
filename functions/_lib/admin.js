import { html, raw } from "./html.js";
import { TOPICS, FORMATS, COST_TYPES, AUDIENCE, EVENT_STATUSES, ORG_TYPES, ASSET_VERSION, CITIES, DEFAULT_CITY, eventPath, orgPath } from "./constants.js";
import { mark } from "./layout.js";
import { fmtTime } from "./dates.js";

export function adminShell({ title, body, path = "/admin", user }) {
  const nav = [["/admin", "Overview"], ["/admin/review", "Review queue"], ["/admin/events", "Events"], ["/admin/organizations", "Organizers"], ["/admin/people", "People"], ["/admin/invitations", "Invitations"], ["/admin/speakers", "Speakers"], ["/admin/jobs", "Jobs (archive)"], ["/admin/sponsor-slots", "Sponsors"], ["/admin/sponsors", "Sponsor inquiries"], ["/admin/issues", "Newsletter"], ["/admin/clicks", "Clicks"], ["/admin/linkedin", "LinkedIn"], ["/admin/feeds", "Feeds"], ["/admin/cities", "Cities"]];
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${title} | Admin</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/admin.css?v=${ASSET_VERSION}"></head>
<body><div class="a-layout">
<aside class="a-side"><a class="a-brand" href="/admin">${mark(28)}<span>The Watch admin</span></a>
<nav>${nav.map(([h, l]) => html`<a href="${h}" ${path === h || (h !== "/admin" && path.startsWith(h)) ? raw('aria-current="page"') : ""}>${l}</a>`)}</nav>
<div class="a-side-foot"><a href="/" target="_blank">View site</a><span>${user?.email || ""}</span></div></aside>
<main class="a-main"><h1>${title}</h1>${body}</main></div>
<script src="/assets/js/admin.js?v=${ASSET_VERSION}" defer></script></body></html>`;
}

// One line clash notice for the admin. `hits` comes from findClashes in clashes.js.
export function clashNotice(hits) {
  if (!hits || !hits.length) return "";
  return html`<p class="a-warn a-clash">Same time slot: ${hits.map((o, i) => html`${i ? "; " : ""}<a href="/admin/events/${o.id}">${o.title}</a>${o.org_short || o.org_name ? ` (${o.org_short || o.org_name})` : ""} at ${fmtTime(o.start_at)}`)}. Starts within two hours on the same day.</p>`;
}
export function flash(msg, kind = "ok") { return msg ? html`<p class="a-flash a-flash-${kind}">${msg}</p>` : ""; }

const opt = (k, v, cur) => html`<option value="${k}" ${String(cur) === String(k) ? raw("selected") : ""}>${v}</option>`;

// Shared event form for /admin/events/new and /admin/events/:id
export function eventForm(e, orgs, venues, { action, isNew = false } = {}) {
  e = e || {};
  const topics = Array.isArray(e.topics) ? e.topics : [];
  const d = (e.start_at || "").slice(0, 10), st = (e.start_at || "").slice(11, 16), et = (e.end_at || "").slice(11, 16);
  return html`
  <form class="a-form" method="post" action="${action}">
    <div class="a-grid-2">
      <label>Title<input name="title" required value="${e.title || ""}" maxlength="140"></label>
      <label>Slug <small>(blank to auto generate)</small><input name="slug" value="${e.slug || ""}" maxlength="90"></label>
    </div>
    <div class="a-grid-3">
      <label>Organizer<select name="organization_id"><option value="">None</option>${orgs.map((o) => opt(o.id, o.name, e.organization_id))}</select></label>
      <label>Calendar<select name="city">${Object.values(CITIES).map((c) => opt(c.slug, c.name, e.city || DEFAULT_CITY))}${opt("virtual", "Virtual (online, anywhere)", e.city || DEFAULT_CITY)}</select></label>
      <label>Status<select name="status">${EVENT_STATUSES.map((s) => opt(s, s.replace("_", " "), e.status || "pending_review"))}</select></label>
      <label>Source<select name="source">${["manual", "submission", "feed", "recurrence", "research"].map((s) => opt(s, s, e.source || "manual"))}</select></label>
    </div>
    <div class="a-grid-3">
      <label>Date<input type="date" name="date" required value="${d}"></label>
      <label>Start<input type="time" name="start_time" required value="${st}"></label>
      <label>End<input type="time" name="end_time" value="${et}"></label>
    </div>
    <div class="a-grid-3">
      <label>Format<select name="format">${Object.entries(FORMATS).map(([k, v]) => opt(k, v, e.format || "in_person"))}</select></label>
      <label>Venue (saved)<select name="venue_id"><option value="">None / use text</option>${venues.map((v) => opt(v.id, v.name, e.venue_id))}</select></label>
      <label>Audience<select name="audience_level">${Object.entries(AUDIENCE).map(([k, v]) => opt(k, v, e.audience_level || "open"))}</select></label>
    </div>
    <div class="a-grid-2">
      <label>Venue name (text)<input name="venue_name" value="${e.venue_name || ""}" maxlength="120"></label>
      <label>Venue address<input name="venue_address" value="${e.venue_address || ""}" maxlength="200"></label>
    </div>
    <label>Registration URL<input type="url" name="registration_url" value="${e.registration_url || ""}" maxlength="500"></label>
    <label>Source URL <small>(where the details came from)</small><input type="url" name="source_url" value="${e.source_url || ""}" maxlength="500"></label>
    <label>Short description <small>(under 200 chars; appears in lists and the email)</small><input name="description_short" value="${e.description_short || ""}" maxlength="200"></label>
    <label>Long description<textarea name="description_long" rows="6">${e.description_long || ""}</textarea></label>
    <div class="a-grid-3">
      <label>Cost type<select name="cost_type">${Object.entries(COST_TYPES).map(([k, v]) => opt(k, v, e.cost_type || "unknown"))}</select></label>
      <label>Cost min<input type="number" step="0.01" name="cost_min" value="${e.cost_min ?? ""}"></label>
      <label>Cost max<input type="number" step="0.01" name="cost_max" value="${e.cost_max ?? ""}"></label>
    </div>
    <div class="a-grid-2">
      <label>Cost notes<input name="cost_notes" value="${e.cost_notes || ""}" maxlength="200"></label>
      <label>Member price notes<input name="member_price_notes" value="${e.member_price_notes || ""}" maxlength="200"></label>
    </div>
    <div class="a-grid-3">
      <label>CPE<select name="cpe_eligible">${opt("", "Unknown", e.cpe_eligible == null ? "" : e.cpe_eligible)}${opt("1", "Yes", e.cpe_eligible)}${opt("0", "No", e.cpe_eligible)}</select></label>
      <label>CPE hours<input type="number" step="0.5" name="cpe_hours" value="${e.cpe_hours ?? ""}"></label>
      <label>CPE body<select name="cpe_body">${["", "ISACA", "ISC2", "IIA", "IAPP", "other", "self_reported"].map((b) => opt(b, b || "None", e.cpe_body || ""))}</select></label>
    </div>
    <fieldset class="a-chips"><legend>Topics</legend>${Object.entries(TOPICS).map(([k, v]) => html`<label class="a-chip"><input type="checkbox" name="topics" value="${k}" ${topics.includes(k) ? raw("checked") : ""}> ${v}</label>`)}</fieldset>
    <div class="a-grid-3">
      <label>Platform<select name="platform">${["", "Zoom", "Webex", "BrightTALK", "LinkedIn Live", "YouTube", "Teams", "other"].map((b) => opt(b, b || "None", e.platform || ""))}</select></label>
      <label>Speakers<input name="speakers" value="${e.speakers || ""}" maxlength="200"></label>
      <label>Recording URL <small>(after it airs)</small><input type="url" name="recording_url" value="${e.recording_url || ""}" maxlength="500"></label>
    </div>
    <div class="a-grid-2">
      <label>Discount code<input name="discount_code" value="${e.discount_code || ""}" maxlength="40"></label>
      <label>Discount text<input name="discount_text" value="${e.discount_text || ""}" maxlength="200"></label>
    </div>
    <div class="a-grid-3">
      <label class="a-check"><input type="checkbox" name="is_better_security_event" value="1" ${e.is_better_security_event ? raw("checked") : ""}> Better Security event</label>
      <label class="a-check"><input type="checkbox" name="is_featured" value="1" ${e.is_featured ? raw("checked") : ""}> Jerome's pick</label>
      <label class="a-check"><input type="checkbox" name="members_only" value="1" ${e.members_only ? raw("checked") : ""}> Members only (shown as a tag on the listing)</label>
      <label class="a-check"><input type="checkbox" name="also_virtual" value="1" ${e.also_virtual ? raw("checked") : ""}> Also list on the Virtual calendar (online events from a city calendar)</label>
    </div>
    <label>Reviewer notes <small>(private)</small><textarea name="reviewer_notes" rows="2">${e.reviewer_notes || ""}</textarea></label>
    ${e.submitted_by_name ? html`<p class="a-muted">Submitted by ${e.submitted_by_name} &lt;${e.submitted_by_email}&gt; on ${e.created_at}</p>` : ""}
    <div class="a-actions">
      <button class="a-btn a-btn-primary" name="action" value="save">Save</button>
      ${!isNew ? html`
        <button class="a-btn a-btn-good" name="action" value="publish">Save and publish</button>
        <button class="a-btn" name="action" value="reject">Reject</button>
        <button class="a-btn a-btn-danger" name="action" value="delete" data-confirm="Delete this event permanently?">Delete</button>
        <a class="a-btn a-btn-link" href="${eventPath(e)}" target="_blank">Preview</a>` : html`<button class="a-btn a-btn-good" name="action" value="publish">Save and publish</button>`}
    </div>
  </form>`;
}

export function orgForm(o, { action, isNew = false } = {}) {
  o = o || {};
  return html`
  <form class="a-form" method="post" action="${action}">
    <div class="a-grid-3">
      <label>Name<input name="name" required value="${o.name || ""}" maxlength="140"></label>
      <label>Short name<input name="short_name" value="${o.short_name || ""}" maxlength="60"></label>
      <label>Slug<input name="slug" value="${o.slug || ""}" maxlength="80"></label>
    </div>
    <div class="a-grid-3">
      <label>Type<select name="type">${ORG_TYPES.map((t) => opt(t, t, o.type || "community"))}</select></label>
      <label>Website<input type="url" name="website" value="${o.website || ""}"></label>
      <label>Events page<input type="url" name="events_url" value="${o.events_url || ""}"></label>
    </div>
    <div class="a-grid-3">
      <label>Contact name<input name="contact_name" value="${o.contact_name || ""}"></label>
      <label>Contact email<input type="email" name="contact_email" value="${o.contact_email || ""}"></label>
      <label>LinkedIn<input type="url" name="linkedin_url" value="${o.linkedin_url || ""}"></label>
    </div>
    <label>Logo URL<input type="url" name="logo_url" value="${o.logo_url || ""}"></label>
    <label>Description<textarea name="description" rows="3">${o.description || ""}</textarea></label>
    <div class="a-grid-2">
      <label>Usual cadence (text)<input name="usual_cadence_text" value="${o.usual_cadence_text || ""}" placeholder="Monthly, second Tuesday, 6 PM"></label>
      <label>Cadence rule (RRULE)<input name="cadence_rule" value="${o.cadence_rule || ""}" placeholder="FREQ=MONTHLY;BYDAY=2TU"></label>
    </div>
    <div class="a-grid-2">
      <label>Default venue <small>(used when a Meetup or Luma feed item names none)</small><input name="default_venue_name" value="${o.default_venue_name || ""}" maxlength="140" placeholder="HeatSync Labs"></label>
      <label>Default venue address<input name="default_venue_address" value="${o.default_venue_address || ""}" maxlength="200" placeholder="108 W Main St, Mesa, AZ 85201"></label>
    </div>
    <div class="a-grid-2">
      <label>Cost notes<input name="cost_notes" value="${o.cost_notes || ""}"></label>
      <label>CPE notes<input name="cpe_notes" value="${o.cpe_notes || ""}"></label>
    </div>
    <label>Notes <small>(private; add "padel-sponsor" to show a vendor on the Padel page)</small><textarea name="notes" rows="3">${o.notes || ""}</textarea></label>
    <label class="a-check"><input type="checkbox" name="trusted" value="1" ${o.trusted ? raw("checked") : ""}> Trusted organizer (submissions flagged for light review)</label>
    <div class="a-actions"><button class="a-btn a-btn-primary" name="action" value="save">Save</button>${!isNew ? html`<button class="a-btn a-btn-danger" name="action" value="delete" data-confirm="Delete this organizer? Events keep their rows but lose the link.">Delete</button><a class="a-btn a-btn-link" href="${orgPath(o.slug, o.default_city)}" target="_blank">Preview</a>` : ""}</div>
  </form>`;
}

export function tableHead(cols) { return html`<thead><tr>${cols.map((c) => html`<th>${c}</th>`)}</tr></thead>`; }
