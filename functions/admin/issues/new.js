import { redirect } from "../../_lib/html.js";
import { mondayOf, addDays, todayKey } from "../../_lib/dates.js";

// Creates (or opens) the draft for the week starting on ?week=YYYY-MM-DD (a Monday).
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const w = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get("week") || "") ? mondayOf(u.searchParams.get("week")) : addDays(mondayOf(todayKey()), 7);
  const existing = await env.DB.prepare("SELECT id FROM issues WHERE week_start=? AND city='sandiego'").bind(w).first();
  if (existing) return redirect(`/admin/issues/${existing.id}`);
  const last = await env.DB.prepare("SELECT MAX(issue_number) n FROM issues").first();
  const sendAt = addDays(w, -1) + "T17:00"; // the Sunday before, 5 PM
  const r = await env.DB.prepare("INSERT INTO issues (issue_number, city, week_start, week_end, send_at, status) VALUES (?,?,?,?,?,?)")
    .bind((last.n || 0) + 1, "sandiego", w, addDays(w, 6), sendAt, "draft").run();
  return redirect(`/admin/issues/${r.meta.last_row_id}?msg=Draft+created`);
}
