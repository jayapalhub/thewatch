import { json } from "../_lib/html.js";

// Beehiiv webhook: keeps D1 status in sync when someone unsubscribes in the email.
// Configure in Beehiiv -> Settings -> Integrations -> Webhooks with the events
// subscription.unsubscribed (and subscription.created if you want imports mirrored).
// Set BEEHIIV_WEBHOOK_SECRET and append ?secret=<same> to the webhook URL.
export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  if (!env.BEEHIIV_WEBHOOK_SECRET || url.searchParams.get("secret") !== env.BEEHIIV_WEBHOOK_SECRET) return json({ ok: false }, 401);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const type = body && (body.event_type || body.type);
  const email = body && body.data && body.data.email;
  if (!email) return json({ ok: true, ignored: true });
  const now = new Date().toISOString();
  if (/unsubscribed/i.test(type || "")) {
    await env.DB.prepare("UPDATE subscribers SET status='unsubscribed', updated_at=? WHERE email=?").bind(now, email.toLowerCase()).run();
  } else if (/created|confirmed/i.test(type || "")) {
    await env.DB.prepare("INSERT INTO subscribers (email, status, source, consented_at, beehiiv_subscriber_id) VALUES (?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET status='active', beehiiv_subscriber_id=COALESCE(excluded.beehiiv_subscriber_id, subscribers.beehiiv_subscriber_id), updated_at=excluded.consented_at")
      .bind(email.toLowerCase(), "active", "beehiiv", now, body.data.id || null).run();
  }
  return json({ ok: true });
}
