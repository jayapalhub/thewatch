import { json, readForm, str, EMAIL_RE, esc } from "../_lib/html.js";
import { upsertSubscriber, rateLimited } from "../_lib/subscribers.js";
import { notifyJerome, sendEmail, emailShell } from "../_lib/integrations.js";

export async function onRequestPost({ request, env, waitUntil }) {
  const p = await readForm(request);
  if (str(p.website_hp)) return json({ success: true });
  const d = {
    company: str(p.company, 120), contact_name: str(p.contact_name, 100), email: str(p.email, 200),
    role_title: str(p.role_title, 100), interest: str(p.interest, 40), message: str(p.message, 3000), budget_range: str(p.budget_range, 40),
  };
  if (!d.company || !EMAIL_RE.test(d.email)) return json({ success: false, error: "Company and a valid email are required." }, 400);
  if (await rateLimited(env.DB, request, "sponsor", 5, 60)) return json({ success: false, error: "Too many attempts. Try again in a bit." }, 429);
  try {
    await env.DB.prepare("INSERT INTO sponsor_inquiries (company, contact_name, email, role_title, interest, message, budget_range) VALUES (?,?,?,?,?,?,?)")
      .bind(d.company, d.contact_name, d.email, d.role_title, d.interest, d.message, d.budget_range).run();
    const tasks = [];
    if (str(p.subscribe) === "1") tasks.push(upsertSubscriber(env.DB, env, { email: d.email, source: "sponsor_page", tags: ["sponsor_lead"], request, extra: { company: d.company, first_name: d.contact_name.split(" ")[0] } }));
    tasks.push(notifyJerome(env, `Sponsor inquiry: ${d.company}`, emailShell("New sponsor inquiry", `
      <p><strong>${esc(d.company)}</strong><br>${esc(d.contact_name)} (${esc(d.role_title) || "role not given"})<br><a href="mailto:${esc(d.email)}">${esc(d.email)}</a></p>
      <p>Interest: ${esc(d.interest) || "not specified"}<br>Budget range: ${esc(d.budget_range) || "not specified"}</p>
      <p>${esc(d.message).replace(/\n/g, "<br>")}</p>`)));
    tasks.push(sendEmail(env, { to: d.email, subject: "Thanks for your interest in sponsoring The Watch", html: emailShell("Thanks, we'll be in touch", `<p>Hi ${esc(d.contact_name.split(" ")[0] || "there")},</p><p>Thanks for reaching out about sponsoring with Better Security. I read every inquiry personally and will reply within two business days with the current sponsor deck and a few times to talk.</p>`) }));
    const all = Promise.allSettled(tasks);
    if (waitUntil) waitUntil(all); else await all;
    return json({ success: true, message: "Thanks. Jerome will reply within two business days." });
  } catch (e) {
    console.error("sponsor failed", e && e.message);
    return json({ success: false, error: "Something went wrong on our side. Email watch@bettersecurity.ai instead." }, 500);
  }
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
