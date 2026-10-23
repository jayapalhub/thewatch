import { str, slugify } from "./html.js";
import { ORG_TYPES } from "./constants.js";

export function parseOrgForm(p) {
  const name = str(p.name, 140);
  return {
    name, slug: slugify(str(p.slug, 80) || name), short_name: str(p.short_name, 60) || null,
    type: ORG_TYPES.includes(str(p.type)) ? str(p.type) : "community",
    website: str(p.website, 300) || null, events_url: str(p.events_url, 300) || null,
    contact_name: str(p.contact_name, 100) || null, contact_email: str(p.contact_email, 200) || null, linkedin_url: str(p.linkedin_url, 300) || null,
    logo_url: str(p.logo_url, 300) || null, description: str(p.description, 2000) || null,
    usual_cadence_text: str(p.usual_cadence_text, 200) || null, cadence_rule: str(p.cadence_rule, 200) || null,
    default_venue_name: str(p.default_venue_name, 140) || null, default_venue_address: str(p.default_venue_address, 200) || null,
    cost_notes: str(p.cost_notes, 300) || null, cpe_notes: str(p.cpe_notes, 300) || null, notes: str(p.notes, 4000) || null,
    trusted: str(p.trusted) === "1" ? 1 : 0,
  };
}
export async function insertOrg(db, row) {
  const cols = Object.keys(row);
  const r = await db.prepare(`INSERT INTO organizations (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(...cols.map((c) => row[c])).run();
  return r.meta.last_row_id;
}
export async function updateOrg(db, id, row) {
  const cols = Object.keys(row);
  await db.prepare(`UPDATE organizations SET ${cols.map((c) => `${c}=?`).join(",")}, updated_at=datetime('now') WHERE id=?`).bind(...cols.map((c) => row[c]), id).run();
}
