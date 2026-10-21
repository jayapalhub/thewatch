import { CITIES } from "../../../_lib/constants.js";
import { issueCard, render } from "../../../_lib/og.js";

export async function onRequestGet({ params, env, request, waitUntil }) {
  const city = CITIES[params.city]; const week = String(params.week).replace(/\.png$/, "");
  if (!city || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return new Response("Not found", { status: 404 });
  const issue = await env.DB.prepare("SELECT * FROM issues WHERE city=? AND week_start=?").bind(city.slug, week).first();
  if (!issue) return new Response("Not found", { status: 404 });
  const { n } = await env.DB.prepare("SELECT COUNT(*) n FROM events WHERE status='published' AND city=? AND start_at >= ? AND start_at < date(?, '+1 day')").bind(city.slug, issue.week_start + "T00:00", issue.week_end).first();
  return render(request, await issueCard(issue, city, n), waitUntil);
}
