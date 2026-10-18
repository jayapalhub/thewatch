// Admin authentication.
// Production: Cloudflare Access sits in front of /admin and sets the
// Cf-Access-Jwt-Assertion header; we verify the JWT signature and audience
// so the Functions never trust a header alone. Scripts can use
// Authorization: Bearer <ADMIN_TOKEN>. Local dev: DEV_MODE=1 bypasses.

let certCache = { keys: null, fetchedAt: 0 };

function b64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function getKeys(teamDomain) {
  const now = Date.now();
  if (certCache.keys && now - certCache.fetchedAt < 60 * 60 * 1000) return certCache.keys;
  const resp = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!resp.ok) throw new Error("access certs fetch failed");
  const j = await resp.json();
  certCache = { keys: j.keys || [], fetchedAt: now };
  return certCache.keys;
}

export async function verifyAccessJwt(token, env) {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const header = JSON.parse(new TextDecoder().decode(b64url(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64url(p)));
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  const keys = await getKeys(env.ACCESS_TEAM_DOMAIN);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
  return ok ? payload : null;
}

export async function requireAdmin(context) {
  const { request, env } = context;
  if (env.DEV_MODE === "1") return { email: "dev@local" };
  const auth = request.headers.get("authorization") || "";
  if (env.ADMIN_TOKEN && auth === `Bearer ${env.ADMIN_TOKEN}`) return { email: "script" };
  const jwt = request.headers.get("cf-access-jwt-assertion");
  if (jwt && env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    try { const p = await verifyAccessJwt(jwt, env); if (p) return { email: p.email }; } catch (e) { console.error("access verify failed", e && e.message); }
  }
  return null;
}
