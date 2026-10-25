import { html, page, raw, readForm, redirect, str } from "../_lib/html.js";
import { weeklyNumbers, renderNumbers, runMondayDigest } from "../_lib/digest.js";
import { adminShell, flash } from "../_lib/admin.js";
import { todayKey, addDays, mondayOf } from "../_lib/dates.js";

export async function onRequestGet({ request, env, data }) {
  const db = env.DB; const today = todayKey();
  const msg = new URL(request.url).searchParams.get("msg");
  const q = (sql, ...a) => db.prepare(sql).bind(...a).first();
  const [pending, published, subs, newSubs, sponsors, interest, clicks] = await Promise.all([
    q("SELECT COUNT(*) n FROM events WHERE status='pending_review'"),
    q("SELECT COUNT(*) n FROM events WHERE status='published' AND start_at >= ?", today),
    q("SELECT COUNT(*) n FROM subscribers WHERE status='active'"),
    q("SELECT COUNT(*) n FROM subscribers WHERE created_at >= ?", addDays(today, -7)),
    q("SELECT COUNT(*) n FROM sponsor_inquiries WHERE status='new'"),
    q("SELECT COUNT(*) n FROM event_interest"),
    q("SELECT COUNT(*) n FROM link_clicks WHERE clicked_at >= ? AND is_bot=0 AND is_dup=0", addDays(today, -7)),
  ]);
  const { results: thin } = await db.prepare("SELECT substr(start_at,1,10) d, COUNT(*) n FROM events WHERE status='published' AND start_at >= ? GROUP BY d ORDER BY d LIMIT 14").bind(today).all();
  const nextMonday = addDays(mondayOf(today), 7);
  const numbers = await weeklyNumbers(db).catch(() => null);
  const body = html`${flash(msg)}
  <div class="a-cards">
    <a class="a-card" href="/admin/review"><span class="a-num">${pending.n}</span>awaiting review</a>
    <a class="a-card" href="/admin/events"><span class="a-num">${published.n}</span>published upcoming</a>
    <a class="a-card" href="/admin/people"><span class="a-num">${subs.n}</span>active subscribers <small>+${newSubs.n} this week</small></a>
    <a class="a-card" href="/admin/sponsors"><span class="a-num">${sponsors.n}</span>new sponsor inquiries</a>
    <a class="a-card" href="/admin/people?interest=1"><span class="a-num">${interest.n}</span>event interest sign ups</a>
    <a class="a-card" href="/admin/clicks"><span class="a-num">${clicks.n}</span>link clicks this week <small>people only</small></a>
  </div>
  ${numbers ? html`<h2>This week's numbers</h2><p class="a-muted">The same block goes to your inbox every Monday at 8 AM. <form method="post" class="a-inline"><button class="a-btn a-btn-small" name="action" value="send_numbers">Send it to me now</button></form></p><div class="a-card">${raw(renderNumbers(numbers))}</div>` : ""}
  <h2>The weekend runs itself</h2>
  <ol class="a-steps">
    <li>Saturday 7:10 AM: the note, subject and picks for each city's issue are drafted into the database if you have not written them.</li>
    <li>Saturday 8 AM: the preview lands in your inbox. <a href="/admin/issues/new?week=${nextMonday}">Open next week's issue</a> any time to change the note, picks or subject, or to cancel the send.</li>
    <li>Sunday 8 AM local: each city's email goes out on its own. Events publish themselves 24 hours after they appear unless you <a href="/admin/review">hold or reject</a> them; the review queue says how many need you.</li>
  </ol>
  <h2>Published events by day (next two weeks)</h2>
  ${thin.length ? html`<table class="a-table"><thead><tr><th>Date</th><th>Events</th></tr></thead><tbody>${thin.map((r) => html`<tr><td>${r.d}</td><td>${r.n}</td></tr>`)}</tbody></table>` : html`<p class="a-muted">Nothing published yet. Seed the research backlog or add events.</p>`}
  <p><a class="a-btn a-btn-primary" href="/admin/events/new">Add an event</a> <a class="a-btn" href="/admin/organizations/new">Add an organizer</a></p>`;
  return page(adminShell({ title: "Overview", body, path: "/admin", user: data.user }));
}

export async function onRequestPost({ request, env }) {
  const p = await readForm(request);
  if (str(p.action) === "send_numbers") {
    const r = await runMondayDigest(env, { force: true });
    return redirect("/admin?msg=" + encodeURIComponent(r.sent ? "Sent to your inbox." : "Could not send: " + (r.error || r.skipped || "unknown")), 303);
  }
  return redirect("/admin", 303);
}
