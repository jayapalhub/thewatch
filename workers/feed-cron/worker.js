// Tiny scheduled Worker: every Thursday 6:00 AM Pacific it asks the Pages site to pull all feeds.
// Deploy once from the repo root:  cd workers/feed-cron && npx wrangler deploy && npx wrangler secret put ADMIN_TOKEN
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(pull(env)); },
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/run" && request.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`) return new Response(JSON.stringify(await pull(env)), { headers: { "content-type": "application/json" } });
    return new Response("feed-cron ok", { status: 200 });
  },
};
async function pull(env) {
  const r = await fetch(`${env.SITE_URL}/api/feeds/pull`, { method: "POST", headers: { authorization: `Bearer ${env.ADMIN_TOKEN}` } });
  const body = await r.text();
  console.log("feed pull", r.status, body.slice(0, 500));
  return { status: r.status, body: body.slice(0, 2000) };
}
