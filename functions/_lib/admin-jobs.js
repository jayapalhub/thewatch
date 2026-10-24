import { html, raw, str, list, slugify } from "./html.js";
import { CITIES, TOPICS, SENIORITY, jobBoardOf } from "./constants.js";
import { REMOTE, POSTER_KINDS, POSTED_ROLES, JOB_STATUSES, cleanJobUrl, isJobBoard, announcedExpiry } from "./jobs.js";

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
      <label>Employer's posting URL <small>(never an aggregator; ${j.announced ? "add it here when the posting appears and the role stops being announced" : "leave blank only for a role announced in a post, with the post link below"})</small><input type="url" name="url" maxlength="500" value="${j.announced ? "" : j.url || ""}"></label>
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
    <h3>Who to talk to <small class="a-muted">Only someone who posted publicly about this role, or whom the posting names. Link to their post.${j.announced ? " This role is announced: the post is the only link until the employer's posting is added above." : ""}</small></h3>
    <div class="a-grid-3">
      <label>Name<input name="posted_by_name" maxlength="100" value="${j.posted_by_name || ""}"></label>
      <label>Title<input name="posted_by_title" maxlength="120" value="${j.posted_by_title || ""}" placeholder="Talent Acquisition Partner"></label>
      <label>Who they are <small>(sets the label on the role)</small><select name="posted_by_role"><option value="">Not set</option>${Object.entries(POSTED_ROLES).map(([k, v]) => html`<option value="${k}" ${sel(j.posted_by_role === k)}>${k === "recruiter" ? "In house recruiter" : v}</option>`)}</select></label>
    </div>
    <div class="a-grid-3">
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
  const title = str(p.title, 140), employerUrl = str(p.url, 500), employer = str(p.employer, 120);
  if (!title || !employer) return { error: "Role title and employer are required." };
  const pbUrl = str(p.posted_by_url, 500);
  if (pbUrl && !cleanJobUrl(pbUrl)) return { error: "The link to their post must be a full web address starting with https://" };
  // No employer posting yet: the role is announced and the post is its link. An employer URL ends the announced state.
  const announced = !employerUrl && !!pbUrl ? 1 : 0;
  if (!announced && !cleanJobUrl(employerUrl)) return { error: "The posting URL must be a full web address starting with https://, or leave it blank and give the link to the post for a role that is announced but not yet on the employer's site." };
  if (!announced && isJobBoard(employerUrl)) return { error: "The posting URL must be the employer's own careers page, not a job board or aggregator." };
  const url = announced ? cleanJobUrl(pbUrl) : cleanJobUrl(employerUrl);
  const date = (k) => (DATE_RE.test(str(p[k], 10)) ? str(p[k], 10) : null);
  const city = CITIES[str(p.city, 30)] ? str(p.city, 30) : Object.keys(CITIES)[0];
  return { row: {
    city, employer, title, url, announced,
    location: str(p.location, 120) || null,
    remote: REMOTE[str(p.remote)] ? str(p.remote) : "onsite",
    seniority: SENIORITY[str(p.seniority)] ? str(p.seniority) : null,
    topics: JSON.stringify(list(p.topics).filter((k) => TOPICS[k]).slice(0, 3)),
    salary_text: str(p.salary_text, 80) || null,
    posted_at: date("posted_at"), expires_at: date("expires_at"), featured_until: date("featured_until"),
    status: JOB_STATUSES.includes(str(p.status)) ? str(p.status) : "pending_review",
    posted_by_name: str(p.posted_by_name, 100) || null, posted_by_title: str(p.posted_by_title, 120) || null,
    posted_by_url: pbUrl ? cleanJobUrl(pbUrl) : null, posted_by_kind: POSTER_KINDS[str(p.posted_by_kind)] ? str(p.posted_by_kind) : null,
    posted_by_role: POSTED_ROLES[str(p.posted_by_role)] ? str(p.posted_by_role) : null,
    posted_by_date: date("posted_by_date"), reviewer_notes: str(p.reviewer_notes, 500) || null,
  } };
}

// The quick form for a role someone posted about. Returns { row, error }. Staffing agencies are refused here, and
// without an employer posting the row is announced with the post as its link.
export const POSTED_FORM_ROLES = { ...POSTED_ROLES, staffing: "Staffing agency recruiter" };
export function parsePostedForm(p, today) {
  const postUrl = str(p.posted_by_url, 500), name = str(p.posted_by_name, 100), ptitle = str(p.posted_by_title, 120), role = str(p.posted_by_role, 20);
  const employer = str(p.employer, 120), title = str(p.title, 140), employerUrl = str(p.url, 500);
  if (role === "staffing") return { error: "Staffing agency posts stay out: only someone who works at the employer (a hiring manager, a security leader, an in house recruiter or a member of the team) is listed." };
  if (!POSTED_ROLES[role]) return { error: "Say who the person is: a hiring manager, a security leader, an in house recruiter or someone who works there." };
  if (!cleanJobUrl(postUrl)) return { error: "The post URL must be a full web address starting with https://" };
  if (!name || !ptitle) return { error: "The person's name and title are required; both come from their public post." };
  if (!employer || !title) return { error: "Employer and job title are required." };
  const city = jobBoardOf(str(p.city, 30)) ? str(p.city, 30) : null;
  if (!city) return { error: "Pick the city, or Remote for a role open anywhere in the US." };
  const postedByDate = DATE_RE.test(str(p.posted_by_date, 10)) ? str(p.posted_by_date, 10) : today;
  if (postedByDate > today) return { error: "The post date cannot be in the future." };
  const announced = employerUrl ? 0 : 1;
  if (!announced && !cleanJobUrl(employerUrl)) return { error: "The employer's posting URL must be a full web address starting with https://, or leave it blank for a role that is announced but not yet on the employer's site." };
  if (!announced && isJobBoard(employerUrl)) return { error: "The employer's posting URL must be the employer's own careers page, not a job board or aggregator." };
  return { row: {
    city, employer, title, announced,
    url: announced ? cleanJobUrl(postUrl) : cleanJobUrl(employerUrl),
    expires_at: announced ? announcedExpiry(postedByDate, today) : null, // null: the usual 30 days from today
    posted_by_name: name, posted_by_title: ptitle, posted_by_role: role, posted_by_kind: "employer", posted_by_url: cleanJobUrl(postUrl), posted_by_date: postedByDate,
    location: str(p.location, 120) || (city === "remote" ? "United States (Remote)" : null), remote: city === "remote" ? "remote" : "onsite",
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

export const JOB_COLUMNS = ["city", "organization_id", "employer_name", "title", "url", "location", "remote", "seniority", "topics", "salary_text", "posted_at", "expires_at", "featured_until", "status", "posted_by_name", "posted_by_title", "posted_by_url", "posted_by_kind", "posted_by_role", "posted_by_date", "announced", "reviewer_notes"];

// The quick form itself.
export function postedForm(p = {}, orgs = [], { action = "/admin/jobs/posted" } = {}) {
  return html`<form class="a-form" method="post" action="${action}">
    <p class="a-muted">For a role someone who works at the employer posted about publicly: a hiring manager, a security leader, an in house recruiter, or someone on that team or a sister team. Never someone who only reposts other companies' roles. It goes live at once, with their name, title and a link to the post, and nothing copied from the post. If the employer's posting is already listed, the person is attached to it instead of a second row.</p>
    <div class="a-grid-2">
      <label>Post URL<input type="url" name="posted_by_url" required maxlength="500" value="${p.posted_by_url || ""}" placeholder="https://www.linkedin.com/posts/..."></label>
      <label>Post date<input type="date" name="posted_by_date" value="${p.posted_by_date || ""}"></label>
    </div>
    <div class="a-grid-3">
      <label>Person's name<input name="posted_by_name" required maxlength="100" value="${p.posted_by_name || ""}"></label>
      <label>Their title<input name="posted_by_title" required maxlength="120" value="${p.posted_by_title || ""}" placeholder="Director of Security Engineering"></label>
      <label>Who they are<select name="posted_by_role" required><option value="">Choose</option>${Object.entries(POSTED_FORM_ROLES).map(([k, v]) => html`<option value="${k}" ${sel(p.posted_by_role === k)}>${k === "recruiter" ? "In house recruiter" : k === "team" ? "Works at the employer (their team or a sister team)" : v}</option>`)}</select></label>
    </div>
    <div class="a-grid-3">
      <label>Employer<input name="employer" list="orgs" required maxlength="120" value="${p.employer || ""}"></label>
      <label>Job title<input name="title" required maxlength="140" value="${p.title || ""}"></label>
      <label>City<select name="city">${Object.values(CITIES).map((c) => html`<option value="${c.slug}" ${sel(p.city === c.slug)}>${c.name}</option>`)}<option value="remote" ${sel(p.city === "remote")}>Remote (anywhere in the US)</option></select></label>
    </div>
    <datalist id="orgs">${orgs.map((o) => html`<option value="${o.name}">`)}</datalist>
    <div class="a-grid-2">
      <label>Employer's posting URL <small>(optional; blank means announced, not yet on the employer's site)</small><input type="url" name="url" maxlength="500" value="${p.url || ""}"></label>
      <label>Location <small>(optional)</small><input name="location" maxlength="120" value="${p.location || ""}" placeholder="Sorrento Valley"></label>
    </div>
    <div class="a-actions"><button class="a-btn a-btn-primary" name="action" value="save">Add and publish</button></div>
  </form>`;
}
