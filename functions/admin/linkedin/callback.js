import { redirect } from "../../_lib/html.js";
import { finishAuthorization } from "../../_lib/linkedin.js";

// LinkedIn sends the page admin back here after they approve the app. Behind Cloudflare Access like the rest of /admin.
export async function onRequestGet({ request, env, data }) {
  const u = new URL(request.url);
  const back = (m) => redirect("/admin/linkedin?msg=" + encodeURIComponent(m), 303);
  if (u.searchParams.get("error")) return back(`LinkedIn said: ${u.searchParams.get("error_description") || u.searchParams.get("error")}`);
  const code = u.searchParams.get("code"), state = u.searchParams.get("state");
  if (!code) return back("No code came back from LinkedIn. Press Connect again.");
  const r = await finishAuthorization(env.DB, env, { code, state, by: data.user && data.user.email });
  return back(r.error ? r.error : `Connected. The page can post until ${String(r.expires).slice(0, 10)}; you will get an email a week before that to reconnect.`);
}
