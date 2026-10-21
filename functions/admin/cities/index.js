import { html, page, raw, readForm, redirect, str } from "../../_lib/html.js";
import { adminShell, flash } from "../../_lib/admin.js";
import { loadCities } from "../../_lib/constants.js";

const KINDS = { organizer: "Organizer", search: "Search", listing: "Listing" };

export async function onRequestGet({ request, env, data }) {
  const msg = new URL(request.url).searchParams.get("msg");
  const { results: cities } = await env.DB.prepare("SELECT * FROM cities ORDER BY sort, name").all();
  const { results: targets } = await env.DB.prepare("SELECT * FROM sweep_targets ORDER BY city, active DESC, kind, name").all();
  const byCity = {}; for (const t of targets) (byCity[t.city] = byCity[t.city] || []).push(t);
  const cityOpts = cities.map((c) => c.slug).concat("virtual");
  const body = html`${flash(msg)}
  <p>A city is a row here. Add one and it appears in the navigation, gets its own calendar at /&lt;slug&gt;, shows on the home page chooser, and the Friday sweep researches it using the targets below. Pause a city to hide it without losing anything.</p>
  <h2>Cities</h2>
  <table class="a-table"><thead><tr><th>City</th><th>Region</th><th>Newsletter</th><th>Sort</th><th></th></tr></thead><tbody>
  ${cities.map((c) => html`<tr class="${c.active ? "" : "a-dim"}">
    <td><strong>${c.name}</strong> <small class="a-muted">/${c.slug}</small><br><small class="a-muted">${c.title}</small></td>
    <td>${c.region}<br><small class="a-muted">${c.sweep_notes || ""}</small></td>
    <td>${c.newsletter || html`<span class="a-muted">none yet</span>`}</td><td>${c.sort}</td>
    <td><form method="post" class="a-inline"><input type="hidden" name="slug" value="${c.slug}">
      <button class="a-btn" name="action" value="toggle_city">${c.active ? "Pause" : "Activate"}</button>
      <a class="a-btn a-btn-link" href="/${c.slug}" target="_blank">View</a></form></td>
  </tr>`)}</tbody></table>
  <h2>Add a city</h2>
  <form method="post" class="a-form"><input type="hidden" name="action" value="add_city">
    <div class="a-grid-3">
      <label>Slug <small>(one lowercase word)</small><input name="slug" required pattern="[a-z]{3,30}" placeholder="losangeles"></label>
      <label>Name<input name="name" required maxlength="60" placeholder="Los Angeles"></label>
      <label>Region line<input name="region" required maxlength="120" placeholder="Los Angeles and Orange County"></label>
    </div>
    <div class="a-grid-3">
      <label>Time zone<input name="timezone" value="America/Los_Angeles"></label>
      <label>Sort<input type="number" name="sort" value="100"></label>
      <label>Newsletter<select name="newsletter"><option value="">None yet</option><option value="sunday">Sunday email</option></select></label>
    </div>
    <label>Meta description<input name="description" maxlength="200" placeholder="Every cybersecurity, AI security, privacy and audit event in Los Angeles and Orange County, in one calendar."></label>
    <label>Sweep notes <small>(geography and search hints for the weekly research)</small><textarea name="sweep_notes" rows="2" placeholder="Geography: Los Angeles and Orange County. Meetup search within 30 miles of Los Angeles and of Irvine."></textarea></label>
    <div class="a-actions"><button class="a-btn a-btn-primary">Add city</button></div>
  </form>

  <h2>Sweep targets</h2>
  <p class="a-muted">Where the Friday research looks for each calendar. Organizers with events pages, searches to run, and listings to read. The sweep also checks every organizer already on the calendar for that city.</p>
  ${cityOpts.map((slug) => html`
  <h3>${slug}</h3>
  <table class="a-table"><thead><tr><th>Target</th><th>Kind</th><th>Notes</th><th></th></tr></thead><tbody>
  ${(byCity[slug] || []).map((t) => html`<tr class="${t.active ? "" : "a-dim"}">
    <td><strong>${t.name}</strong>${t.url ? html`<br><small><a href="${t.url}" target="_blank" rel="noopener">${t.url.length > 70 ? t.url.slice(0, 70) + "…" : t.url}</a></small>` : ""}</td>
    <td>${KINDS[t.kind] || t.kind}</td><td><small>${t.notes || ""}</small></td>
    <td><form method="post" class="a-inline"><input type="hidden" name="id" value="${t.id}">
      <button class="a-btn" name="action" value="toggle_target">${t.active ? "Pause" : "Resume"}</button>
      <button class="a-btn a-btn-danger" name="action" value="delete_target" onclick="return confirm('Remove this target?')">Remove</button></form></td>
  </tr>`)}
  ${!(byCity[slug] || []).length ? html`<tr><td colspan="4" class="a-muted">No targets yet.</td></tr>` : ""}
  </tbody></table>`)}
  <h2>Add a target</h2>
  <form method="post" class="a-form"><input type="hidden" name="action" value="add_target">
    <div class="a-grid-3">
      <label>Calendar<select name="city">${cityOpts.map((s) => html`<option>${s}</option>`)}</select></label>
      <label>Kind<select name="kind">${Object.entries(KINDS).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
      <label>Name<input name="name" required maxlength="120" placeholder="ISACA Los Angeles Chapter"></label>
    </div>
    <div class="a-grid-2">
      <label>URL <small>(events page, calendar or search)</small><input type="url" name="url" maxlength="500"></label>
      <label>Notes <small>(cadence, login walls, what to skip)</small><input name="notes" maxlength="300"></label>
    </div>
    <div class="a-actions"><button class="a-btn a-btn-primary">Add target</button></div>
  </form>`;
  return page(adminShell({ title: "Cities and sweep targets", body, path: "/admin/cities", user: data.user }));
}

export async function onRequestPost({ request, env }) {
  const p = await readForm(request);
  const action = str(p.action);
  const db = env.DB;
  if (action === "add_city") {
    const slug = str(p.slug, 30).toLowerCase();
    if (!/^[a-z]{3,30}$/.test(slug) || slug === "virtual") return redirect("/admin/cities?msg=" + encodeURIComponent("Slug must be one lowercase word"));
    const name = str(p.name, 60), region = str(p.region, 120);
    if (!name || !region) return redirect("/admin/cities?msg=" + encodeURIComponent("Name and region are required"));
    await db.prepare("INSERT INTO cities (slug, name, title, region, timezone, description, empty_copy, sweep_notes, newsletter, sort) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(slug) DO NOTHING")
      .bind(slug, name, `The Watch ${name}`, region, str(p.timezone, 60) || "America/Los_Angeles",
        str(p.description, 200) || `Every cybersecurity, AI security, privacy and audit event in ${region}, in one calendar.`,
        `The ${name} calendar is new and filling up. Organizers can submit events and they appear here once approved.`,
        str(p.sweep_notes, 1000) || null, str(p.newsletter, 20) || null, parseInt(str(p.sort), 10) || 100).run();
    await loadCities(db, { force: true });
    return redirect("/admin/cities?msg=" + encodeURIComponent(`Added ${name}. It is live at /${slug}.`));
  }
  if (action === "toggle_city") { await db.prepare("UPDATE cities SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE slug=?").bind(str(p.slug, 30)).run(); await loadCities(db, { force: true }); return redirect("/admin/cities?msg=Updated"); }
  if (action === "add_target") {
    const name = str(p.name, 120); if (!name) return redirect("/admin/cities?msg=Name+required");
    await db.prepare("INSERT INTO sweep_targets (city, kind, name, url, notes) VALUES (?,?,?,?,?)")
      .bind(str(p.city, 30), KINDS[str(p.kind)] ? str(p.kind) : "organizer", name, str(p.url, 500) || null, str(p.notes, 300) || null).run();
    return redirect("/admin/cities?msg=" + encodeURIComponent(`Added target ${name}`));
  }
  const id = parseInt(str(p.id), 10);
  if (action === "toggle_target" && id) { await db.prepare("UPDATE sweep_targets SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?").bind(id).run(); return redirect("/admin/cities?msg=Updated"); }
  if (action === "delete_target" && id) { await db.prepare("DELETE FROM sweep_targets WHERE id=?").bind(id).run(); return redirect("/admin/cities?msg=Removed"); }
  return redirect("/admin/cities");
}
