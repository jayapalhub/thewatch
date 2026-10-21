// Standing sponsor slot. One sponsor shows at a time per placement; if several are live, they rotate
// (by day on the calendar page, by issue in the email) so each gets a fair share.
import { todayKey } from "./dates.js";
import { cityOf } from "./constants.js";

export const PLACEMENTS = { both: "Calendar page and Sunday email", page: "Calendar page only", email: "Sunday email only" };

// Live sponsors for a city and placement on a given local date (YYYY-MM-DD).
export async function liveSponsors(db, city, placement, date) {
  try {
    const { results } = await db.prepare(
      `SELECT * FROM sponsors WHERE active = 1 AND (city IS NULL OR city = ?) AND placement IN (?, 'both')
         AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?) ORDER BY id`
    ).bind(city, placement, date, date).all();
    return results;
  } catch { return []; } // table missing before the migration: show nothing
}

export async function pageSponsor(db, citySlug) {
  const c = cityOf(citySlug);
  const day = todayKey(c && c.timezone);
  const list = await liveSponsors(db, citySlug, "page", day);
  if (!list.length) return null;
  const n = Math.floor(Date.parse(day + "T00:00:00Z") / 86400000);
  return list[n % list.length];
}

export async function emailSponsor(db, issue) {
  const date = (issue.send_at || issue.week_start || "").slice(0, 10);
  const list = await liveSponsors(db, issue.city || "sandiego", "email", date);
  if (!list.length) return null;
  return list[(issue.issue_number || issue.id || 0) % list.length];
}

export function sponsorStatus(s, today) {
  if (!s.active) return "Paused";
  if (s.starts_at && s.starts_at > today) return "Scheduled";
  if (s.ends_at && s.ends_at < today) return "Ended";
  return "Live";
}

export function absUrl(siteUrl, u) { return !u ? "" : u.startsWith("/") ? siteUrl + u : u; }
export function clickUrl(siteUrl, s, placement, { city, issueId } = {}) {
  const q = new URLSearchParams({ p: placement }); if (city) q.set("c", city); if (issueId) q.set("i", issueId);
  return `${siteUrl}/go/s/${s.id}?${q}`;
}
