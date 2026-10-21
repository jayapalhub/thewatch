import { list, token, sha256 } from "./html.js";
import { beehiivSubscribe } from "./integrations.js";
import { CONSENT_VERSION, CITIES, DEFAULT_CITY } from "./constants.js";

// Insert or update a subscriber in D1, then mirror to Beehiiv.
// Returns the subscriber row (with profile_token) so callers can link to /profile.
export async function upsertSubscriber(db, env, { email, source, tags = [], request, sendWelcome = true, extra = {} }) {
  email = email.toLowerCase();
  const ip = request ? (request.headers.get("cf-connecting-ip") || "") : "";
  const ipHash = ip ? (await sha256(ip)).slice(0, 16) : null;
  const existing = await db.prepare("SELECT * FROM subscribers WHERE email=?").bind(email).first();
  const now = new Date().toISOString();
  const m = /^calendar:([a-z]+)$/.exec(source || ""); const city = m && CITIES[m[1]] ? m[1] : null;
  let row;
  if (existing) {
    const mergedTags = Array.from(new Set([...list(existing.tags), ...tags]));
    const status = existing.status === "unsubscribed" ? "active" : existing.status; // re-subscribing by submitting a form is explicit consent
    const profileToken = existing.profile_token || token();
    await db.prepare("UPDATE subscribers SET tags=?, status=?, profile_token=?, consented_at=COALESCE(consented_at, ?), consent_text_version=COALESCE(consent_text_version, ?), city=COALESCE(?, city, ?), unsub_token=COALESCE(unsub_token, ?), updated_at=? WHERE id=?")
      .bind(JSON.stringify(mergedTags), status, profileToken, now, CONSENT_VERSION, city, DEFAULT_CITY, token(), now, existing.id).run();
    row = { ...existing, tags: mergedTags, status, profile_token: profileToken };
  } else {
    const profileToken = token();
    const res = await db.prepare("INSERT INTO subscribers (email, status, source, consent_text_version, consented_at, ip_hash, tags, profile_token, company, first_name, city, unsub_token) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(email, "active", source || null, CONSENT_VERSION, now, ipHash, JSON.stringify(tags), profileToken, extra.company || null, extra.first_name || null, city || DEFAULT_CITY, token()).run();
    row = { id: res.meta.last_row_id, email, status: "active", source, tags, profile_token: profileToken, beehiiv_subscriber_id: null };
  }
  // Mirror to Beehiiv (best effort). Custom field names must exist in Beehiiv: Source, Tags, Company.
  const bh = await beehiivSubscribe(env, { email, source, sendWelcome: sendWelcome && !existing, customFields: { Source: source || "", Tags: row.tags.join(", "), Company: extra.company || "" } });
  if (bh.ok && bh.id && bh.id !== row.beehiiv_subscriber_id) {
    await db.prepare("UPDATE subscribers SET beehiiv_subscriber_id=? WHERE id=?").bind(bh.id, row.id).run();
    row.beehiiv_subscriber_id = bh.id;
  }
  return row;
}

export async function addInterest(db, subscriberId, eventKey) {
  await db.prepare("INSERT OR IGNORE INTO event_interest (subscriber_id, event_key) VALUES (?,?)").bind(subscriberId, eventKey).run();
}

// Simple per-IP rate limit using D1 (good enough for a community site).
export async function rateLimited(db, request, bucket, max = 10, windowMin = 60) {
  try {
    const ip = request.headers.get("cf-connecting-ip") || "local";
    const key = (await sha256(bucket + ":" + ip)).slice(0, 24);
    await db.prepare("CREATE TABLE IF NOT EXISTS rate_limits (k TEXT, at TEXT)").run();
    const since = new Date(Date.now() - windowMin * 60000).toISOString();
    const { n } = await db.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE k=? AND at > ?").bind(key, since).first();
    if (n >= max) return true;
    await db.prepare("INSERT INTO rate_limits (k, at) VALUES (?, ?)").bind(key, new Date().toISOString()).run();
    if (Math.random() < 0.05) await db.prepare("DELETE FROM rate_limits WHERE at < ?").bind(since).run();
    return false;
  } catch (e) { console.error("rate limit check failed", e && e.message); return false; }
}
