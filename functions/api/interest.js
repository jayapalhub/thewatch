import { json, readForm, str, EMAIL_RE } from "../_lib/html.js";
import { upsertSubscriber, addInterest, rateLimited } from "../_lib/subscribers.js";
import { BS_EVENT_KEYS } from "../_lib/constants.js";
import { notifyJerome, emailShell } from "../_lib/integrations.js";

// Register interest in a Better Security event that has no registration yet.
export async function onRequestPost({ request, env, waitUntil }) {
  const p = await readForm(request);
  if (str(p.website)) return json({ success: true });
  const email = str(p.email, 200);
  const key = str(p.event_key, 40);
  if (!EMAIL_RE.test(email)) return json({ success: false, error: "Please enter a valid email address." }, 400);
  if (!BS_EVENT_KEYS[key]) return json({ success: false, error: "Unknown event." }, 400);
  if (await rateLimited(env.DB, request, "interest", 15, 60)) return json({ success: false, error: "Too many attempts. Try again in a bit." }, 429);
  try {
    const row = await upsertSubscriber(env.DB, env, { email, source: `interest:${key}`, tags: [`${key}_interest`], request });
    await addInterest(env.DB, row.id, key);
    const note = notifyJerome(env, `Interest: ${BS_EVENT_KEYS[key]}`, emailShell("New interest sign up", `<p>${email} wants to hear about <strong>${BS_EVENT_KEYS[key]}</strong>.</p>`));
    if (waitUntil) waitUntil(note); else await note;
    return json({ success: true, next: `/profile?t=${row.profile_token}`, message: `You're on the list for ${BS_EVENT_KEYS[key]}.` });
  } catch (e) {
    console.error("interest failed", e && e.message);
    return json({ success: false, error: "Something went wrong on our side. Try again in a minute." }, 500);
  }
}
export async function onRequest() { return json({ success: false, error: "method_not_allowed" }, 405); }
