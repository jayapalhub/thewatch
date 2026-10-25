import { html, page, raw, readForm, redirect, str } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { CITIES } from "../../_lib/constants.js";
import { fmtUtcLocal, mondayOf, todayKey } from "../../_lib/dates.js";
import { getAuth, tokenState, clientId, clientSecret, redirectUri, authorizeUrl, queuePost, sendQueued, previewPosts, runLinkedInSchedule, composeLaunchKit } from "../../_lib/linkedin.js";

// Admin > LinkedIn: connect the Better Security page once, see what Monday and Thursday will post, post now, pause.
export async function onRequestGet({ request, env, data }) {
  const db = env.DB;
  const msg = new URL(request.url).searchParams.get("msg");
  const auth = await getAuth(db);
  const state = tokenState(auth);
  const haveApp = !!(clientId(env, auth) && clientSecret(env, auth));
  const previews = await previewPosts(db, env);
  const { results: log } = await db.prepare("SELECT * FROM linkedin_posts ORDER BY id DESC LIMIT 40").all().catch(() => ({ results: [] }));
  const siteUrl = env.SITE_URL || "https://bettersecurity.ai";
  const kits = []; for (const c of Object.values(CITIES)) { const k = await composeLaunchKit(db, c.slug, siteUrl); if (k) kits.push({ city: c, ...k }); }
  const stateLine = state === "ok" ? html`<span class="a-pill a-pill-good">Connected</span> until ${fmtUtcLocal(auth.token_expires_at)}${auth.connected_by ? html` by ${auth.connected_by}` : ""}`
    : state === "expiring" ? html`<span class="a-pill a-pill-warn">Expires ${fmtUtcLocal(auth.token_expires_at)}</span> press Reconnect this week`
    : state === "expired" ? html`<span class="a-pill a-pill-warn">Expired</span> press Reconnect`
    : env.LINKEDIN_WEBHOOK_URL ? html`<span class="a-pill a-pill-good">Posting through the webhook</span>` : html`<span class="a-pill a-pill-warn">Not connected</span>`;
  const body = html`${flash(msg)}
  <p class="a-muted">The site posts to the Better Security LinkedIn page on its own: Monday 9 AM local, "This week in &lt;city&gt;" with three events and the calendar link. One post per city per week, never twice for the same week. Nothing posts until the page is connected below${auth && auth.paused ? ", and posting is paused right now" : ""}.</p>
  <h2>Connection</h2>
  <p>${stateLine}${auth && auth.paused ? html` <span class="a-pill a-pill-warn">Paused</span>` : ""}</p>
  <form method="post" class="a-inline">
    ${haveApp ? html`<button class="a-btn a-btn-primary" name="action" value="connect">${state === "none" ? "Connect the Better Security page" : "Reconnect"}</button>` : html`<span class="a-muted">Enter the app's Client ID and Client Secret below first.</span>`}
    ${auth ? html`<button class="a-btn" name="action" value="${auth.paused ? "resume" : "pause"}">${auth.paused ? "Resume posting" : "Pause posting"}</button>` : ""}
    <button class="a-btn" name="action" value="run">Run the schedule now</button>
  </form>
  <details ${haveApp ? "" : raw("open")}><summary>LinkedIn app details</summary>
  <form method="post" class="a-form">
    <p class="a-muted">From the app's Auth tab at linkedin.com/developers/apps. The Client Secret is stored in the database behind this admin, never shown again, and only used to finish the one time authorization. Add <code>${redirectUri(env)}</code> as an authorized redirect URL on that Auth tab. ${env.LINKEDIN_CLIENT_ID ? "A Client ID is also set as an environment variable and takes priority." : ""}</p>
    <div class="a-grid-2">
      <label>Client ID<input name="client_id" value="${(auth && auth.client_id) || ""}" maxlength="80" autocomplete="off"></label>
      <label>Client Secret <small>${auth && auth.client_secret ? "(set; leave blank to keep)" : ""}</small><input name="client_secret" type="password" maxlength="200" autocomplete="off"></label>
    </div>
    <label>Company page id <small>(the number in urn:li:organization:&lt;id&gt;; Better Security is 131373999)</small><input name="org_id" value="${(auth && auth.org_id) || ""}" maxlength="30"></label>
    <button class="a-btn" name="action" value="save_app">Save app details</button>
  </form></details>
  <h2>What would post today</h2>
  <p class="a-muted">Built live from the calendar, so this is exactly what the schedule would send. Copy a post to paste it by hand any time.</p>
  ${previews.map((p, i) => html`<div class="a-card">
    <div class="a-preview-bar"><strong>${p.city.name}: ${p.kind === "events" ? "This week (Monday)" : "Hiring (Thursday)"}</strong> <span class="a-muted">week of ${p.week_start}</span>
      ${p.post ? html`<button class="a-btn" type="button" data-copy-text="li-post-${i}" data-copy-label="Copy post">Copy post</button>
      <form method="post" class="a-inline"><input type="hidden" name="city" value="${p.city.slug}"><input type="hidden" name="kind" value="${p.kind}"><input type="hidden" name="week_start" value="${p.week_start}"><button class="a-btn a-btn-primary" name="action" value="post_now" data-confirm="Post this to the Better Security LinkedIn page now?">Post now</button></form>` : ""}</div>
    ${p.post ? html`<textarea id="li-post-${i}" rows="9" readonly style="width:100%;font:inherit;font-size:14px;">${p.post.text}</textarea>` : html`<p class="a-muted">Nothing to post: no ${p.kind === "events" ? "published events that week" : "live roles"} in ${p.city.name}.</p>`}
  </div>`)}
  <h2>Launch kit, one per city</h2>
  <p class="a-muted">For pasting by hand: a one time "is live" post for the Better Security page, a subscribe line for anywhere (an email signature, a chapter newsletter, a comment), and a short paragraph for a chapter leader who asks what The Watch is. Counts are live, so paste on the day you post. Nothing here posts itself.</p>
  ${kits.map((k, i) => html`<details class="a-card"><summary><strong>${k.city.name}</strong> <span class="a-muted">${k.events} events in the next ten weeks from ${k.organizers} organizers, ${k.jobs} live roles</span></summary>
    <div class="a-preview-bar"><strong>Launch post</strong> <button class="a-btn" type="button" data-copy-text="li-kit-post-${i}" data-copy-label="Copy post">Copy post</button></div>
    <textarea id="li-kit-post-${i}" rows="11" readonly style="width:100%;font:inherit;font-size:14px;">${k.post}</textarea>
    <div class="a-preview-bar"><strong>Subscribe line</strong> <button class="a-btn" type="button" data-copy-text="li-kit-line-${i}" data-copy-label="Copy line">Copy line</button></div>
    <textarea id="li-kit-line-${i}" rows="2" readonly style="width:100%;font:inherit;font-size:14px;">${k.line}</textarea>
    <div class="a-preview-bar"><strong>For an organizer who asks</strong> <button class="a-btn" type="button" data-copy-text="li-kit-org-${i}" data-copy-label="Copy paragraph">Copy paragraph</button></div>
    <textarea id="li-kit-org-${i}" rows="5" readonly style="width:100%;font:inherit;font-size:14px;">${k.organizer}</textarea>
  </details>`)}
  <h2>Post log</h2>
  ${log.length ? html`<table class="a-table"><thead><tr><th>When</th><th>City</th><th>Post</th><th>Week</th><th>Status</th></tr></thead><tbody>
  ${log.map((r) => html`<tr><td class="a-nowrap">${fmtUtcLocal(r.posted_at || r.created_at)}</td><td>${(CITIES[r.city] || {}).name || r.city}</td><td>${r.kind}</td><td>${r.week_start}</td><td><span class="a-pill ${r.status === "posted" ? "a-pill-good" : r.status === "failed" ? "a-pill-warn" : ""}">${r.status}</span>${r.error ? html` <small class="a-muted">${r.error}</small>` : ""}</td></tr>`)}
  </tbody></table>` : html`<p class="a-muted">Nothing posted yet.</p>`}`;
  return page(adminShell({ title: "LinkedIn page", body, path: "/admin/linkedin", user: data.user }));
}

export async function onRequestPost({ request, env, data }) {
  const db = env.DB;
  const p = await readForm(request);
  const action = str(p.action);
  const back = (m) => redirect("/admin/linkedin?msg=" + encodeURIComponent(m), 303);
  const auth = await getAuth(db);
  if (!auth) return back("The LinkedIn tables are missing; apply migration 0017.");
  if (action === "save_app") {
    const id = str(p.client_id, 80), secret = str(p.client_secret, 200), org = str(p.org_id, 30).replace(/\D/g, "");
    await db.prepare("UPDATE linkedin_auth SET client_id=COALESCE(NULLIF(?, ''), client_id), client_secret=COALESCE(NULLIF(?, ''), client_secret), org_id=COALESCE(NULLIF(?, ''), org_id), updated_at=datetime('now') WHERE id=1").bind(id, secret, org).run();
    return back("Saved. Now press Connect while signed in to LinkedIn as a page admin.");
  }
  if (action === "connect") {
    if (!clientId(env, auth) || !clientSecret(env, auth)) return back("Enter the Client ID and Client Secret first.");
    return redirect(await authorizeUrl(db, env, auth), 303);
  }
  if (action === "pause" || action === "resume") {
    await db.prepare("UPDATE linkedin_auth SET paused=?, updated_at=datetime('now') WHERE id=1").bind(action === "pause" ? 1 : 0).run();
    return back(action === "pause" ? "Posting paused. Queued posts stay queued." : "Posting resumed.");
  }
  if (action === "run") {
    const r = await runLinkedInSchedule(env);
    return back(`Schedule run: ${r.posted} posted, ${r.queued} queued, ${r.skipped} skipped, ${r.failed} failed (connection ${r.state}${r.paused ? ", paused" : ""}).`);
  }
  if (action === "post_now") {
    const city = CITIES[str(p.city)] ? str(p.city) : null, kind = str(p.kind) === "events" ? "events" : null;
    const week = /^\d{4}-\d{2}-\d{2}$/.test(str(p.week_start)) ? mondayOf(str(p.week_start)) : mondayOf(todayKey());
    if (!city || !kind) return back("Pick a city and a post.");
    const row = await queuePost(db, env, city, kind, week);
    if (!row) return back("Nothing to post for that city.");
    if (row.status === "posted") return back(`That post already went out ${fmtUtcLocal(row.posted_at)}.`);
    if (row.status === "failed") await db.prepare("UPDATE linkedin_posts SET status='queued', error=NULL WHERE id=?").bind(row.id).run();
    const r = await sendQueued(db, env, { ...row, status: "queued" }, auth);
    return back(r.posted ? `Posted to LinkedIn (${r.urn || "ok"}).` : r.failed ? `LinkedIn refused it: ${r.failed}` : `Not sent: ${r.skipped}. Connect the page first.`);
  }
  return back("Unknown action.");
}
