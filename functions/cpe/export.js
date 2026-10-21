import { eventPath } from "../_lib/constants.js";
import { tokenFromCookie, subscriberByToken, logEntries, csvCell } from "../_lib/cpe.js";

// CSV of the private log: /cpe/export?t=<token>[&year=2026]
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const sub = await subscriberByToken(env.DB, (u.searchParams.get("t") || "").slice(0, 64) || tokenFromCookie(request));
  if (!sub) return new Response("Not found", { status: 404 });
  const year = /^\d{4}$/.test(u.searchParams.get("year") || "") ? u.searchParams.get("year") : "";
  const site = env.SITE_URL || "https://bettersecurity.ai";
  const rows = (await logEntries(env.DB, sub.id)).filter((r) => !year || r.start_at.startsWith(year)).reverse();
  const lines = [["Date", "Event", "Organizer", "CPE body", "Hours", "Organizer reported hours", "Event page"].join(",")]
    .concat(rows.map((r) => [r.start_at.slice(0, 10), r.title, r.org_name, r.cpe_body, r.hours, r.cpe_eligible ? r.cpe_hours : "", `${site}${eventPath(r)}`].map(csvCell).join(",")));
  const total = rows.reduce((a, r) => a + (r.hours || 0), 0);
  lines.push(["", "Total", "", "", total, "", ""].map(csvCell).join(","));
  return new Response(lines.join("\r\n") + "\r\n", { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="the-watch-cpe-${year || "all"}.csv"`,
    "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex",
  } });
}
