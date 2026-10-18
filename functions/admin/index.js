import { html, page } from "../_lib/html.js";
import { adminShell } from "../_lib/admin.js";
import { todayKey, addDays, mondayOf } from "../_lib/dates.js";

export async function onRequestGet({ env, data }) {
  const db = env.DB; const today = todayKey();
  const q = (sql, ...a) => db.prepare(sql).bind(...a).first();
  const [pending, published, subs, newSubs, sponsors, interest, clicks] = await Promise.all([
    q("SELECT COUNT(*) n FROM events WHERE status='pending_review'"),
    q("SELECT COUNT(*) n FROM events WHERE status='published' AND start_at >= ?", today),
    q("SELECT COUNT(*) n FROM subscribers WHERE status='active'"),
    q("SELECT COUNT(*) n FROM subscribers WHERE created_at >= ?", addDays(today, -7)),
    q("SELECT COUNT(*) n FROM sponsor_inquiries WHERE status='new'"),
    q("SELECT COUNT(*) n FROM event_interest"),
    q("SELECT COUNT(*) n FROM link_clicks WHERE clicked_at >= ?", addDays(today, -7)),
  ]);
  const { results: thin } = await db.prepare("SELECT substr(start_at,1,10) d, COUNT(*) n FROM events WHERE status='published' AND start_at >= ? GROUP BY d ORDER BY d LIMIT 14").bind(today).all();
  const nextMonday = addDays(mondayOf(today), 7);
  const body = html`
  <div class="a-cards">
    <a class="a-card" href="/admin/review"><span class="a-num">${pending.n}</span>awaiting review</a>
    <a class="a-card" href="/admin/events"><span class="a-num">${published.n}</span>published upcoming</a>
    <a class="a-card" href="/admin/people"><span class="a-num">${subs.n}</span>active subscribers <small>+${newSubs.n} this week</small></a>
    <a class="a-card" href="/admin/sponsors"><span class="a-num">${sponsors.n}</span>new sponsor inquiries</a>
    <a class="a-card" href="/admin/people?interest=1"><span class="a-num">${interest.n}</span>event interest sign ups</a>
    <a class="a-card" href="/admin/issues"><span class="a-num">${clicks.n}</span>link clicks this week</a>
  </div>
  <h2>Sunday checklist</h2>
  <ol class="a-steps">
    <li><a href="/admin/review">Clear the review queue</a> (approve, edit or reject anything pending).</li>
    <li><a href="/admin/issues/new?week=${nextMonday}">Open next week's issue</a>, pick one or two featured events, write the note.</li>
    <li>Copy the rendered issue into a new Beehiiv post, check it on your phone, schedule for Sunday 5:00 PM.</li>
    <li>Mark the issue as pasted so clicks are attributed correctly.</li>
  </ol>
  <h2>Published events by day (next two weeks)</h2>
  ${thin.length ? html`<table class="a-table"><thead><tr><th>Date</th><th>Events</th></tr></thead><tbody>${thin.map((r) => html`<tr><td>${r.d}</td><td>${r.n}</td></tr>`)}</tbody></table>` : html`<p class="a-muted">Nothing published yet. Seed the research backlog or add events.</p>`}
  <p><a class="a-btn a-btn-primary" href="/admin/events/new">Add an event</a> <a class="a-btn" href="/admin/organizations/new">Add an organizer</a></p>`;
  return page(adminShell({ title: "Overview", body, path: "/admin", user: data.user }));
}
