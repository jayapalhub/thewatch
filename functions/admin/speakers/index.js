import { html, page, redirect, readForm, str } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { cityOf } from "../../_lib/constants.js";
import { todayKey } from "../../_lib/dates.js";
import { buildSpeakers, loadOverrides, resolveKey, nameKey, looseKey, bySurname } from "../../_lib/speakers.js";

// Speakers tab: the board is parsed live from events.speakers. Here Jerome merges two spellings of one person
// and hides names that should not be on the board (a company, a team, a parsing slip, or a person who asked).
export async function onRequestGet({ request, env, data }) {
  const u = new URL(request.url);
  const q = (u.searchParams.get("q") || "").trim().toLowerCase().slice(0, 80);
  const today = todayKey();
  const [speakers, rawList, overrides] = await Promise.all([buildSpeakers(env.DB), buildSpeakers(env.DB, { raw: true }), loadOverrides(env.DB)]);
  const nameOf = new Map(rawList.map((s) => [s.key, s.name]));
  speakers.sort(bySurname);

  // Likely duplicates: same name once single letter middle initials are dropped ("Morey Haber" and "Morey J. Haber").
  const byLoose = new Map();
  for (const s of speakers) { const k = looseKey(s.key); byLoose.set(k, (byLoose.get(k) || []).concat(s)); }
  const dupes = [...byLoose.values()].filter((g) => g.length > 1);

  const shown = q ? speakers.filter((s) => s.key.includes(q) || s.spellings.some((n) => n.toLowerCase().includes(q)) || (s.affiliation || "").toLowerCase().includes(q)) : speakers;
  const merges = [...overrides.values()].filter((o) => o.action === "merge");
  const hides = [...overrides.values()].filter((o) => o.action === "hide");
  const cities = (s) => [...new Set(s.events.map((e) => (cityOf(e.city) || {}).name || e.city))].join(", ");
  const nextOf = (s) => s.events.filter((e) => e.start_at.slice(0, 10) >= today).map((e) => e.start_at).sort()[0];
  const mergeBtn = (from, into) => html`<form method="post" class="a-inline"><input type="hidden" name="action" value="merge"><input type="hidden" name="from" value="${from.key}"><input type="hidden" name="into" value="${into.key}"><button class="a-btn a-btn-small">Use ${into.name}</button></form>`;

  const body = html`${flash(u.searchParams.get("msg"))}
  <p class="a-muted">${speakers.length} people across every published event, parsed from the Speakers field. Public pages: ${["sandiego", "sanjose"].filter((c) => cityOf(c)).map((c) => html`<a href="/${c}/speakers" target="_blank">/${c}/speakers</a> `)}<a href="/virtual/speakers" target="_blank">/virtual/speakers</a>. Names only; no photos, bios or contact details. Merging keeps the spelling you pick and folds the other one's events into it.</p>
  ${dupes.length ? html`<h2>Possible duplicates (${dupes.length})</h2>
  <table class="a-table"><thead><tr><th>Spellings</th><th>Keep which</th></tr></thead><tbody>
  ${dupes.map((g) => html`<tr><td>${g.map((s) => html`${s.name} <small>(${s.events.length})</small><br>`)}</td><td>${g.map((into) => g.filter((x) => x !== into).map((from) => mergeBtn(from, into)))}</td></tr>`)}
  </tbody></table>` : ""}
  <form class="a-toolbar" method="get"><input type="search" name="q" value="${q}" placeholder="Name or affiliation"><button class="a-btn">Filter</button></form>
  <datalist id="spk-names">${speakers.map((s) => html`<option value="${s.name}">`)}</datalist>
  <table class="a-table"><thead><tr><th>Name</th><th>Affiliation</th><th>Events</th><th>Where</th><th>Next</th><th>Merge into</th><th></th></tr></thead><tbody>
  ${shown.map((s) => html`<tr>
    <td><strong>${s.name}</strong>${s.spellings.length > 1 ? html`<br><small>also: ${s.spellings.filter((n) => n !== s.name).join(", ")}</small>` : ""}</td>
    <td><small>${s.affiliation || ""}</small></td>
    <td>${s.events.length}</td>
    <td><small>${cities(s)}</small></td>
    <td class="a-nowrap"><small>${(nextOf(s) || "").slice(0, 10)}</small></td>
    <td><form method="post" class="a-inline"><input type="hidden" name="action" value="merge"><input type="hidden" name="from" value="${s.key}"><input name="into" list="spk-names" placeholder="Other spelling" required size="18"> <button class="a-btn a-btn-small">Merge</button></form></td>
    <td><form method="post" class="a-inline"><input type="hidden" name="action" value="hide"><input type="hidden" name="key" value="${s.key}"><button class="a-btn a-btn-small a-btn-danger">Hide</button></form></td>
  </tr>`)}
  </tbody></table>
  ${merges.length || hides.length ? html`<h2>Your changes</h2>
  <table class="a-table"><thead><tr><th>Name</th><th>Change</th><th>When</th><th></th></tr></thead><tbody>
  ${merges.concat(hides).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((o) => html`<tr>
    <td>${nameOf.get(o.name_key) || o.name_key}</td>
    <td>${o.action === "hide" ? "Hidden from the board" : html`Merged into ${nameOf.get(o.target_key) || o.target_key}`}</td>
    <td class="a-nowrap"><small>${o.created_at.slice(0, 10)}</small></td>
    <td><form method="post" class="a-inline"><input type="hidden" name="action" value="undo"><input type="hidden" name="key" value="${o.name_key}"><button class="a-btn a-btn-small">Undo</button></form></td>
  </tr>`)}
  </tbody></table>` : ""}`;
  return page(adminShell({ title: `Speakers (${speakers.length})`, body, path: "/admin/speakers", user: data.user }));
}

export async function onRequestPost({ request, env, data }) {
  const p = await readForm(request);
  const db = env.DB, action = str(p.action);
  const back = (m) => redirect("/admin/speakers?msg=" + encodeURIComponent(m), 303);
  const by = String((data.user && (data.user.email || data.user)) || "admin").slice(0, 120);
  const overrides = await loadOverrides(db);
  if (action === "hide") {
    const key = nameKey(str(p.key, 120));
    if (!key) return back("Nothing to hide.");
    await db.prepare("INSERT OR REPLACE INTO speaker_overrides (name_key, action, target_key, created_by) VALUES (?, 'hide', NULL, ?)").bind(key, by).run();
    return back("Hidden from the speaker board. Undo it under Your changes.");
  }
  if (action === "merge") {
    const from = nameKey(str(p.from, 120));
    const into = resolveKey(nameKey(str(p.into, 120)), overrides);
    if (!from || !into) return back("Pick a name to merge into.");
    if (into === resolveKey(from, overrides)) return back("Those are already the same person.");
    const known = (await buildSpeakers(db)).some((s) => s.key === into);
    if (!known) return back(`No speaker called "${str(p.into, 120)}" is on the board.`);
    await db.prepare("INSERT OR REPLACE INTO speaker_overrides (name_key, action, target_key, created_by) VALUES (?, 'merge', ?, ?)").bind(from, into, by).run();
    return back("Merged.");
  }
  if (action === "undo") {
    await db.prepare("DELETE FROM speaker_overrides WHERE name_key=?").bind(nameKey(str(p.key, 120))).run();
    return back("Undone.");
  }
  return back("Unknown action.");
}
