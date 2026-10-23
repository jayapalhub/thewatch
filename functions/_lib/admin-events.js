import { str, list, slugify } from "./html.js";
import { TOPICS, DEFAULT_CITY, cityOf, cityTz, eventPath } from "./constants.js";
import { sendEmail, emailShell } from "./integrations.js";
import { toUtc } from "./dates.js";

const num = (v) => { const s = str(v); if (s === "") return null; const n = parseFloat(s); return Number.isFinite(n) ? n : null; };

// Parse the admin event form into a row. Returns { row, error }.
export function parseEventForm(p) {
  const title = str(p.title, 140);
  const date = str(p.date, 10), st = str(p.start_time, 5), et = str(p.end_time, 5);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(st)) return { error: "Title, date and start time are required." };
  const cpe = str(p.cpe_eligible);
  const row = {
    title,
    slug: str(p.slug, 90) ? slugify(str(p.slug, 90)) : `${slugify(title)}-${date}`,
    organization_id: num(p.organization_id),
    venue_id: num(p.venue_id),
    venue_name: str(p.venue_name, 120) || null,
    venue_address: str(p.venue_address, 200) || null,
    start_at: `${date}T${st}:00`,
    end_at: /^\d{2}:\d{2}$/.test(et) ? `${date}T${et}:00` : null,
    format: ["in_person", "virtual", "hybrid"].includes(str(p.format)) ? str(p.format) : "in_person",
    description_short: str(p.description_short, 200) || null,
    description_long: str(p.description_long, 8000) || null,
    registration_url: str(p.registration_url, 500) || null,
    source_url: str(p.source_url, 500) || null,
    cost_type: ["free", "paid", "members_free", "donation", "unknown"].includes(str(p.cost_type)) ? str(p.cost_type) : "unknown",
    cost_min: num(p.cost_min), cost_max: num(p.cost_max),
    cost_notes: str(p.cost_notes, 200) || null, member_price_notes: str(p.member_price_notes, 200) || null,
    cpe_eligible: cpe === "" ? null : cpe === "1" ? 1 : 0,
    cpe_hours: num(p.cpe_hours), cpe_body: str(p.cpe_body, 20) || null,
    topics: JSON.stringify(list(p.topics).filter((k) => TOPICS[k])),
    audience_level: ["open", "early_career", "practitioner", "senior"].includes(str(p.audience_level)) ? str(p.audience_level) : "open",
    discount_code: str(p.discount_code, 40) || null, discount_text: str(p.discount_text, 200) || null,
    is_better_security_event: str(p.is_better_security_event) === "1" ? 1 : 0,
    is_featured: str(p.is_featured) === "1" ? 1 : 0,
    status: ["draft", "pending_review", "published", "cancelled", "rejected"].includes(str(p.status)) ? str(p.status) : "pending_review",
    source: str(p.source, 20) || "manual",
    reviewer_notes: str(p.reviewer_notes, 2000) || null,
    city: cityOf(str(p.city)) ? str(p.city) : DEFAULT_CITY,
    platform: str(p.platform, 30) || null,
    speakers: str(p.speakers, 200) || null,
    recording_url: str(p.recording_url, 500) || null,
    also_virtual: str(p.also_virtual) === "1" ? 1 : 0,
    members_only: str(p.members_only) === "1" ? 1 : 0,
  };
  row.timezone = cityTz(row.city); // wall clock times are in the calendar's own zone
  row.start_utc = toUtc(row.start_at, row.timezone).toISOString();
  row.end_utc = row.end_at ? toUtc(row.end_at, row.timezone).toISOString() : null;
  return { row };
}

export async function insertEvent(db, row) {
  const cols = Object.keys(row);
  const sql = `INSERT INTO events (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
  const r = await db.prepare(sql).bind(...cols.map((c) => row[c])).run();
  return r.meta.last_row_id;
}

export async function updateEvent(db, id, row) {
  const cols = Object.keys(row);
  const sql = `UPDATE events SET ${cols.map((c) => `${c}=?`).join(",")}, updated_at=datetime('now') WHERE id=?`;
  await db.prepare(sql).bind(...cols.map((c) => row[c]), id).run();
}

export async function setStatus(db, id, status) {
  const pub = status === "published" ? ", published_at=COALESCE(published_at, datetime('now'))" : "";
  await db.prepare(`UPDATE events SET status=?, updated_at=datetime('now')${pub} WHERE id=?`).bind(status, id).run();
}

// Tell a submitter their event was published or declined (best effort).
export async function notifySubmitter(env, e, outcome) {
  if (!e || !e.submitted_by_email) return;
  const site = env.SITE_URL || "https://bettersecurity.ai";
  const first = (e.submitted_by_name || "there").split(" ")[0];
  if (outcome === "published") {
    await sendEmail(env, { to: e.submitted_by_email, subject: `Live on The Watch: ${e.title}`, html: emailShell("Your event is live", `<p>Hi ${first},</p><p><strong>${e.title}</strong> is now on the ${e.city === "virtual" ? "virtual" : cityOf(e.city).name} calendar at <a href="${site}${eventPath(e)}">${site}${eventPath(e)}</a>${e.city === "sandiego" ? " and will be in the Sunday email the week it happens" : ""}.</p><p>If anything changes, reply to this email and I'll update the listing.</p>`) });
  } else if (outcome === "rejected") {
    await sendEmail(env, { to: e.submitted_by_email, subject: `About your submission: ${e.title}`, html: emailShell("We couldn't list this one", `<p>Hi ${first},</p><p>Thanks for sending <strong>${e.title}</strong>. It isn't a fit for the calendar right now, usually because it falls outside San Diego County or outside security and the adjacent fields we cover. If you think that's wrong, reply and tell me more.</p>`) });
  }
}
