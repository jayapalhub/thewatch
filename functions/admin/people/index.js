import { html, page, raw, list } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { TOPICS, SENIORITY, BS_EVENT_KEYS } from "../../_lib/constants.js";

function csvCell(v) { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

export async function onRequestGet({ request, env, data }) {
  const u = new URL(request.url);
  const f = {
    q: (u.searchParams.get("q") || "").slice(0, 80),
    seniority: SENIORITY[u.searchParams.get("seniority")] ? u.searchParams.get("seniority") : "",
    interest: TOPICS[u.searchParams.get("topic")] ? u.searchParams.get("topic") : "",
    tag: (u.searchParams.get("tag") || "").slice(0, 40),
    status: ["active", "unsubscribed", "pending", "bounced"].includes(u.searchParams.get("status")) ? u.searchParams.get("status") : "",
    event: BS_EVENT_KEYS[u.searchParams.get("event")] ? u.searchParams.get("event") : "",
    ref: u.searchParams.get("ref") === "1" ? "1" : "",
  };
  const where = []; const args = [];
  if (f.q) { where.push("(s.email LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ? OR s.company LIKE ? OR s.role_title LIKE ?)"); for (let i = 0; i < 5; i++) args.push(`%${f.q}%`); }
  if (f.seniority) { where.push("s.seniority=?"); args.push(f.seniority); }
  if (f.interest) { where.push("s.interests LIKE ?"); args.push(`%"${f.interest}"%`); }
  if (f.tag) { where.push("s.tags LIKE ?"); args.push(`%"${f.tag}"%`); }
  if (f.status) { where.push("s.status=?"); args.push(f.status); }
  if (f.event) { where.push("EXISTS (SELECT 1 FROM event_interest ei WHERE ei.subscriber_id=s.id AND ei.event_key=?)"); args.push(f.event); }
  if (f.ref) where.push("EXISTS (SELECT 1 FROM subscribers r WHERE r.referred_by=s.id)");
  // Referrals count active subscribers who joined through this person's /r/ link (the number the thank you emails use).
  const sql = `SELECT s.*, (SELECT GROUP_CONCAT(event_key, ', ') FROM event_interest ei WHERE ei.subscriber_id=s.id) interest_keys,
    (SELECT COUNT(*) FROM subscribers r WHERE r.referred_by=s.id AND r.status='active') referrals,
    (SELECT x.email FROM subscribers x WHERE x.id=s.referred_by) referred_by_email
    FROM subscribers s ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${f.ref ? "referrals DESC, " : ""}s.created_at DESC LIMIT 2000`;
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  const totals = await env.DB.prepare("SELECT COUNT(*) n, COUNT(DISTINCT referred_by) people FROM subscribers WHERE referred_by IS NOT NULL AND status='active'").first();

  if (u.searchParams.get("format") === "csv") {
    const cols = ["email", "status", "first_name", "last_name", "company", "role_title", "seniority", "interests", "tags", "interest_keys", "source", "consented_at", "profile_completed_at", "linkedin_url", "referrals", "referred_by_email", "referral_thanked_level", "created_at"];
    const rows = [cols.join(",")].concat(results.map((r) => cols.map((c) => csvCell(c === "interests" || c === "tags" ? list(r[c]).join("; ") : r[c])).join(",")));
    return new Response(rows.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="watch-people-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  const csvUrl = "/admin/people?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), format: "csv" }).toString();
  const body = html`${flash(u.searchParams.get("msg"))}
  <form class="a-toolbar" method="get">
    <input type="search" name="q" value="${f.q}" placeholder="Email, name, company, role">
    <select name="seniority"><option value="">Any seniority</option>${Object.entries(SENIORITY).map(([k, v]) => html`<option value="${k}" ${f.seniority === k ? raw("selected") : ""}>${v}</option>`)}</select>
    <select name="topic"><option value="">Any interest</option>${Object.entries(TOPICS).map(([k, v]) => html`<option value="${k}" ${f.interest === k ? raw("selected") : ""}>${v}</option>`)}</select>
    <select name="event"><option value="">Any event interest</option>${Object.entries(BS_EVENT_KEYS).map(([k, v]) => html`<option value="${k}" ${f.event === k ? raw("selected") : ""}>${v}</option>`)}</select>
    <input name="tag" value="${f.tag}" placeholder="tag (sponsor_lead, organizer)">
    <label class="a-check"><input type="checkbox" name="ref" value="1" ${f.ref ? raw("checked") : ""}> Has referred someone</label>
    <select name="status"><option value="">Any status</option>${["active", "unsubscribed", "pending", "bounced"].map((s) => html`<option ${f.status === s ? raw("selected") : ""}>${s}</option>`)}</select>
    <button class="a-btn">Filter</button>
    <a class="a-btn a-btn-primary" href="${csvUrl}">Export CSV (${results.length})</a>
  </form>
  <table class="a-table"><thead><tr><th>Email</th><th>Name</th><th>Company / role</th><th>Seniority</th><th>Interests</th><th>Tags</th><th>Events</th><th>Referrals</th><th>Joined</th></tr></thead><tbody>
  ${results.map((s) => html`<tr class="${s.status !== "active" ? "a-dim" : ""}"><td>${s.email}<br><small>${s.status} &middot; ${s.source || ""}</small></td><td>${[s.first_name, s.last_name].filter(Boolean).join(" ")}</td><td>${s.company || ""}<br><small>${s.role_title || ""}</small></td><td>${SENIORITY[s.seniority] || ""}</td><td><small>${list(s.interests).map((k) => TOPICS[k] || k).join(", ")}</small></td><td><small>${list(s.tags).join(", ")}</small></td><td><small>${s.interest_keys || ""}</small></td><td class="a-nowrap">${s.referrals ? html`<strong>${s.referrals}</strong>${s.referral_thanked_level ? html`<br><small>thanked at ${s.referral_thanked_level}</small>` : ""}` : ""}</td><td class="a-nowrap"><small>${(s.created_at || "").slice(0, 10)}${s.referred_by_email ? html`<br>via ${s.referred_by_email}` : ""}</small></td></tr>`)}
  </tbody></table>
  <p class="a-muted">${totals.n ? `${totals.n} active subscriber${totals.n === 1 ? "" : "s"} joined through the share links of ${totals.people} ${totals.people === 1 ? "person" : "people"}. Thank you emails go out automatically at 3 and at 10. ` : "Nobody has joined through a share link yet. "}Showing ${results.length}. Filter down to the room you want (for example seniority: Director or VP, interest: Identity) and export the CSV for a dinner invite list.</p>`;
  return page(adminShell({ title: "People", body, path: "/admin/people", user: data.user }));
}
