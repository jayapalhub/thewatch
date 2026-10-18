import { requireAdmin } from "../_lib/auth.js";

export async function onRequest(context) {
  const user = await requireAdmin(context);
  if (!user) return new Response("Sign in through Cloudflare Access to use the admin.", { status: 401, headers: { "Content-Type": "text/plain" } });
  context.data.user = user;
  const resp = await context.next();
  resp.headers.set("Cache-Control", "no-store");
  return resp;
}
