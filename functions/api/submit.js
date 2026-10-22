import { json, readForm, str, list, slugify, EMAIL_RE, esc } from "../_lib/html.js";
import { TOPICS, DEFAULT_CITY, cityOf, cityTz } from "../_lib/constants.js";
import { autoPublishAt } from "../_lib/autopublish.js";
import { upsertSubscriber, rateLimited } from "../_lib/subscribers.js";
import { notifyJerome, sendEmail, emailShell } from "../_lib/integrations.js";
import { toUtc } from "../_lib/dates.js";

export async function onRequestPost({ request, env, waitUntil }) {
  const p = await readForm(request);
  if (str(p.website_hp)) return json({ success: true });
  if (await rateLimited(env.DB, request, "submit", 8, 60)) return json({ success: false, error: "Too many submissions from this connection. Try again later." }, 429);

  const title = str(p.title, 140);
  const date = str(p.date, 10), startTime = str(p.start_time, 5), endTime = str(p.end_time, 5);
  const regUrl = str(p.registration_url, 500);
  const short = str(p.description_short, 200);
  const byName = str(p.submitted_by_name, 80), byEmail = str(p.submitted_by_email, 200);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !short || !byName || !EMAIL_RE.test(byEmail))
    return json({ success: false, error: "Please fill in the title, date, start time, summary, your name and a valid email." }, 400);
  if (!/^https?:\/\//i.test(regUrl)) return json({ success: false, error: "The registration link needs to start with http:// or https://." }, 400);

  // Organization: existing slug, or a new pending one
  let orgId = null, trustedOrg = false;
  const orgSlug = str(p.organization_slug, 80);
  if (orgSlug && orgSlug !== "__new") {
    const o = await env.DB.prepare("SELECT id, trusted FROM organizations WHERE slug=?").bind(orgSlug).first();
    orgId = o ? o.id : null; trustedOrg = !!(o && o.trusted);
  } else {
    const newName = str(p.organization_new, 120);
    if (newName) {
      const s = slugify(newName);
      const existing = await env.DB.prepare("SELECT id FROM organizations WHERE slug=?").bind(s).first();
      if (existing) orgId = existing.id;
      else {
        const r = await env.DB.prepare("INSERT INTO organizations (slug, name, type, contact_name, contact_email, notes) VALUES (?,?,?,?,?,?)")
          .bind(s, newName, "community", byName, byEmail, "Created from a public submission; review details").run();
        orgId = r.meta.last_row_id;
      }
    }
  }
  if (!orgId) return json({ success: false, error: "Choose an organization or give a name for a new one." }, 400);

  const format = ["in_person", "virtual", "hybrid"].includes(str(p.format)) ? str(p.format) : "in_person";
  const costType = ["free", "paid", "members_free", "donation"].includes(str(p.cost_type)) ? str(p.cost_type) : "unknown";
  const num = (v) => { const n = parseFloat(str(v)); return Number.isFinite(n) ? n : null; };
  const topics = list(p.topics).filter((k) => TOPICS[k]).slice(0, 3);
  const audience = ["open", "early_career", "practitioner", "senior"].includes(str(p.audience_level)) ? str(p.audience_level) : "open";
  const startAt = `${date}T${startTime}:00`;
  const endAt = /^\d{2}:\d{2}$/.test(endTime) ? `${date}T${endTime}:00` : null;
  const city = cityOf(str(p.calendar)) ? str(p.calendar) : DEFAULT_CITY;
  const tz = cityTz(city);
  const startUtc = toUtc(startAt, tz).toISOString();
  const endUtc = endAt ? toUtc(endAt, tz).toISOString() : null;

  // Unique slug
  let slug = `${slugify(title)}-${date}`;
  const clash = await env.DB.prepare("SELECT id FROM events WHERE slug=?").bind(slug).first();
  if (clash) slug += "-" + Math.random().toString(36).slice(2, 6);

  // Duplicate hint for the reviewer
  const dup = await env.DB.prepare("SELECT id, title FROM events WHERE (registration_url=? OR (title=? AND start_at LIKE ?)) AND status!='rejected' LIMIT 1").bind(regUrl, title, date + "%").first();

  const r = await env.DB.prepare(`INSERT INTO events (slug, city, title, organization_id, venue_name, venue_address, start_at, end_at, format, description_short, description_long, registration_url,
      cost_type, cost_min, cost_max, cost_notes, cpe_eligible, cpe_hours, cpe_body, topics, audience_level, discount_code, discount_text, status, source, source_url, submitted_by_name, submitted_by_email, reviewer_notes, start_utc, end_utc, also_virtual, auto_publish_at, hold, timezone)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(slug, city, title, orgId, str(p.venue_name, 120) || null, str(p.venue_address, 200) || null, startAt, endAt, format, short, str(p.description_long, 4000) || null, regUrl,
      costType, num(p.cost_min), num(p.cost_max), str(p.cost_notes, 200) || null, str(p.cpe_eligible) === "1" ? 1 : 0, num(p.cpe_hours), str(p.cpe_body, 20) || null,
      JSON.stringify(topics), audience, str(p.discount_code, 40) || null, str(p.discount_code, 40) ? str(p.discount_text, 200) || null : null, "pending_review", "submission", regUrl, byName, byEmail,
      dup ? `Possible duplicate of event #${dup.id} (${dup.title})` : null, startUtc, endUtc, city !== "virtual" && format !== "in_person" ? 1 : 0,
      trustedOrg && !dup ? autoPublishAt() : null, trustedOrg && !dup ? 0 : 1, tz).run();
  const id = r.meta.last_row_id;

  const tasks = [];
  if (str(p.subscribe) === "1") tasks.push(upsertSubscriber(env.DB, env, { email: byEmail, source: "submit_form", tags: ["organizer"], request, city: city !== "virtual" ? city : null, extra: { first_name: byName.split(" ")[0] } }));
  const site = env.SITE_URL || "";
  tasks.push(notifyJerome(env, `Event submitted: ${title}`, emailShell("New event submission", `
    <p><strong>${esc(title)}</strong><br>${esc(startAt)} (${esc(format)})<br>Submitted by ${esc(byName)} &lt;${esc(byEmail)}&gt;</p>
    <p>${esc(short)}</p>${dup ? `<p style="color:#b45309">Possible duplicate of #${dup.id}.</p>` : ""}
    <p><a href="${site}/admin/events/${id}">Review in the admin</a></p>`)));
  tasks.push(sendEmail(env, { to: byEmail, subject: `Got it: ${title}`, html: emailShell("Thanks for the submission", `<p>Hi ${esc(byName.split(" ")[0])},</p><p>Your event <strong>${esc(title)}</strong> is in the review queue. It usually takes less than a day, and you'll get a note when it's live on the calendar.</p>`) }));
  const all = Promise.allSettled(tasks);
  if (waitUntil) waitUntil(all); else await all;

  return json({ success: true, message: "Thanks. Your event is in the review queue and you'll hear back shortly." });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
