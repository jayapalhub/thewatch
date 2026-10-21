// Speaker board. Built on request from events.speakers across published events; nothing is stored except the
// admin's merges and hides (speaker_overrides). Names only: no photos, bios or contact details. The affiliation
// shown is the one printed next to the name on the most recent event, exactly as the organizer listed it.
//
// The field is free text from feeds and organizers, e.g.
//   "Fahad Diwan (Exterro); Lamarr Henry, Rohan Sharma (Figma); Brandon Dunlap (moderator)"
// so we split into segments on semicolons and pipes (outside parentheses), lift the parenthetical out as the
// affiliation (or drop it when it is a role like moderator), then split each segment on commas, "and" and "&".
// Pieces that do not look like a person's name (teams, companies, job titles, credentials) are dropped.
import { SHOW_BS_EVENTS } from "./constants.js";

const ROLE_RE = /^(moderator|co-?moderator|host|co-?host|keynote|keynote speaker|panelist|chair|emcee|mc|facilitator|presenter|speaker|day \d+( keynote)?)$/i;
const HONORIFIC_RE = /^(dr|col|prof|mr|ms|mrs|sir|lt|capt|gen|hon)\.?\s+/i;
const PARTICLES = new Set(["de", "da", "das", "dos", "do", "del", "della", "di", "du", "van", "von", "der", "den", "la", "le", "bin", "al", "el", "y", "e", "ter", "ten"]);
const NOT_A_PERSON = /\b(team|teams|experts?|leaders|speakers|announced|collaborators|members|membership|staff|panel|group|labs?|security|research|inc|llc|ltd|company|university|institute|agency|department|office|committee|vp|svp|evp|ceo|cto|ciso|cio|cfo|coo|cso|president|director|manager|engineer|officer|head|lead|senior|sr|principal|analyst|consultant|founder|partner|chief|specialist|architect|marketing|product|sales|intelligence|incident|response|consulting|solutions|systems|networks|technologies|partners|services|global|federal|cloud|software|association|chapter|foundation|council|the|tbd|tba)\b/i;

// Split on a separator only at parenthesis depth 0.
function splitTop(s, seps) {
  const out = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && seps.includes(ch)) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
export function looksLikePerson(name) {
  if (/\p{L}{2}/u.test(name) && name === name.toUpperCase() && /\s/.test(name)) name = titleCase(name); // "JANE DOE"
  const bare = name.replace(HONORIFIC_RE, "");
  const words = bare.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  if (/\d/.test(bare) || NOT_A_PERSON.test(bare)) return false;
  for (const w of words) {
    if (PARTICLES.has(w)) continue;
    if (/^\p{Ll}'\p{Lu}/u.test(w)) continue;                       // d'Eon
    if (!/^\p{Lu}/u.test(w)) return false;                          // "leaders from EY", "industry collaborators"
    if (!/\./.test(w) && w.length > 2 && w === w.toUpperCase() && /\p{L}{3}/u.test(w)) return false; // CISSP, IBM (two capitals pass as initials: VJ)
    const rest = w.replace(/^(Mc|Mac|O'|D'|De|Di|Da|La|Le|Van|Von)(?=\p{Lu})/u, "");
    if (/\p{Ll}\p{Lu}/u.test(rest)) return false;                  // LevelBlue, SpiderLabs
  }
  return true;
}

// "Fahad Diwan (Exterro); Lamarr Henry, Rohan Sharma (Figma)" -> [{ name, affiliation }, ...]
// A parenthetical belongs to the name it follows; names before it in the same segment with none of their own share it
// ("Lamarr Henry, Rohan Sharma (Figma)"), names after it do not ("Morey Haber (BeyondTrust) and Jane Doe").
export function parseSpeakers(raw) {
  if (!raw) return [];
  const out = [];
  for (const seg of splitTop(String(raw).replace(/\s*\|\s*/g, ";"), [";"])) {
    const parens = [];
    const masked = seg.replace(/\(([^()]*)\)/g, (_, inner) => `\u0000${parens.push(inner.trim()) - 1}\u0000`);
    const pieces = masked.split(/\s*,\s*|\s+and\s+|\s*&\s*/i).map((piece) => {
      let affiliation = null;
      const text = piece.replace(/\u0000(\d+)\u0000/g, (_, i) => { const v = parens[+i]; if (v && !ROLE_RE.test(v) && !affiliation) affiliation = v; return " "; });
      return { name: text.replace(/\s+/g, " ").trim().replace(/[,;:]+$/, ""), affiliation };
    });
    for (let i = pieces.length - 2; i >= 0; i--) if (!pieces[i].affiliation && !/\u0000/.test(masked.split(/\s*,\s*|\s+and\s+|\s*&\s*/i)[i])) pieces[i].affiliation = pieces[i + 1].affiliation;
    for (const p of pieces) if (p.name && looksLikePerson(p.name)) out.push(p);
  }
  return out;
}

// Grouping key: case, accents, honorifics, periods and extra spaces do not matter.
export function nameKey(name) {
  return String(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(HONORIFIC_RE, "")
    .toLowerCase().replace(/\./g, " ").replace(/[^a-z0-9' -]/g, "").replace(/\s+/g, " ").trim();
}
// Looser key used only to suggest merges: drops single letter middle initials ("morey j haber" -> "morey haber").
export function looseKey(key) {
  const w = key.split(" "); const kept = w.filter((x, i) => x.length > 1 || i === 0 || i === w.length - 1);
  return kept.join(" ");
}

export async function loadOverrides(db) {
  try { const { results } = await db.prepare("SELECT * FROM speaker_overrides").all(); return new Map(results.map((r) => [r.name_key, r])); }
  catch { return new Map(); } // table missing before the migration
}

// Follow merges to the final key; null when the name (or what it merges into) is hidden.
export function resolveKey(key, overrides) {
  const seen = new Set();
  while (key && !seen.has(key)) {
    seen.add(key);
    const o = overrides.get(key);
    if (!o) return key;
    if (o.action === "hide") return null;
    key = o.target_key;
  }
  return key || null;
}

// All speakers for a city (or every city when city is null). Each: { key, name, affiliation, events (newest first) }.
// raw: true also returns hidden names and the unresolved variants, for the admin.
export async function buildSpeakers(db, { city = null, raw = false } = {}) {
  const where = ["e.status = 'published'", "e.speakers IS NOT NULL", "trim(e.speakers) != ''"]; const args = [];
  if (city) { where.push("e.city = ?"); args.push(city); }
  if (!SHOW_BS_EVENTS) where.push("COALESCE(o.slug, '') != 'better-security'");
  const { results: events } = await db.prepare(`SELECT e.id, e.slug, e.title, e.city, e.start_at, e.end_at, e.speakers, COALESCE(o.short_name, o.name) AS org_display
    FROM events e LEFT JOIN organizations o ON o.id = e.organization_id WHERE ${where.join(" AND ")} ORDER BY e.start_at DESC`).bind(...args).all();
  const overrides = raw ? new Map() : await loadOverrides(db);
  const groups = new Map();
  for (const e of events) {
    const inEvent = new Set();
    for (const p of parseSpeakers(e.speakers)) {
      const own = nameKey(p.name);
      const key = resolveKey(own, overrides);
      if (!key || inEvent.has(key)) continue;
      inEvent.add(key);
      let g = groups.get(key);
      if (!g) { g = { key, spellings: new Map(), affiliation: null, events: [] }; groups.set(key, g); }
      const s = g.spellings.get(p.name) || { n: 0, own, latest: e.start_at };
      s.n++; g.spellings.set(p.name, s);
      if (!g.affiliation && p.affiliation) g.affiliation = p.affiliation; // events are newest first
      g.events.push(e);
    }
  }
  return [...groups.values()].map((g) => {
    // Display the spelling of the name the others were merged into; among those, the most used, then the most recent.
    const all = [...g.spellings.entries()].map(([name, s]) => ({ name, ...s }));
    const pool = all.some((s) => s.own === g.key) ? all.filter((s) => s.own === g.key) : all;
    const shout = (n) => (n === n.toUpperCase() ? 1 : 0); // prefer "Jane Doe" over "JANE DOE"
    pool.sort((a, b) => shout(a.name) - shout(b.name) || b.n - a.n || b.latest.localeCompare(a.latest));
    return { key: g.key, name: pool[0].name, spellings: all.map((s) => s.name), affiliation: g.affiliation, events: g.events };
  });
}

// Sort helper: last name, then first.
export function bySurname(a, b) {
  const sk = (n) => { const w = n.replace(HONORIFIC_RE, "").split(" "); return `${w[w.length - 1]} ${w.slice(0, -1).join(" ")}`.toLowerCase(); };
  return sk(a.name).localeCompare(sk(b.name));
}
export function surnameInitial(name) {
  const w = name.replace(HONORIFIC_RE, "").split(" ");
  const c = w[w.length - 1].normalize("NFKD").charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}
