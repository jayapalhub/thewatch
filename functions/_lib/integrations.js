// Resend (transactional email and the newsletter). Keys come from env secrets and are never logged or returned to the browser.

export async function sendEmail(env, { to, subject, html, replyTo, from, headers }) {
  if (!env.RESEND_API_KEY) { console.error("resend: RESEND_API_KEY not set"); return { ok: false, skipped: true }; }
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: from || env.FROM_EMAIL || "The Watch <watch@bettersecurity.ai>", to, subject, html, reply_to: replyTo || env.NOTIFY_EMAIL, headers: headers || undefined }),
    });
    if (!resp.ok) { console.error(`resend: status ${resp.status}`); return { ok: false }; }
    return { ok: true };
  } catch (e) { console.error("resend failed", e && e.message); return { ok: false }; }
}

export function notifyJerome(env, subject, html) {
  return sendEmail(env, { to: env.NOTIFY_EMAIL || "jerome.jayapal@bettersecurity.ai", subject, html });
}

// A plain transactional wrapper that matches the brand without a template system.
export function emailShell(title, inner, city = null) {
  return `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0E1B2E;">
  <div style="background:#071426;padding:18px 24px;border-radius:12px 12px 0 0;"><span style="color:#fff;font-size:16px;font-weight:700;">The Watch${city ? " " + city.name : ""}</span><span style="color:#1FB6F0;font-size:13px;margin-left:10px;">by Better Security</span></div>
  <div style="border:1px solid #DCE4EE;border-top:none;border-radius:0 0 12px 12px;padding:24px;font-size:15px;line-height:1.65;">
    <h2 style="margin:0 0 12px;font-size:19px;">${title}</h2>${inner}
    <p style="margin:24px 0 0;color:#5B6B80;font-size:13px;">Thank you,<br>Jerome Jayapal<br>Better Security</p>
  </div></div>`;
}

// Welcome email, sent by the site the moment someone subscribes (replaces the Beehiiv welcome automation).
export function welcomeEmail(siteUrl, sub, city) {
  const cal = `${siteUrl}/${city.slug}`;
  const unsub = `${siteUrl}/unsubscribe?t=${sub.unsub_token || ""}`;
  const inner = `
    <p>Hi${sub.first_name ? " " + sub.first_name : ""},</p>
    <p>You're on the list for The Watch ${city.name}. Every Sunday at 8 AM you'll get the week's security events in ${city.name}, curated down to what's worth your time, with a short note from me on what I'd show up for.</p>
    <p>Until Sunday, the full calendar is at <a href="${cal}" style="color:#1B4A8A;">${cal.replace(/^https?:\/\//, "")}</a>, and the live online sessions with CPE are at <a href="${siteUrl}/virtual" style="color:#1B4A8A;">bettersecurity.ai/virtual</a>.</p>
    <p>Two quick questions, if you have a minute, so the email and our own events fit you better: <a href="${siteUrl}/profile?t=${sub.profile_token || ""}" style="color:#1B4A8A;">tell us where you sit and what you want more of</a>. Skip it and you still get every issue.</p>
    <p>If you run events, <a href="${siteUrl}/submit" style="color:#1B4A8A;">submit them here</a> and they go on the calendar and into the email. And if this isn't for you, <a href="${unsub}" style="color:#5B6B80;">unsubscribe</a> in one click.</p>`;
  return emailShell(`Welcome to The Watch ${city.name}`, inner, city);
}
