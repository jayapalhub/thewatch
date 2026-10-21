import { html, page, raw, readForm, redirect, str } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { runAllSources } from "../../_lib/feeds.js";

const KINDS = { brighttalk: "BrightTALK channel feed", ical: "iCal / ICS feed" };

export async function onRequestGet({ request, env, data }) {
  const msg = new URL(request.url).searchParams.get("msg");
  const { results: sources } = await env.DB.prepare("SELECT f.*, o.name org_name FROM feed_sources f LEFT JOIN organizations o ON o.id=f.organization_id ORDER BY f.active DESC, f.id").all();
  const { results: orgs } = await env.DB.prepare("SELECT id, name FROM organizations ORDER BY name").all();
  const { results: runs } = await env.DB.prepare("SELECT r.*, f.name FROM feed_runs r LEFT JOIN feed_sources f ON f.id=r.source_id ORDER BY r.id DESC LIMIT 20").all();
  const body = html`${flash(msg)}
  <p>Feeds are pulled automatically every Thursday morning and whenever you press the button. New sessions land in the <a href="/admin/review">review queue</a> as pending; nothing publishes on its own.</p>
  <form method="post" class="a-inline"><input type="hidden" name="action" value="pull"><button class="a-btn a-btn-primary">Pull all feeds now</button></form>
  <h2>Sources</h2>
  <table class="a-table"><thead><tr><th>Source</th><th>Kind</th><th>Calendar</th><th>Organizer</th><th>Last run</th><th></th></tr></thead><tbody>
  ${sources.map((s) => html`<tr class="${s.active ? "" : "a-dim"}">
    <td><strong>${s.name}</strong><br><small><a href="${s.url}" target="_blank" rel="noopener">${s.url.length > 70 ? s.url.slice(0, 70) + "…" : s.url}</a></small>${s.notes ? html`<br><small class="a-muted">${s.notes}</small>` : ""}</td>
    <td>${KINDS[s.kind] || s.kind}</td><td>${s.city}</td><td>${s.org_name || html`<span class="a-muted">none</span>`}</td>
    <td><small>${s.last_run_at ? html`${s.last_run_at}<br>${s.last_status || ""}` : html`<span class="a-muted">never</span>`}</small></td>
    <td><form method="post" class="a-inline"><input type="hidden" name="id" value="${s.id}">
      <button class="a-btn" name="action" value="pull_one">Pull</button>
      <button class="a-btn" name="action" value="toggle">${s.active ? "Pause" : "Resume"}</button>
      <button class="a-btn a-btn-danger" name="action" value="delete" onclick="return confirm('Remove this source?')">Remove</button></form></td>
  </tr>`)}</tbody></table>
  <h2>Add a source</h2>
  <form method="post" class="a-form"><input type="hidden" name="action" value="add">
    <div class="a-grid-2">
      <label>Name<input name="name" required maxlength="120" placeholder="ISACA San Diego (Meetup iCal)"></label>
      <label>Feed URL<input type="url" name="url" required maxlength="500" placeholder="https://www.meetup.com/<group>/events/ical/"></label>
    </div>
    <div class="a-grid-3">
      <label>Kind<select name="kind">${Object.entries(KINDS).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
      <label>Calendar<select name="city"><option value="virtual">Virtual</option><option value="sandiego">San Diego</option></select></label>
      <label>Organizer<select name="organization_id"><option value="">None (set per event)</option>${orgs.map((o) => html`<option value="${o.id}">${o.name}</option>`)}</select></label>
    </div>
    <div class="a-grid-3">
      <label>Default time zone <small>(for feeds without zone info)</small><input name="timezone" value="America/Los_Angeles"></label>
      <label>CPE by default<select name="cpe_default"><option value="0">No</option><option value="1">Yes, every session</option></select></label>
      <label>CPE body<select name="cpe_body"><option value="">Not set</option>${["ISACA", "ISC2", "IIA", "IAPP", "other", "self_reported"].map((b) => html`<option>${b}</option>`)}</select></label>
    </div>
    <label>Default topics <small>(comma separated: grc, audit, privacy, ai, cloud, appsec, identity, network, threat_intel, leadership, careers)</small><input name="topics" placeholder="threat_intel"></label>
    <label>Notes<input name="notes" maxlength="300"></label>
    <button class="a-btn a-btn-primary">Add source</button>
  </form>
  <h2>Recent runs</h2>
  ${runs.length ? html`<table class="a-table"><thead><tr><th>When</th><th>Source</th><th>Upcoming in feed</th><th>Added</th><th>Skipped</th><th>Error</th></tr></thead><tbody>
  ${runs.map((r) => html`<tr><td>${r.ran_at}</td><td>${r.name || r.source_id}</td><td>${r.fetched}</td><td>${r.added}</td><td>${r.skipped}</td><td class="a-warn">${r.error || ""}</td></tr>`)}</tbody></table>` : html`<p class="a-muted">No runs yet.</p>`}
  <h2>Finding feed URLs</h2>
  <ul class="a-steps">
    <li>BrightTALK: the channel number is in the channel URL; use <code>https://www.brighttalk.com/service/channel/v2/channel/NUMBER/feed?size=60&amp;page=1</code>.</li>
    <li>Meetup: <code>https://www.meetup.com/GROUP/events/ical/</code>.</li>
    <li>Eventbrite organizers and most WordPress event calendars offer an ICS or "subscribe to calendar" link; paste that.</li>
  </ul>`;
  return page(adminShell({ title: "Feeds", body, path: "/admin/feeds", user: data.user }));
}

export async function onRequestPost({ request, env }) {
  const p = await readForm(request); const action = str(p.action); const id = parseInt(str(p.id), 10) || null;
  if (action === "pull" || action === "pull_one") {
    const results = await runAllSources(env.DB, { onlyId: action === "pull_one" ? id : null });
    const added = results.reduce((a, r) => a + r.added, 0), errs = results.filter((r) => r.error).length;
    return redirect(`/admin/feeds?msg=${encodeURIComponent(`Pulled ${results.length} source${results.length === 1 ? "" : "s"}: ${added} new event${added === 1 ? "" : "s"} added to the review queue${errs ? `, ${errs} with errors` : ""}`)}`);
  }
  if (action === "toggle" && id) { await env.DB.prepare("UPDATE feed_sources SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?").bind(id).run(); return redirect("/admin/feeds?msg=Updated"); }
  if (action === "delete" && id) { await env.DB.prepare("DELETE FROM feed_sources WHERE id=?").bind(id).run(); return redirect("/admin/feeds?msg=Removed"); }
  if (action === "add") {
    const name = str(p.name, 120), url = str(p.url, 500), kind = KINDS[str(p.kind)] ? str(p.kind) : "ical";
    if (!name || !/^https?:\/\//i.test(url)) return redirect("/admin/feeds?msg=Name+and+a+valid+URL+are+required");
    const topics = str(p.topics, 200).split(",").map((t) => t.trim()).filter(Boolean);
    await env.DB.prepare("INSERT INTO feed_sources (name, kind, url, organization_id, city, timezone, cpe_default, cpe_body, topics, notes) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(name, kind, url, parseInt(str(p.organization_id), 10) || null, str(p.city) === "sandiego" ? "sandiego" : "virtual", str(p.timezone, 60) || "America/Los_Angeles",
        str(p.cpe_default) === "1" ? 1 : 0, str(p.cpe_body, 20) || null, JSON.stringify(topics), str(p.notes, 300) || null).run();
    return redirect("/admin/feeds?msg=Source+added.+Press+Pull+to+try+it.");
  }
  return redirect("/admin/feeds");
}
