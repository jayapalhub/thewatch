// POST /api/invite: store an invitation request, confirm it to the requester and tell Jerome. Nothing here subscribes
// anyone to the Sunday email; the two paths are separate on purpose.
import { json, readForm, str, list, EMAIL_RE, esc, sha256 } from "../_lib/html.js";
import { INVITE_SENIORITY, INVITE_AREAS } from "../_lib/constants.js";
import { rateLimited } from "../_lib/subscribers.js";
import { notifyJerome, sendEmail, emailShell } from "../_lib/integrations.js";

const LINKEDIN_RE = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^\s/?#]+\/?(\?.*)?$/i;

// The confirmation the requester gets. Short, says what happens next, names nothing specific.
export function invitationConfirmationEmail(firstName) {
  return emailShell("We have your request", `
    <p>Hi ${esc(firstName)},</p>
    <p>Thank you for asking about Better Security's experiences for San Diego security and IT practitioners. Your request is in.</p>
    <p>Each experience is small and built around a particular group of people, so we match invitations to the room by role and by the areas people own. When there is a fit, you will hear from me directly with the details and a way to say yes or no.</p>
    <p>If your role or interests change in the meantime, reply to this email and I will update your request.</p>`);
}

export function parseInvite(p) {
  const row = {
    first_name: str(p.first_name, 80), last_name: str(p.last_name, 80), email: str(p.email, 200).toLowerCase(),
    company: str(p.company, 120), job_title: str(p.job_title, 120), seniority: str(p.seniority, 20),
    areas: Array.from(new Set(list(p.areas).filter((k) => INVITE_AREAS[k]))),
    linkedin_url: str(p.linkedin_url, 300), vendor: str(p.vendor) === "1" ? 1 : 0, notes: str(p.notes, 2000) || null,
    source: (str(p.source, 40) || "invite_page").replace(/[^a-z0-9_:-]/gi, ""),
  };
  if (!row.first_name || !row.last_name || !row.company || !row.job_title) return { error: "Please fill in your name, company and job title." };
  if (!EMAIL_RE.test(row.email)) return { error: "Please enter a valid work email address." };
  if (!INVITE_SENIORITY[row.seniority]) return { error: "Please choose your seniority." };
  if (!row.areas.length) return { error: "Pick at least one area you own or influence." };
  if (!LINKEDIN_RE.test(row.linkedin_url)) return { error: "Please give the address of your LinkedIn profile, like https://www.linkedin.com/in/yourname." };
  row.linkedin_url = row.linkedin_url.replace(/\?.*$/, "").replace(/\/$/, "");
  return { row };
}

export async function onRequestPost({ request, env, waitUntil }) {
  const p = await readForm(request);
  if (str(p.website_hp)) return json({ success: true, message: "Thank you. Your request is in." });
  if (await rateLimited(env.DB, request, "invite", 6, 60)) return json({ success: false, error: "Too many requests from this connection. Try again later." }, 429);
  const { row, error } = parseInvite(p);
  if (error) return json({ success: false, error }, 400);
  const ip = request.headers.get("cf-connecting-ip") || "";
  const ipHash = ip ? (await sha256(ip)).slice(0, 16) : null;
  // The same person asking twice gets their request refreshed, not a second row.
  const existing = await env.DB.prepare("SELECT id, status FROM invitation_requests WHERE email=?").bind(row.email).first();
  let id;
  if (existing) {
    id = existing.id;
    await env.DB.prepare(`UPDATE invitation_requests SET first_name=?, last_name=?, company=?, job_title=?, seniority=?, areas=?, linkedin_url=?, vendor=?, notes=COALESCE(?, notes), source=?, updated_at=datetime('now') WHERE id=?`)
      .bind(row.first_name, row.last_name, row.company, row.job_title, row.seniority, JSON.stringify(row.areas), row.linkedin_url, row.vendor, row.notes, row.source, id).run();
  } else {
    const r = await env.DB.prepare(`INSERT INTO invitation_requests (first_name, last_name, email, company, job_title, seniority, areas, linkedin_url, vendor, notes, source, ip_hash, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'new')`)
      .bind(row.first_name, row.last_name, row.email, row.company, row.job_title, row.seniority, JSON.stringify(row.areas), row.linkedin_url, row.vendor, row.notes, row.source, ipHash).run();
    id = r.meta.last_row_id;
  }
  const site = env.SITE_URL || "https://bettersecurity.ai";
  const areaNames = row.areas.map((k) => INVITE_AREAS[k]).join(", ");
  const tasks = [
    sendEmail(env, { to: row.email, subject: "We have your invitation request", html: invitationConfirmationEmail(row.first_name) })
      .then((r) => r && r.ok ? env.DB.prepare("UPDATE invitation_requests SET confirmation_sent_at=datetime('now') WHERE id=?").bind(id).run() : null),
    notifyJerome(env, `Invitation request: ${row.first_name} ${row.last_name}, ${row.job_title} at ${row.company}`, emailShell(existing ? "Invitation request updated" : "New invitation request", `
      <p><strong>${esc(row.first_name)} ${esc(row.last_name)}</strong>, ${esc(row.job_title)} at ${esc(row.company)} (${esc(INVITE_SENIORITY[row.seniority])})${row.vendor ? ' <span style="color:#9A5B00;font-weight:700;">vendor, reseller or services firm</span>' : ""}<br>
      ${esc(row.email)} · <a href="${esc(row.linkedin_url)}">LinkedIn</a></p>
      <p>Areas: ${esc(areaNames)}</p>${row.notes ? `<p>${esc(row.notes).replace(/\n/g, "<br>")}</p>` : ""}
      <p><a href="${site}/admin/invitations">Open the invitation list</a></p>`)),
  ];
  const all = Promise.allSettled(tasks);
  if (waitUntil) waitUntil(all); else await all;
  return json({ success: true, message: "Thank you. Your request is in, and a short confirmation is on its way to your inbox. We will reach out when there is a fit." });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
