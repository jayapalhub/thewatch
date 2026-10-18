// Tiny HTML helpers shared by every page.
// `html` is a tagged template: interpolated values are escaped unless wrapped in raw().

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export function raw(s) { return new Raw(s == null ? "" : String(s)); }

export function html(strings, ...values) {
  let out = "";
  strings.forEach((str, i) => {
    out += str;
    if (i < values.length) {
      const v = values[i];
      if (v instanceof Raw) out += v.s;
      else if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.s : esc(x))).join("");
      else if (v === false || v == null) out += "";
      else out += esc(v);
    }
  });
  return new Raw(out);
}

export function page(body, status = 200, headers = {}) {
  return new Response(String(body), {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export function redirect(location, status = 302) {
  return new Response(null, { status, headers: { Location: location } });
}

export function notFound(msg = "Not found") {
  return new Response(msg, { status: 404, headers: { "Content-Type": "text/plain" } });
}

export async function readForm(request) {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { return await request.json(); } catch { return {}; }
  }
  const fd = await request.formData();
  const out = {};
  for (const [k, v] of fd.entries()) {
    if (k in out) { out[k] = [].concat(out[k], v); } else { out[k] = v; }
  }
  return out;
}

export function str(v, max = 2000) {
  if (Array.isArray(v)) v = v[0];
  return (typeof v === "string" ? v : v == null ? "" : String(v)).trim().slice(0, max);
}

export function list(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try { const j = JSON.parse(v); if (Array.isArray(j)) return j.map(String); } catch {}
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "")
    .trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 80) || "item";
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function token(len = 24) {
  const a = new Uint8Array(len); crypto.getRandomValues(a);
  return [...a].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}
