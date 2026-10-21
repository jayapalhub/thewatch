import { redirect } from "../../_lib/html.js";
import { mondayOf, addDays, todayKey } from "../../_lib/dates.js";
import { CITIES, DEFAULT_CITY } from "../../_lib/constants.js";
import { ensureIssue } from "../../_lib/dispatch.js";

// Creates (or opens) the draft for ?city= and the week starting on ?week=YYYY-MM-DD (a Monday).
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const city = CITIES[u.searchParams.get("city")] ? u.searchParams.get("city") : DEFAULT_CITY;
  const w = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get("week") || "") ? mondayOf(u.searchParams.get("week")) : addDays(mondayOf(todayKey()), 7);
  const issue = await ensureIssue(env.DB, city, w);
  return redirect(`/admin/issues/${issue.id}`);
}
