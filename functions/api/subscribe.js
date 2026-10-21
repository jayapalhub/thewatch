import { json, readForm, str, EMAIL_RE } from "../_lib/html.js";
import { upsertSubscriber, rateLimited } from "../_lib/subscribers.js";
import { CITIES } from "../_lib/constants.js";

export async function onRequestPost({ request, env }) {
  const p = await readForm(request);
  if (str(p.website)) return json({ success: true }); // honeypot: pretend it worked
  const email = str(p.email, 200);
  if (!EMAIL_RE.test(email)) return json({ success: false, error: "Please enter a valid email address." }, 400);
  if (await rateLimited(env.DB, request, "subscribe", 15, 60)) return json({ success: false, error: "Too many attempts. Try again in a bit." }, 429);
  const source = str(p.source, 60) || "site";
  try {
    const city = CITIES[str(p.city, 30)] ? str(p.city, 30) : null; // from the city picker, when the form has one
    const row = await upsertSubscriber(env.DB, env, { email, source, request, city });
    return json({ success: true, next: `/profile?t=${row.profile_token}` });
  } catch (e) {
    console.error("subscribe failed", e && e.message);
    return json({ success: false, error: "Something went wrong on our side. Try again in a minute." }, 500);
  }
}
export async function onRequest({ request }) { return json({ success: false, error: "method_not_allowed" }, 405); }
