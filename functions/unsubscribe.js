import { html, page } from "./_lib/html.js";
import { shell } from "./_lib/layout.js";

// Unsubscribe. The link in an email (GET) shows a one button confirm page so a mail security scanner that follows
// links cannot unsubscribe anyone; the button and the mail client's one click List-Unsubscribe both POST.
const VALID = /^[a-z0-9]{16,64}$/i; // tokens from migration 0009 are hex, newer ones are a-z0-9
async function find(env, t) {
  if (!VALID.test(t || "")) return null;
  return env.DB.prepare("SELECT id, email, status FROM subscribers WHERE unsub_token=?").bind(t).first();
}
async function unsubscribe(env, t) {
  const sub = await find(env, t);
  if (sub && sub.status !== "unsubscribed") await env.DB.prepare("UPDATE subscribers SET status='unsubscribed', updated_at=datetime('now') WHERE id=?").bind(sub.id).run();
  return sub;
}
const view = (body) => page(shell({ title: "Unsubscribe", body: html`<section class="hero hero-short"><div class="wrap narrow">${body}</div></section>`, path: "/unsubscribe", head: '<meta name="robots" content="noindex">' }), 200, { "Cache-Control": "private, no-store" });
const invalid = () => view(html`<h1>That link isn't valid.</h1><p class="lede">It may have been copied incompletely. Reply to any email from The Watch and we'll take care of it.</p>`);

export async function onRequestPost({ request, env }) {
  const u = new URL(request.url);
  const t = u.searchParams.get("t");
  const sub = await unsubscribe(env, t);
  // Mail clients doing RFC 8058 one click POST "List-Unsubscribe=One-Click" and only need a 200.
  const ct = request.headers.get("content-type") || "";
  const form = ct.includes("form") ? await request.formData().catch(() => null) : null;
  if (!form || form.get("List-Unsubscribe") === "One-Click" || !form.get("confirm")) return new Response("OK", { status: 200 });
  if (!sub) return invalid();
  return view(html`<h1>You're unsubscribed.</h1><p class="lede">${sub.email} will not get the weekly email any more.</p>
    <form method="post" action="/resubscribe?t=${t}"><input type="hidden" name="confirm" value="1"><button class="btn btn-ghost-dark" type="submit">Changed my mind, keep sending it</button></form>`);
}
export async function onRequestGet({ request, env }) {
  const t = new URL(request.url).searchParams.get("t");
  if (t === "preview") return view(html`<h1>This is the preview copy.</h1><p class="lede">Subscribers get a personal unsubscribe link here.</p>`);
  const sub = await find(env, t);
  if (!sub) return invalid();
  if (sub.status === "unsubscribed") return view(html`<h1>You're already unsubscribed.</h1><p class="lede">${sub.email} does not get the weekly email.</p>
    <form method="post" action="/resubscribe?t=${t}"><input type="hidden" name="confirm" value="1"><button class="btn btn-primary" type="submit">Start it again</button></form>`);
  return view(html`<h1>Unsubscribe ${sub.email}?</h1><p class="lede">You'll stop getting The Watch on Sundays. You can come back any time.</p>
    <form method="post" action="/unsubscribe?t=${t}"><input type="hidden" name="confirm" value="1"><button class="btn btn-primary" type="submit">Unsubscribe</button></form>`);
}
