import { html, page, redirect } from "../_lib/html.js";
import { shell } from "../_lib/layout.js";
import { eventById } from "../_lib/events.js";
import { fmtDateLong } from "../_lib/dates.js";
import { eventStarted, markAttended, withCookies } from "../_lib/cpe.js";

// "Add it to your CPE log" from a reminder email: /cpe/attend?r=<reminder token>.
// GET shows a confirm button (mail scanners open every link); POST records attendance.
const HEAD = '<meta name="robots" content="noindex"><meta name="referrer" content="same-origin">';
const view = (body) => page(shell({ title: "CPE log", body: html`<section class="hero hero-short"><div class="wrap narrow">${body}</div></section>`, path: "/cpe", head: HEAD }), 200, { "Cache-Control": "private, no-store" });

async function lookup(env, r) {
  if (!/^[a-z0-9]{16,64}$/.test(r || "")) return null;
  const rem = await env.DB.prepare("SELECT event_id, email, token FROM reminders WHERE token=?").bind(r).first();
  if (!rem) return null;
  const [e, sub] = await Promise.all([eventById(env.DB, rem.event_id), env.DB.prepare("SELECT id, status, profile_token FROM subscribers WHERE email=?").bind(rem.email).first()]);
  return { rem, e, sub };
}

export async function onRequestGet({ request, env }) {
  const r = new URL(request.url).searchParams.get("r");
  const x = await lookup(env, r);
  if (!x || !x.e) return view(html`<h1>That link isn't valid.</h1><p class="lede">It may have been copied incompletely.</p>`);
  if (!x.sub || x.sub.status !== "active") return view(html`<h1>Your CPE log comes with the Sunday email.</h1><p class="lede">Subscribers get a private log of the events they attended, with credit hours and a CSV export. <a href="/remind/join?t=${x.rem.token}">Get the Sunday email</a>, then mark this one attended from its event page.</p>`);
  if (!eventStarted(x.e)) return view(html`<h1>Come back after the event.</h1><p class="lede">${x.e.title} is on ${fmtDateLong(x.e.start_at)}. Once it has happened, this link adds it to your CPE log.</p>`);
  return view(html`<p class="kicker">CPE log</p><h1>Did you make it to ${x.e.title}?</h1><p class="lede">Add it to your private CPE log with the organizer's reported credit hours. You can change the hours afterwards.</p>
    <form method="post" action="/cpe/attend?r=${x.rem.token}"><button class="btn btn-primary" type="submit">Yes, add it to my log</button></form>`);
}

export async function onRequestPost({ request, env }) {
  const r = new URL(request.url).searchParams.get("r");
  const x = await lookup(env, r);
  if (!x || !x.e || !x.sub || x.sub.status !== "active" || !eventStarted(x.e) || x.e.status !== "published") return redirect(`/cpe/attend?r=${encodeURIComponent(r || "")}`, 303);
  await markAttended(env.DB, x.sub.id, x.e, "reminder_email");
  return withCookies(redirect(`/cpe?t=${x.sub.profile_token}&msg=${encodeURIComponent(`Added ${x.e.title} to your log.`)}#e${x.e.id}`, 303), x.sub.profile_token);
}
