import { html, raw, str, list, slugify } from "./html.js";
import { CITIES, TOPICS, SENIORITY } from "./constants.js";
import { REMOTE, POSTER_KINDS, JOB_STATUSES, cleanJobUrl } from "./jobs.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const sel = (cond) => (cond ? raw("selected") : "");

export function jobForm(j = {}, orgs = [], { action, isNew = false } = {}) {
  const topics = Array.isArray(j.topics) ? j.topics : [];
  return html`<form class="a-form" method="post" action="${action}">
    <div class="a-grid-3">
      <label>Calendar<select name="city">${Object.values(CITIES).map((c) => html`<option value="${c.slug}" ${sel(j.city === c.slug)}>${c.name}</option>`)}</select></label>
      <label>Employer<input name="employer" list="orgs" required maxlength="120" value="${j.employer || j.org_name || j.employer_name || ""}"></label>
      <label>Status<select name="status">${JOB_STATUSES.map((s) => html`<option value="${s}" ${sel((j.status || (isNew ? "published" : "pending_review")) === s)}>${s.replace("_", " ")}</option>`)}</select></label>
    </div>
    <datalist id="orgs">${orgs.map((o) => html`<option value="${o.name}">`)}</datalist>
    <div class="a-grid-2">
      <label>Role title<input name="title" required maxlength="140" value="${j.title || ""}"></label>
      <label>Employer's posting URL <small>(never an aggregator)</small><input type="url" name="url" required maxlength="500" value="${j.url || ""}"></label>
    </div>
    <div class="a-grid-3">
      <label>Location <small>(neighborhood or city)</small><input name="location" maxlength="120" value="${j.location || ""}" placeholder="Sorrento Valley"></label>
      <label>Work model<select name="remote">${Object.entries(REMOTE).map(([k, v]) => html`<option value="${k}" ${sel((j.remote || "onsite") === k)}>${v}</option>`)}</select></label>
      <label>Seniority<select name="seniority"><option value="">Not stated</option>${Object.entries(SENIORITY).map(([k, v]) => html`<option value="${k}" ${sel(j.seniority === k)}>${v}</option>`)}</select></label>
    </div>
    <fieldset class="a-chips"><legend>Topics (up to three)</legend>${Object.entries(TOPICS).filter(([k]) => k !== "social").map(([k, v]) => html`<label class="a-chip"><input type="checkbox" name="topics" value="${k}" ${topics.includes(k) ? raw("checked") : ""}> ${v}</label>`)}</fieldset>
    <div class="a-grid-3">
      <label>Salary <small>(only if the posting states it)</small><input name="salary_text" maxlength="80" value="${j.salary_text || ""}" placeholder="$150K to $180K"></label>
      <label>Posted on<input type="date" name="posted_at" value="${j.posted_at || ""}"></label>
      <label>Expires <small>(blank: 30 days after it goes live)</small><input type="date" name="expires_at" value="${j.expires_at || ""}"></label>
    </div>
    <h3>Who to talk to <small class="a-muted">Only someone who posted publicly about this role, or whom the posting names. Link to their post.</small></h3>
    <div class="a-grid-3">
      <label>Name<input name="posted_by_name" maxlength="100" value="${j.posted_by_name || ""}"></label>
      <label>Title<input name="posted_by_title" maxlength="120" value="${j.posted_by_title || ""}" placeholder="Talent Acquisition Partner"></label>
      <label>Kind<select name="posted_by_kind"><option value="">Not set</option>${Object.entries(POSTER_KINDS).map(([k, v]) => html`<option value="${k}" ${sel(j.posted_by_kind === k)}>${v}</option>`)}</select></label>
    </div>
    <div class="a-grid-2">
      <label>Link to their post<input type="url" name="posted_by_url" maxlength="500" value="${j.posted_by_url || ""}"></label>
      <label>Date of the post<input type="date" name="posted_by_date" value="${j.posted_by_date || ""}"></label>
    </div>
    <div class="a-grid-2">
      <label>Featured until <small>(pinned at the top and always in the email)</small><input type="date" name="featured_until" value="${j.featured_until || ""}"></label>
      <label>Private notes<input name="reviewer_notes" maxlength="500" value="${j.reviewer_notes || ""}"></label>
    </div>
    <div class="a-actions"><button class="a-btn a-btn-primary" name="action" value="save">${isNew ? "Add role" : "Save"}</button>${isNew ? "" : html` <button class="a-btn a-btn-danger" name="action" value="delete" onclick="return confirm('Delete this role?')">Delete</button>`}</div>
  </form>`;
}

// Validates the admin form. Returns { row, error }. row.employer is resolved to an organization by resolveEmployer.
export function parseJobForm(p) {
  const title = str(p.title, 140), url = str(p.url, 500), employer = str(p.employer, 120);
  if (!title || !employer) return { error: "Role title and employer are required." };
  if (!cleanJobUrl(url)) return { error: "The posting URL must be a full web address starting with https://" };
  const pbUrl = str(p.posted_by_url, 500);
  if (pbUrl && !/^https?:\/\//i.test(pbUrl)) return { error: "The link to their post must start with https://" };
  const date = (k) => (DATE_RE.test(str(p[k], 10)) ? str(p[k], 10) : null);
  const city = CITIES[str(p.city, 30)] ? str(p.city, 30) : Object.keys(CITIES)[0];
  return { row: {
    city, employer, title, url: cleanJobUrl(url),
    location: str(p.location, 120) || null,
    remote: REMOTE[str(p.remote)] ? str(p.remote) : "onsite",
    seniority: SENIORITY[str(p.seniority)] ? str(p.seniority) : null,
    topics: JSON.stringify(list(p.topics).filter((k) => TOPICS[k]).slice(0, 3)),
    salary_text: str(p.salary_text, 80) || null,
    posted_at: date("posted_at"), expires_at: date("expires_at"), featured_until: date("featured_until"),
    status: JOB_STATUSES.includes(str(p.status)) ? str(p.status) : "pending_review",
    posted_by_name: str(p.posted_by_name, 100) || null, posted_by_title: str(p.posted_by_title, 120) || null,
    posted_by_url: pbUrl || null, posted_by_kind: POSTER_KINDS[str(p.posted_by_kind)] ? str(p.posted_by_kind) : null,
    posted_by_date: date("posted_by_date"), reviewer_notes: str(p.reviewer_notes, 500) || null,
  } };
}

// Finds an existing organization by name or slug without creating one. The public job form uses this, so an
// unreviewed submission never creates an organizer page. Returns { id } or null.
export async function findEmployer(db, name) {
  const o = await db.prepare("SELECT id FROM organizations WHERE slug=? OR lower(name)=lower(?) LIMIT 1").bind(slugify(name), name).first();
  return o ? { id: o.id } : null;
}

// Finds the employer by name or slug, or creates it as an 'employer' organization. Returns { id, trusted }.
export async function resolveEmployer(db, name, { contactName = null, contactEmail = null, note = "Created from a job post" } = {}) {
  const slug = slugify(name);
  const o = await db.prepare("SELECT id, trusted FROM organizations WHERE slug=? OR lower(name)=lower(?) LIMIT 1").bind(slug, name).first();
  if (o) return { id: o.id, trusted: !!o.trusted };
  const r = await db.prepare("INSERT INTO organizations (slug, name, type, contact_name, contact_email, notes) VALUES (?,?,?,?,?,?)")
    .bind(slug, name, "employer", contactName, contactEmail, note).run();
  return { id: r.meta.last_row_id, trusted: false };
}

export const JOB_COLUMNS = ["city", "organization_id", "employer_name", "title", "url", "location", "remote", "seniority", "topics", "salary_text", "posted_at", "expires_at", "featured_until", "status", "posted_by_name", "posted_by_title", "posted_by_url", "posted_by_kind", "posted_by_date", "reviewer_notes"];
