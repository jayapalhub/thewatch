import { html, page } from "../_lib/html.js";
import { shell } from "../_lib/layout.js";
import { stopReminders } from "../_lib/reminders.js";

// GET shows a confirm button (so link scanners in corporate mail do not cancel reminders on their own).
// POST does it; mail clients send POST here for one click List-Unsubscribe.
const valid = (t) => /^[a-z0-9]{16,64}$/.test(t || "");
function view(body) { return page(shell({ title: "Reminders", body: html`<section class="hero hero-short"><div class="wrap narrow">${body}</div></section>`, path: "/remind/stop" }), 200, { "Cache-Control": "private, no-store" }); }

export async function onRequestGet({ request, env }) {
  const t = new URL(request.url).searchParams.get("t");
  const r = valid(t) ? await env.DB.prepare("SELECT email FROM reminders WHERE token=?").bind(t).first() : null;
  if (!r) return view(html`<h1>That link isn't valid.</h1><p class="lede">It may have been copied incompletely. Email <a href="mailto:watch@bettersecurity.ai?subject=Stop%20reminders">watch@bettersecurity.ai</a> and we'll take care of it.</p>`);
  return view(html`<h1>Stop event reminders?</h1><p class="lede">This cancels every reminder waiting for ${r.email} and stops new ones until you ask for another. It does not change the Sunday email.</p>
    <form method="post" action="/remind/stop?t=${t}"><input type="hidden" name="confirm" value="1"><button class="btn btn-primary" type="submit">Stop my reminders</button></form>`);
}
export async function onRequestPost({ request, env }) {
  const t = new URL(request.url).searchParams.get("t");
  const email = valid(t) ? await stopReminders(env.DB, t) : null;
  const fromBrowser = (request.headers.get("accept") || "").includes("text/html");
  if (!fromBrowser) return new Response("OK", { status: 200 }); // one click from a mail client
  if (!email) return view(html`<h1>That link isn't valid.</h1><p class="lede">Email <a href="mailto:watch@bettersecurity.ai?subject=Stop%20reminders">watch@bettersecurity.ai</a> and we'll take care of it.</p>`);
  return view(html`<h1>Reminders stopped.</h1><p class="lede">${email} won't get any more event reminders. Ask for one on any event page if you change your mind.</p>`);
}
