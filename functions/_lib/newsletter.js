import { esc } from "./html.js";
import { queryEvents, groupByDay, costLabel, cpeLabel } from "./events.js";
import { fmtTimeRange, weekday, monthName, dayNum, addDays, parts } from "./dates.js";
import { TOPICS, MAIL_ADDRESS } from "./constants.js";

// Builds the email body for an issue. Inline styles only, because Beehiiv's
// editor and email clients ignore stylesheets. Links go through /go so clicks count.
const INK = "#0E1B2E", MUTED = "#5B6B80", SHIELD = "#1B4A8A", ELECTRIC = "#1FB6F0", NAVY = "#071426", MIST = "#DCE4EE", PAPER = "#F4F7FB";

export async function loadIssueData(db, issue) {
  const from = issue.week_start + "T00:00", to = addDays(issue.week_end, 1) + "T00:00";
  const events = await queryEvents(db, { city: issue.city || "sandiego", from, to, limit: 200 });
  const soonFrom = addDays(issue.week_end, 1) + "T00:00", soonTo = addDays(issue.week_end, 22) + "T00:00";
  const soon = (await queryEvents(db, { city: issue.city || "sandiego", from: soonFrom, to: soonTo, limit: 200 })).filter((e) => e.is_better_security_event || e.is_featured || e.cost_type === "paid" || e.audience_level === "senior");
  const bs = (await queryEvents(db, { city: issue.city || "sandiego", from: issue.week_start + "T00:00", limit: 50 })).filter((e) => e.is_better_security_event);
  let featuredIds = []; try { featuredIds = JSON.parse(issue.featured_event_ids || "[]"); } catch {}
  const featured = events.filter((e) => featuredIds.includes(e.id));
  return { events, soon, bs, featured };
}

function go(siteUrl, e, t, issueId) { return `${siteUrl}/go/${e.id}?t=${t}&i=${issueId || ""}`; }

function eventLine(e, siteUrl, issueId) {
  const meta = [fmtTimeRange(e.start_at, e.end_at), e.org_display, e.format === "virtual" ? "Online" : e.venue_display].filter(Boolean).join(" · ");
  const bits = [];
  const cost = costLabel(e); if (cost && e.cost_type !== "unknown") bits.push(cost);
  const cpe = cpeLabel(e); if (cpe) bits.push(cpe);
  if (e.discount_code) bits.push(`Subscriber code <b>${esc(e.discount_code)}</b>`);
  return `<tr><td style="padding:8px 0 10px;border-bottom:1px solid ${MIST};">
    <a href="${go(siteUrl, e, "page", issueId)}" style="color:${INK};font-weight:700;text-decoration:none;font-size:15px;">${esc(e.title)}</a>${e.is_better_security_event ? ` <span style="background:${ELECTRIC};color:${NAVY};font-size:11px;font-weight:700;padding:2px 7px;border-radius:999px;">Better Security</span>` : ""}
    <div style="color:${MUTED};font-size:13px;margin-top:2px;">${esc(meta)}${bits.length ? ` · ${bits.join(" · ")}` : ""}</div>
    ${e.description_short ? `<div style="font-size:14px;margin-top:3px;">${esc(e.description_short)}</div>` : ""}
    ${e.registration_url ? `<div style="margin-top:4px;"><a href="${go(siteUrl, e, "register", issueId)}" style="color:${SHIELD};font-size:13px;font-weight:700;">Register</a></div>` : ""}
  </td></tr>`;
}

function dayBlock(key, evs, siteUrl, issueId) {
  return `<tr><td style="padding:18px 0 4px;"><span style="font-size:22px;font-weight:800;color:${SHIELD};">${dayNum(key)}</span> <span style="font-weight:700;">${weekday(key)}</span> <span style="color:${MUTED};font-size:13px;">${monthName(key)}</span></td></tr>
  <tr><td><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${evs.map((e) => eventLine(e, siteUrl, issueId)).join("")}</table></td></tr>`;
}

export function renderIssueHtml(issue, data, siteUrl) {
  const { events, soon, bs, featured } = data;
  const note = (issue.personal_note || "").trim().split(/\n{2,}/).filter(Boolean).map((p) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const ws = parts(issue.week_start), we = parts(issue.week_end);
  const range = ws.mo === we.mo ? `${monthName(issue.week_start)} ${ws.d} to ${we.d}` : `${monthName(issue.week_start)} ${ws.d} to ${monthName(issue.week_end)} ${we.d}`;
  const days = groupByDay(events);
  const totalBs = bs.filter((e) => !events.find((x) => x.id === e.id));

  return `<div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:${INK};">
  <div style="font-size:13px;color:${MUTED};margin:0 0 14px;">The week of ${range} · ${events.length} event${events.length === 1 ? "" : "s"} in San Diego</div>
  ${note ? `<div style="margin:0 0 18px;">${note}</div>` : ""}
  ${featured.length ? `<div style="background:${PAPER};border-left:4px solid ${ELECTRIC};padding:12px 16px;border-radius:8px;margin:0 0 18px;">
    <div style="font-weight:800;font-size:13px;color:${SHIELD};margin-bottom:4px;">Worth your evening</div>
    ${featured.map((e) => `<div style="margin:6px 0;"><a href="${go(siteUrl, e, "page", issue.id)}" style="color:${INK};font-weight:700;text-decoration:none;">${esc(e.title)}</a> <span style="color:${MUTED};font-size:13px;">${esc(weekday(e.start_at))} ${esc(fmtTimeRange(e.start_at, e.end_at))}${e.org_display ? " · " + esc(e.org_display) : ""}</span></div>`).join("")}
  </div>` : ""}
  ${issue.sponsor_name ? `<div style="border:1px solid ${MIST};border-radius:8px;padding:12px 16px;margin:0 0 18px;">
    <div style="font-size:11px;font-weight:700;color:${MUTED};margin-bottom:6px;">Sponsored by ${esc(issue.sponsor_name)}</div>
    ${issue.sponsor_logo_url ? `<img src="${esc(issue.sponsor_logo_url)}" alt="${esc(issue.sponsor_name)}" style="height:36px;width:auto;display:block;margin-bottom:8px;">` : ""}
    <div style="font-size:14px;line-height:1.55;">${esc(issue.sponsor_copy || "")}</div>
    ${issue.sponsor_url ? `<div style="margin-top:6px;"><a href="${esc(issue.sponsor_url)}" style="color:${SHIELD};font-weight:700;font-size:13px;">Learn more</a></div>` : ""}
  </div>` : ""}
  <div style="font-size:18px;font-weight:800;margin:6px 0 0;">This week</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    ${days.length ? days.map((g) => dayBlock(g.key, g.events, siteUrl, issue.id)).join("") : `<tr><td style="padding:12px 0;color:${MUTED};">A quiet week. Use it to plan the next one below.</td></tr>`}
  </table>
  ${totalBs.length ? `<div style="background:${NAVY};color:#fff;border-radius:10px;padding:16px 18px;margin:22px 0 0;">
    <div style="font-size:11px;font-weight:700;color:${ELECTRIC};margin-bottom:6px;">From Better Security</div>
    ${totalBs.map((e) => `<div style="margin:0 0 8px;"><a href="${go(siteUrl, e, "page", issue.id)}" style="color:#fff;font-weight:700;text-decoration:none;font-size:15px;">${esc(e.title)}</a><div style="color:rgba(255,255,255,.75);font-size:13px;">${esc(weekday(e.start_at))}, ${esc(monthName(e.start_at))} ${dayNum(e.start_at)}${e.venue_display ? " · " + esc(e.venue_display) : ""}${costLabel(e) && e.cost_type !== "unknown" ? " · " + esc(costLabel(e)) : ""}</div></div>`).join("")}
  </div>` : ""}
  ${soon.length ? `<div style="font-size:16px;font-weight:800;margin:24px 0 4px;">Coming up, register early</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${soon.slice(0, 8).map((e) => `<tr><td style="padding:6px 0;border-bottom:1px solid ${MIST};font-size:14px;"><span style="color:${MUTED};">${esc(monthName(e.start_at)).slice(0, 3)} ${dayNum(e.start_at)}</span> &nbsp;<a href="${go(siteUrl, e, "page", issue.id)}" style="color:${INK};font-weight:700;text-decoration:none;">${esc(e.title)}</a>${e.org_display ? ` <span style="color:${MUTED};">· ${esc(e.org_display)}</span>` : ""}</td></tr>`).join("")}</table>` : ""}
  <div style="margin:26px 0 0;padding-top:14px;border-top:1px solid ${MIST};font-size:13px;color:${MUTED};line-height:1.6;">
    Know an event that should be here? <a href="${siteUrl}/submit" style="color:${SHIELD};">Submit it</a>. Want to reach this list? <a href="${siteUrl}/sponsor" style="color:${SHIELD};">Sponsor an issue</a>. Full calendar at <a href="${siteUrl}/sandiego" style="color:${SHIELD};">bettersecurity.ai/sandiego</a>.<br>
    The Watch San Diego is published by Better Security, ${esc(MAIL_ADDRESS)}.
  </div>
</div>`;
}

export function suggestSubjects(data, issue) {
  const { events, featured } = data;
  const n = events.length;
  const out = [];
  if (featured[0]) out.push(`${featured[0].title}, plus ${Math.max(n - 1, 0)} more this week`);
  const orgs = Array.from(new Set(events.map((e) => e.org_display).filter(Boolean))).slice(0, 3);
  if (orgs.length) out.push(`This week: ${orgs.join(", ")}${n > orgs.length ? " and more" : ""}`);
  const cpe = events.filter((e) => e.cpe_eligible).length;
  out.push(cpe ? `${n} San Diego security events this week, ${cpe} with CPE` : `${n} San Diego security events this week`);
  const ws = parts(issue.week_start);
  out.push(`The Watch: week of ${monthName(issue.week_start)} ${ws.d}`);
  return out;
}
