// Change detection for sweep targets. Each hourly tick fetches a few target pages (within whatever request budget the
// board run left), reduces each to its visible text, hashes it, and records when the hash last moved. The Friday
// sweep then researches only targets that changed since it last looked, plus search targets and never checked ones.
// Page chrome that changes on every load (dates in footers, nonces, view counters) is trimmed before hashing so a
// stable page stays stable.
const TIMEOUT_MS = 8000;

export function pageSignature(html) {
  let t = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ").replace(/<(?:svg|head)[\s\S]*?<\/(?:svg|head)>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
  t = t.replace(/\b(?:nonce|csrf|token|session|cache|build|hash)[=:]\s*[A-Za-z0-9_-]{8,}/gi, " ")
    .replace(/\b[0-9a-f]{24,}\b/gi, " ")                       // ids and hashes
    .replace(/\b(?:19|20)\d\d-\d\d-\d\dT[\d:.]+Z?\b/g, " ")       // timestamps
    .replace(/\bcopyright\b[^.]{0,60}/gi, " ").replace(/©[^.]{0,40}/g, " ")
    .replace(/\b\d{1,3}(?:,\d{3})*\s*(?:views|members|attendees|going|followers)\b/gi, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
  return t;
}
async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function refreshTargets(db, { max = 6, fetcher = fetch, now = new Date() } = {}) {
  const out = { checked: 0, changed: 0, errors: 0 };
  if (max <= 0) return out;
  const { results } = await db.prepare("SELECT id, url, content_hash FROM sweep_targets WHERE active=1 AND has_feed=0 AND url LIKE 'http%' AND (content_checked_at IS NULL OR content_checked_at < datetime('now', '-20 hours')) ORDER BY content_checked_at IS NOT NULL, content_checked_at, id LIMIT ?").bind(max).all();
  for (const t of results) {
    let html = null, err = null;
    try {
      const r = await fetcher(t.url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; TheWatchBot/1.0; +https://bettersecurity.ai/about)", Accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(TIMEOUT_MS), cf: { cacheTtl: 0 } });
      if (!r.ok) err = `HTTP ${r.status}`; else html = await r.text();
    } catch (e) { err = String(e && e.message || e).slice(0, 120); }
    out.checked++;
    if (err) { out.errors++; await db.prepare("UPDATE sweep_targets SET content_checked_at=datetime('now'), fetch_error=? WHERE id=?").bind(err, t.id).run(); continue; }
    const sig = pageSignature(html);
    const hash = await sha256(sig.slice(0, 200000));
    const changed = !t.content_hash || t.content_hash !== hash;
    if (changed) out.changed++;
    await db.prepare(`UPDATE sweep_targets SET content_hash=?, content_checked_at=datetime('now'), fetch_error=NULL${changed ? ", content_changed_at=datetime('now')" : ""} WHERE id=?`).bind(hash, t.id).run();
  }
  return out;
}
