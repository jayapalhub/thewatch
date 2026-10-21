import { html, page, raw } from "../_lib/html.js";
import { shell } from "../_lib/layout.js";
import { upsertSubscriber } from "../_lib/subscribers.js";
import { CITIES, preferredCity } from "../_lib/constants.js";

// "Get the Sunday email" from a reminder. Clicking from their own inbox shows the address is theirs.
// GET shows a confirm button so link scanners cannot subscribe anyone; POST subscribes.
const valid = (t) => /^[a-z0-9]{16,64}$/.test(t || "");
async function lookup(env, t) {
  if (!valid(t)) return null;
  return env.DB.prepare("SELECT r.email, e.city FROM reminders r LEFT JOIN events e ON e.id = r.event_id WHERE r.token=?").bind(t).first();
}
function view(body) { return page(shell({ title: "The Sunday email", body: html`<section class="hero hero-short"><div class="wrap narrow">${body}</div></section>`, path: "/remind/join" }), 200, { "Cache-Control": "private, no-store" }); }
const bad = () => view(html`<h1>That link isn't valid.</h1><p class="lede">You can still <a href="/subscribe">subscribe here</a>.</p>`);

export async function onRequestGet({ request, env }) {
  const t = new URL(request.url).searchParams.get("t");
  const r = await lookup(env, t);
  if (!r) return bad();
  const sub = await env.DB.prepare("SELECT status FROM subscribers WHERE email=?").bind(r.email).first();
  if (sub && sub.status === "active") return view(html`<h1>You're already on the list.</h1><p class="lede">${r.email} gets The Watch every Sunday at 8 AM.</p>`);
  // A virtual event has no city of its own, so the reader picks theirs.
  if (!CITIES[r.city]) {
    const pick = preferredCity(request);
    return view(html`<h1>Get The Watch every Sunday</h1><p class="lede">The week's security events in your city, curated down to what's worth your time, plus the best online sessions with CPE. One email, Sunday at 8 AM, unsubscribe in one click.</p>
      <form method="post" action="/remind/join?t=${t}"><input type="hidden" name="confirm" value="1">
        <label class="signup-city">Your city <select name="city">${Object.values(CITIES).map((c) => html`<option value="${c.slug}" ${c.slug === pick ? raw("selected") : ""}>${c.name}${c.newsletter === "sunday" ? "" : " (starting soon)"}</option>`)}</select></label>
        <button class="btn btn-primary" type="submit">Send it to ${r.email}</button></form>`);
  }
  const city = CITIES[r.city];
  const live = city.newsletter === "sunday";
  return view(html`<h1>Get The Watch ${city.name}${live ? " every Sunday" : ""}</h1><p class="lede">${live ? `The week's security events in ${city.name}, curated down to what's worth your time, plus the best online sessions with CPE. One email, Sunday at 8 AM, unsubscribe in one click.` : `The ${city.name} Sunday email is starting soon: the week's security events, curated down to what's worth your time. Join now and you get the first issue. Unsubscribe in one click.`}</p>
    <form method="post" action="/remind/join?t=${t}"><input type="hidden" name="confirm" value="1"><button class="btn btn-primary" type="submit">Send it to ${r.email}</button></form>`);
}
export async function onRequestPost({ request, env }) {
  const t = new URL(request.url).searchParams.get("t");
  const r = await lookup(env, t);
  if (!r) return bad();
  const form = await request.formData().catch(() => null);
  const chosen = form && form.get("city");
  const city = CITIES[r.city] ? r.city : CITIES[chosen] ? chosen : preferredCity(request);
  const row = await upsertSubscriber(env.DB, env, { email: r.email, source: `calendar:${city}`, tags: ["remind"], request, city });
  if (row.resubscribePending) return view(html`<h1>Check your inbox.</h1><p class="lede">${r.email} unsubscribed earlier, so we sent it a link to confirm. Press the button in that email and you're back on the list.</p>`);
  if (!row.isNew) return view(html`<h1>You're already on the list.</h1><p class="lede">${r.email} gets The Watch every Sunday at 8 AM.</p>`);
  return view(html`<h1>You're in.</h1><p class="lede">${(CITIES[city] || {}).newsletter === "sunday" ? "Your first issue arrives Sunday at 8 AM" : "You'll get the first issue the week it launches"}, and a welcome note is on its way now. If you have a minute, <a href="/profile?t=${row.profile_token}">tell us where you sit and what you want more of</a>.</p>`);
}
