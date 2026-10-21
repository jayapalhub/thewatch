import { html, page, json, raw, readForm, str, list, notFound, EMAIL_RE, esc } from "../../_lib/html.js";
import { shell } from "../../_lib/layout.js";
import { CITIES, TOPICS, SENIORITY } from "../../_lib/constants.js";
import { rateLimited } from "../../_lib/subscribers.js";
import { notifyJerome, emailShell } from "../../_lib/integrations.js";
import { REMOTE, cleanJobUrl, isJobBoard } from "../../_lib/jobs.js";
import { findEmployer } from "../../_lib/admin-jobs.js";

// Free employer form. Trusted employers publish after the usual 24 hour window; everyone else waits for Jerome.
export async function onRequestGet({ params }) {
  const city = CITIES[params.city];
  if (!city) return notFound("Calendar not found");
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">For employers</p>
    <h1>Post a security role in ${city.name}</h1>
    <p class="lede">Free. Every listing links to your own posting, stays up for 30 days or until the posting closes, and is reviewed by a person before it goes live.</p>
  </div></section>
  <section class="band"><div class="wrap narrow">
    <form class="form big-form" method="post" action="/${city.slug}/jobs/post" data-ajax>
      <input type="text" name="website_hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <fieldset><legend>The role</legend>
        <div class="row-2">
          <label>Company <input name="employer" required maxlength="120" autocomplete="organization"></label>
          <label>Role title <input name="title" required maxlength="140" placeholder="Manager, Security Compliance"></label>
        </div>
        <label>Link to the posting <span class="hint">Your careers page or applicant tracking system, not a job board.</span><input type="url" name="url" required maxlength="500" placeholder="https://"></label>
        <div class="row-3">
          <label>Location <input name="location" maxlength="120" placeholder="Sorrento Valley"></label>
          <label>Work model <select name="remote">${Object.entries(REMOTE).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
          <label>Level <select name="seniority"><option value="">Choose</option>${Object.entries(SENIORITY).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
        </div>
        <label>Salary range <span class="hint">Optional. Listings with a range get more clicks.</span><input name="salary_text" maxlength="80" placeholder="$150K to $180K"></label>
        <fieldset class="topics"><legend>Topics <span class="hint">Pick up to three.</span></legend>
          ${Object.entries(TOPICS).filter(([k]) => k !== "social").map(([k, v]) => html`<label class="chip"><input type="checkbox" name="topics" value="${k}"> ${v}</label>`)}
        </fieldset>
      </fieldset>
      <fieldset><legend>Who candidates should reach <span class="hint">Optional. Shown on the listing so people know who to talk to.</span></legend>
        <div class="row-2">
          <label>Name <input name="posted_by_name" maxlength="100"></label>
          <label>Title <input name="posted_by_title" maxlength="120" placeholder="Talent Acquisition Partner"></label>
        </div>
        <label>LinkedIn post about the role <span class="hint">Optional. If you posted about it, we link to the post.</span><input type="url" name="posted_by_url" maxlength="500" placeholder="https://www.linkedin.com/posts/"></label>
      </fieldset>
      <fieldset><legend>About you <span class="hint">Private. Only used if we have a question about the listing.</span></legend>
        <div class="row-2">
          <label>Your name <input name="submitted_by_name" required maxlength="80" autocomplete="name"></label>
          <label>Work email <input type="email" name="submitted_by_email" required autocomplete="email"></label>
        </div>
      </fieldset>
      <button class="btn btn-primary" type="submit">Submit the role</button>
      <p class="form-msg" role="status" aria-live="polite"></p>
    </form>
  </div></section>`;
  return page(shell({ title: `Post a role in ${city.name}`, body, city: city.slug, path: `/${city.slug}/jobs` }));
}

export async function onRequestPost({ params, request, env, waitUntil }) {
  const city = CITIES[params.city];
  if (!city) return json({ success: false, error: "Calendar not found" }, 404);
  const p = await readForm(request);
  if (str(p.website_hp)) return json({ success: true, message: "Thanks." });
  if (await rateLimited(env.DB, request, "jobpost", 6, 60)) return json({ success: false, error: "Too many submissions from this connection. Try again later." }, 429);
  const employer = str(p.employer, 120), title = str(p.title, 140), url = cleanJobUrl(str(p.url, 500)) || "";
  const byName = str(p.submitted_by_name, 80), byEmail = str(p.submitted_by_email, 200);
  if (!employer || !title || !byName || !EMAIL_RE.test(byEmail)) return json({ success: false, error: "Please fill in the company, role title, your name and a valid email." }, 400);
  if (!url) return json({ success: false, error: "The posting link needs to be a full web address starting with https://" }, 400);
  if (isJobBoard(url)) return json({ success: false, error: "Please link to your own careers page or applicant tracking system rather than a job board." }, 400);
  const pbUrl = str(p.posted_by_url, 500);
  if (pbUrl && !/^https?:\/\//i.test(pbUrl)) return json({ success: false, error: "The LinkedIn post link needs to start with https://" }, 400);
  const dup = await env.DB.prepare("SELECT id FROM jobs WHERE url=? AND status IN ('pending_review','published','draft')").bind(url).first();
  if (dup) return json({ success: true, message: "That role is already listed or waiting for review. Thanks." });
  // Every public submission waits for Jerome, whatever name it gives: typing a trusted organizer's name is not proof
  // of being that organizer. Link an existing organization if the name matches; never create one from here.
  const emp = await findEmployer(env.DB, employer);
  const topics = JSON.stringify(list(p.topics).filter((k) => TOPICS[k]).slice(0, 3));
  const r = await env.DB.prepare(`INSERT INTO jobs (city, organization_id, employer_name, title, url, location, remote, seniority, topics, salary_text, posted_at, status, hold, auto_publish_at, source,
      posted_by_name, posted_by_title, posted_by_url, posted_by_kind, posted_by_date, submitted_by_name, submitted_by_email) VALUES (?,?,?,?,?,?,?,?,?,?,date('now'),'pending_review',?,?,'employer_form',?,?,?,?,?,?,?)`)
    .bind(city.slug, emp ? emp.id : null, employer, title, url, str(p.location, 120) || null, REMOTE[str(p.remote)] ? str(p.remote) : "onsite", SENIORITY[str(p.seniority)] ? str(p.seniority) : null, topics, str(p.salary_text, 80) || null,
      1, null,
      str(p.posted_by_name, 100) || null, str(p.posted_by_title, 120) || null, pbUrl || null, str(p.posted_by_name, 100) ? "employer" : null, null, byName, byEmail).run();
  const site = env.SITE_URL || "";
  const note = notifyJerome(env, `Job posted: ${title} at ${employer}`, emailShell("New job post", `<p><strong>${esc(title)}</strong> at ${esc(employer)} (${esc(city.name)})<br><a href="${esc(url)}">${esc(url)}</a><br>From ${esc(byName)} &lt;${esc(byEmail)}&gt;</p><p>Waiting for you${emp ? "" : " (new employer; saving it in the editor adds the organization)"}. <a href="${site}/admin/jobs/${r.meta.last_row_id}">Review it</a>.</p>`));
  if (waitUntil) waitUntil(note); else await note;
  return json({ success: true, message: "Thanks. A person reviews every listing, usually within a day, and you'll see it on the jobs page once it's live." });
}
