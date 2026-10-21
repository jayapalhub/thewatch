import { subscriberByRefCode, refCookie, validCode } from "../_lib/referrals.js";
import { CITIES } from "../_lib/constants.js";

// Public share link: /r/<ref_code>. Remembers the referrer for 30 days and lands on the subscribe page for their city.
// Nothing about the referrer is shown to the visitor.
export async function onRequestGet({ params, env }) {
  const code = String(params.code || "").toLowerCase();
  let ref = null;
  if (validCode(code)) { try { ref = await subscriberByRefCode(env.DB, code); } catch { ref = null; } }
  const city = ref && CITIES[ref.city] ? ref.city : "";
  const headers = new Headers({ Location: `/subscribe?src=referral${city ? `&city=${city}` : ""}`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  if (ref && ref.status === "active") headers.append("Set-Cookie", refCookie(code));
  return new Response(null, { status: 302, headers });
}
