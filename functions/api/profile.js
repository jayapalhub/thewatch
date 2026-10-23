import { json, readForm, str, list } from "../_lib/html.js";
import { TOPICS, SENIORITY } from "../_lib/constants.js";

// Save the optional profile questions. Identified by the profile token only.
export async function onRequestPost({ request, env, waitUntil }) {
  const p = await readForm(request);
  const t = str(p.t, 64);
  const sub = t ? await env.DB.prepare("SELECT * FROM subscribers WHERE profile_token=?").bind(t).first() : null;
  if (!sub) return json({ success: false, error: "This link has expired. Subscribe again to get a new one." }, 400);
  const first = str(p.first_name, 60), last = str(p.last_name, 60), role = str(p.role_title, 120);
  // Company: what they typed, else a guess from a corporate email domain (never from webmail).
  const domain = (sub.email.split("@")[1] || "").toLowerCase();
  const webmail = /^(gmail|yahoo|outlook|hotmail|icloud|me|aol|proton|protonmail|live|msn|pm)\./.test(domain + ".");
  const company = str(p.company, 120) || sub.company || (!webmail && domain ? domain.replace(/\.(com|net|org|io|ai|co|us|gov|edu)(\.[a-z]{2})?$/i, "").split(".").pop() : "");
  const seniority = SENIORITY[str(p.seniority)] ? str(p.seniority) : null;
  const interests = list(p.interests).filter((k) => TOPICS[k]).slice(0, 6);
  const linkedin = str(p.linkedin_url, 200);
  const now = new Date().toISOString();
  // Personalized links: the form always sends personalize_set, so an unticked box means off. Older forms leave it alone.
  const personalize = str(p.personalize_set) === "1" ? (str(p.personalize) === "1" ? 1 : 0) : (sub.personalize === undefined || sub.personalize === null ? 1 : Number(sub.personalize));
  await env.DB.prepare("UPDATE subscribers SET first_name=?, last_name=?, company=?, role_title=?, seniority=?, interests=?, linkedin_url=?, personalize=?, profile_completed_at=?, updated_at=? WHERE id=?")
    .bind(first || null, last || null, company || null, role || null, seniority, JSON.stringify(interests), linkedin || null, personalize, now, now, sub.id).run();
  return json({ success: true, message: "Saved. Thanks for telling us a bit about yourself." });
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
