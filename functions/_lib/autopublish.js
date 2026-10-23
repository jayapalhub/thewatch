// Publish by default. Pending rows whose auto_publish_at has passed go live on their own,
// unless they are held, rejected, missing a registration link, or already in the past.
// Called from a daily cron and lazily from calendar page views, so it works even if the cron is down.
import { isPreview } from "./env.js";

export const DEFAULT_HOLD_HOURS = 24;

export function autoPublishAt(hours = DEFAULT_HOLD_HOURS, from = new Date()) {
  return new Date(from.getTime() + hours * 3600000).toISOString().slice(0, 19).replace("T", " ");
}

export async function runAutoPublish(db) {
  const { results } = await db.prepare(
    `SELECT id, title, city FROM events WHERE status='pending_review' AND hold=0 AND auto_publish_at IS NOT NULL AND auto_publish_at <= datetime('now')
       AND registration_url IS NOT NULL AND start_utc > strftime('%Y-%m-%dT%H:%M:%fZ','now') LIMIT 600`).all();
  if (!results.length) return { published: 0, items: [] };
  await db.batch(results.map((r) => db.prepare("UPDATE events SET status='published', published_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), reviewer_notes=COALESCE(reviewer_notes,'') || ' Auto published ' || date('now') || '.' WHERE id=? AND status='pending_review'").bind(r.id)));
  return { published: results.length, items: results };
}

// Cheap lazy trigger for page views: at most one check per worker instance per 10 minutes.
let lastLazy = 0;
// env is optional for older callers; pages pass it so a preview deployment never publishes on a visit.
export function lazyAutoPublish(db, waitUntil, env = null) {
  if (isPreview(env)) return;
  const now = Date.now();
  if (now - lastLazy < 600000) return;
  lastLazy = now;
  const p = runAutoPublish(db).catch(() => {});
  if (waitUntil) waitUntil(p);
}
