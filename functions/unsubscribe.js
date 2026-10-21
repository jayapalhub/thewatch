import { html, page } from "./_lib/html.js";
import { shell } from "./_lib/layout.js";

// One click unsubscribe. GET (link in the email) and POST (List-Unsubscribe-Post from mail clients) both work.
async function unsubscribe(env, t) {
  if (!/^[a-f0-9]{16,64}$/i.test(t || "")) return null;
  const sub = await env.DB.prepare("SELECT id, email, status FROM subscribers WHERE unsub_token=?").bind(t).first();
  if (!sub) return null;
  if (sub.status !== "unsubscribed") await env.DB.prepare("UPDATE subscribers SET status='unsubscribed', updated_at=datetime('now') WHERE id=?").bind(sub.id).run();
  return sub;
}
export async function onRequestPost({ request, env }) {
  const t = new URL(request.url).searchParams.get("t");
  await unsubscribe(env, t);
  return new Response("OK", { status: 200 });
}
export async function onRequestGet({ request, env }) {
  const t = new URL(request.url).searchParams.get("t");
  const sub = t === "preview" ? { preview: true } : await unsubscribe(env, t);
  const body = html`<section class="hero hero-short"><div class="wrap narrow">
    ${sub && sub.preview ? html`<h1>This is the preview copy.</h1><p class="lede">Subscribers get a personal unsubscribe link here.</p>`
    : sub ? html`<h1>You're unsubscribed.</h1><p class="lede">${sub.email} will not get the weekly email any more. Changed your mind? <a href="/subscribe">Subscribe again</a> whenever you like.</p>`
    : html`<h1>That link isn't valid.</h1><p class="lede">It may have been used already or copied incompletely. Email <a href="mailto:watch@bettersecurity.ai?subject=Unsubscribe">watch@bettersecurity.ai</a> and we'll take care of it.</p>`}
  </div></section>`;
  return page(shell({ title: "Unsubscribe", body, path: "/unsubscribe" }), 200, { "Cache-Control": "private, no-store" });
}
