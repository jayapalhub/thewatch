// Small text values the admin edits in place. Missing table or row falls back to the default.
export async function getSetting(db, key, fallback = "") {
  try { const r = await db.prepare("SELECT value FROM settings WHERE key=?").bind(key).first(); return r && r.value != null ? r.value : fallback; }
  catch { return fallback; }
}
export async function setSetting(db, key, value) {
  await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')").bind(key, value).run();
}
export const FEATURED_PRICE_KEY = "featured_price_text";
export const FEATURED_PRICE_DEFAULT = ""; // empty: the page says pricing comes by reply until Jerome sets a number in Admin > Jobs > Featured
