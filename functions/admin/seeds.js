import { json, readForm, str } from "../_lib/html.js";
import { SEEDS } from "../_lib/seeds/index.js";

// City launch seeds: SQL statements generated from research and committed under functions/_lib/seeds/.
// The statements come from the deployed bundle only, never from the request, and every one is idempotent
// (INSERT OR IGNORE, or INSERT ... WHERE NOT EXISTS), so running a seed twice changes nothing.
// GET lists the seeds; POST name=<seed> runs one and returns how many statements changed a row and any errors.
export async function onRequestGet() {
  return json({ seeds: Object.fromEntries(Object.entries(SEEDS).map(([k, v]) => [k, v.length])) });
}
export async function onRequestPost({ request, env }) {
  const p = await readForm(request);
  const name = str(p.name, 60);
  const stmts = SEEDS[name];
  if (!stmts) return json({ ok: false, error: "unknown seed" }, 404);
  let changed = 0, ran = 0; const errors = [];
  for (let i = 0; i < stmts.length; i += 25) {
    const group = stmts.slice(i, i + 25);
    try {
      const res = await env.DB.batch(group.map((s) => env.DB.prepare(s)));
      for (const r of res) changed += r.meta && r.meta.changes ? 1 : 0;
      ran += group.length;
    } catch (e) {
      // A batch is one transaction: on failure run the group one by one so the good statements still land.
      for (const s of group) {
        try { const r = await env.DB.prepare(s).run(); changed += r.meta && r.meta.changes ? 1 : 0; ran++; }
        catch (err) { errors.push({ sql: s.slice(0, 160), error: String(err && err.message || err).slice(0, 200) }); }
      }
    }
  }
  return json({ ok: errors.length === 0, name, statements: stmts.length, ran, changed, errors });
}
