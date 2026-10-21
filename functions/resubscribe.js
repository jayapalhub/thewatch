import { html, page } from "./_lib/html.js";
import { shell } from "./_lib/layout.js";
import { sendWelcomeTo } from "./_lib/subscribers.js";

// Coming back after unsubscribing: only through a link sent to the address (or the unsubscribe page itself),
// never from a signup form, so nobody can put someone else back on the list. GET confirms, POST acts.
const VALID = /^[a-z0-9]{16,64}$/i;
const view = (body) => page(shell({ title: "The Watch", body: html`<section class="hero hero-short"><div class="wrap narrow">${body}</div></section>`, path: "/resubscribe", head: '<meta name="robots" content="noindex">' }), 200, { "Cache-Control": "private, no-store" });
async function find(env, t) { return VALID.test(t || "") ? env.DB.prepare("SELECT id, email, status FROM subscribers WHERE unsub_token=?").bind(t).first() : null; }
const invalid = () => view(html`<h1>That link isn't valid.</h1><p class="lede">You can always <a href="/subscribe">subscribe here</a>.</p>`);

export async function onRequestGet({ request, env }) {
  const t = new URL(request.url).searchParams.get("t");
  const sub = await find(env, t);
  if (!sub) return invalid();
  if (sub.status === "active") return view(html`<h1>You're on the list.</h1><p class="lede">${sub.email} gets The Watch every Sunday.</p>`);
  return view(html`<h1>Start The Watch again for ${sub.email}?</h1>
    <form method="post" action="/resubscribe?t=${t}"><input type="hidden" name="confirm" value="1"><button class="btn btn-primary" type="submit">Yes, start it again</button></form>`);
}
export async function onRequestPost({ request, env }) {
  const t = new URL(request.url).searchParams.get("t");
  const sub = await find(env, t);
  if (!sub) return invalid();
  if (sub.status === "unsubscribed") {
    await env.DB.prepare("UPDATE subscribers SET status='active', updated_at=datetime('now') WHERE id=? AND status='unsubscribed'").bind(sub.id).run();
    await sendWelcomeTo(env.DB, env, sub.id);
  }
  return view(html`<h1>You're back on the list.</h1><p class="lede">${sub.email} gets The Watch again from this Sunday.</p>`);
}
