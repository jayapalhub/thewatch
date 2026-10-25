import { html, page } from "../../_lib/html.js";
import { adminShell } from "../../_lib/admin.js";
import { coverageRows, coverageTotal, coverageHistory, needsPerson, boardName, READY_AT, GROWING_AT, HISTORY_DAYS, SMALL_EMPLOYER, sparkline } from "../../_lib/coverage.js";

// Admin > Jobs > Coverage: how close each board is to the threshold for showing only roles named by someone at the
// employer (15 named roles live at once, held for several weeks), the daily trend, and the roles that still need a person.
// Four queries in all: the grouped counts, the snapshot history, and the two behind the queue.
export async function onRequestGet({ env, data }) {
  const [rows, history, queue] = await Promise.all([coverageRows(env.DB), coverageHistory(env.DB), needsPerson(env.DB)]);
  const total = coverageTotal(rows);
  const pill = (s) => html`<span class="a-pill ${s === "Ready to consider" ? "a-pill-good" : s === "Growing" ? "a-pill-warn" : ""}">${s}</span>`;
  const body = html`
  <p class="a-muted">A board is ready to consider showing named roles only once ${READY_AT} or more roles live at the same time were posted about by someone at the employer, and stays there for several weeks. Below ${GROWING_AT} it is early; in between it is growing. Roles expire after 30 days, so the count has to be fed every week. The snapshot is taken once a day by the hourly run; the trend shows the last ${HISTORY_DAYS} days of named roles. <a href="/admin/jobs">Back to jobs</a>.</p>
  <table class="a-table"><thead><tr><th>Board</th><th>Live roles</th><th>Named</th><th>Named %</th><th>Named added, 7 days</th><th>Status</th><th>Last ${HISTORY_DAYS} days, named</th></tr></thead><tbody>
    ${rows.map((r) => html`<tr><td><strong>${boardName(r.city)}</strong></td><td>${r.total}</td><td><strong>${r.named}</strong></td><td>${r.percent}%</td><td>${r.recent}</td><td>${pill(r.status)}</td><td>${sparkline(history[r.city])}</td></tr>`)}
    <tr class="a-total"><td><strong>All boards</strong></td><td><strong>${total.total}</strong></td><td><strong>${total.named}</strong></td><td>${total.percent}%</td><td>${total.recent}</td><td></td><td></td></tr>
  </tbody></table>
  <p class="a-muted">Named added, 7 days counts live roles whose person was attached in the last seven days, whenever the role itself went live. Until migration 0031 is applied it counts named roles that went live this week instead.</p>
  <h2>Needs a person</h2>
  <p class="a-muted">The ${queue.length} newest live roles with nobody named, from employers with fewer than ${SMALL_EMPLOYER} live roles on the board, newest first. This is the list the weekday LinkedIn search works from; it is also at <code>/api/jobs/needs-person</code> for scripts, with the admin token.</p>
  ${queue.length ? html`<table class="a-table"><thead><tr><th>City</th><th>Employer</th><th>Role</th><th>Live for</th><th></th></tr></thead><tbody>
    ${queue.map((j) => html`<tr><td>${j.city_name}</td><td>${j.employer}<br><small class="a-muted">${j.employer_live_roles} live role${j.employer_live_roles === 1 ? "" : "s"}</small></td><td><a href="/admin/jobs/${j.id}"><strong>${j.title}</strong></a></td><td>${j.live_days === null ? "" : j.live_days === 0 ? "today" : `${j.live_days} day${j.live_days === 1 ? "" : "s"}`}</td><td><a href="${j.page}" target="_blank" rel="noopener">Role page</a> · <a href="${j.posting_url}" target="_blank" rel="noopener">Posting</a></td></tr>`)}
  </tbody></table>` : html`<p class="a-muted">Every live role from a smaller employer has a person named. Nothing to look for today.</p>`}`;
  return page(adminShell({ title: "Named role coverage", body, path: "/admin/jobs", user: data.user }));
}
