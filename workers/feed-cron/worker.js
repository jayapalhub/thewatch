// Scheduled Worker for The Watch.
//   Thursday 13:00 UTC: ask the Pages site to pull all feeds.
//   Every hour:         publish pending rows whose 24 hour hold has passed, and send due event reminders.
//   Weekends, every 10 minutes 13:00 to 20:00 UTC: newsletter previews (Saturday 8 AM local) and sends (Sunday 8 AM local).
// Deploy once from the repo root:  cd workers/feed-cron && npx wrangler deploy && npx wrangler secret put ADMIN_TOKEN
export default {
  async scheduled(event, env, ctx) {
    const path = event.cron === "0 13 * * THU" ? "/api/feeds/pull" : event.cron === "0 * * * *" ? "/api/events/autopublish" : "/api/newsletter/tick";
    ctx.waitUntil(call(env, path));
  },
  async fetch(request, env) {
    const u = new URL(request.url);
    if (request.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`) {
      if (u.pathname === "/run") return new Response(JSON.stringify(await call(env, "/api/feeds/pull")), { headers: { "content-type": "application/json" } });
      if (u.pathname === "/newsletter") return new Response(JSON.stringify(await call(env, "/api/newsletter/tick")), { headers: { "content-type": "application/json" } });
      if (u.pathname === "/publish") return new Response(JSON.stringify(await call(env, "/api/events/autopublish")), { headers: { "content-type": "application/json" } });
    }
    return new Response("feed-cron ok", { status: 200 });
  },
};
async function call(env, path) {
  const r = await fetch(`${env.SITE_URL}${path}`, { method: "POST", headers: { authorization: `Bearer ${env.ADMIN_TOKEN}` } });
  const body = await r.text();
  console.log(path, r.status, body.slice(0, 500));
  return { path, status: r.status, body: body.slice(0, 2000) };
}
