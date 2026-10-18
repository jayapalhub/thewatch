// Beehiiv (newsletter list) and Resend (transactional email).
// Reused from compass.bettersecurity.ai with custom fields added.
// Keys come from env secrets and are never logged or returned to the browser.

export async function beehiivSubscribe(env, { email, source, customFields = {}, sendWelcome = true }) {
  if (!env.BEEHIIV_API_KEY) { console.error("beehiiv: BEEHIIV_API_KEY not set"); return { ok: false, skipped: true }; }
  const pub = env.BEEHIIV_PUBLICATION_ID;
  const body = {
    email,
    reactivate_existing: true,
    send_welcome_email: !!sendWelcome,
    utm_source: "thewatch",
    utm_medium: source || "site",
  };
  const cf = Object.entries(customFields).filter(([, v]) => v != null && v !== "").map(([name, value]) => ({ name, value: String(value) }));
  if (cf.length) body.custom_fields = cf;
  try {
    const resp = await fetch(`https://api.beehiiv.com/v2/publications/${pub}/subscriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.BEEHIIV_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) { console.error(`beehiiv: status ${resp.status}`); return { ok: false }; }
    const j = await resp.json().catch(() => ({}));
    return { ok: true, id: j && j.data && j.data.id };
  } catch (e) { console.error("beehiiv: request failed", e && e.message); return { ok: false }; }
}

// Update custom fields on an existing subscription (used by the profile step).
export async function beehiivUpdate(env, subscriptionId, customFields) {
  if (!env.BEEHIIV_API_KEY || !subscriptionId) return { ok: false, skipped: true };
  const pub = env.BEEHIIV_PUBLICATION_ID;
  const cf = Object.entries(customFields).filter(([, v]) => v != null && v !== "").map(([name, value]) => ({ name, value: String(value) }));
  try {
    const resp = await fetch(`https://api.beehiiv.com/v2/publications/${pub}/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${env.BEEHIIV_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ custom_fields: cf }),
    });
    if (!resp.ok) { console.error(`beehiiv update: status ${resp.status}`); return { ok: false }; }
    return { ok: true };
  } catch (e) { console.error("beehiiv update failed", e && e.message); return { ok: false }; }
}

export async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!env.RESEND_API_KEY) { console.error("resend: RESEND_API_KEY not set"); return { ok: false, skipped: true }; }
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.FROM_EMAIL || "The Watch San Diego <watch@bettersecurity.ai>", to, subject, html, reply_to: replyTo || env.NOTIFY_EMAIL }),
    });
    if (!resp.ok) { console.error(`resend: status ${resp.status}`); return { ok: false }; }
    return { ok: true };
  } catch (e) { console.error("resend failed", e && e.message); return { ok: false }; }
}

export function notifyJerome(env, subject, html) {
  return sendEmail(env, { to: env.NOTIFY_EMAIL || "jerome.jayapal@bettersecurity.ai", subject, html });
}

// A plain transactional wrapper that matches the brand without a template system.
export function emailShell(title, inner) {
  return `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0E1B2E;">
  <div style="background:#071426;padding:18px 24px;border-radius:12px 12px 0 0;"><span style="color:#fff;font-size:16px;font-weight:700;">The Watch San Diego</span><span style="color:#1FB6F0;font-size:13px;margin-left:10px;">by Better Security</span></div>
  <div style="border:1px solid #DCE4EE;border-top:none;border-radius:0 0 12px 12px;padding:24px;font-size:15px;line-height:1.65;">
    <h2 style="margin:0 0 12px;font-size:19px;">${title}</h2>${inner}
    <p style="margin:24px 0 0;color:#5B6B80;font-size:13px;">Thank you,<br>Jerome Jayapal<br>Better Security</p>
  </div></div>`;
}
