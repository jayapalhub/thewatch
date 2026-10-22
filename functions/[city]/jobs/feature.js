import { html, page, json, readForm, str, notFound, EMAIL_RE, esc } from "../../_lib/html.js";
import { shell } from "../../_lib/layout.js";
import { CITIES } from "../../_lib/constants.js";
import { rateLimited } from "../../_lib/subscribers.js";
import { notifyJerome, emailShell } from "../../_lib/integrations.js";
import { cleanJobUrl, isJobBoard } from "../../_lib/jobs.js";
import { getSetting, FEATURED_PRICE_KEY, FEATURED_PRICE_DEFAULT } from "../../_lib/settings.js";

// Feature a role: the paid slot at the top of a city's board and the first pick in the Sunday email. The request
// lands in Admin > Jobs > Featured; Jerome approves and invoices by hand, then the listing is pinned. No card
// details are taken here and nothing goes live without a person approving it.
export async function onRequestGet({ params, env }) {
  const city = CITIES[params.city];
  if (!city) return notFound("Calendar not found");
  const price = await getSetting(env.DB, FEATURED_PRICE_KEY, FEATURED_PRICE_DEFAULT);
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">For employers</p>
    <h1>Feature a role in ${city.name}</h1>
    <p class="lede">A featured role sits at the top of the ${city.name} jobs board for the weeks you choose, marked Featured, and leads the Hiring section of that Sunday's email to every ${city.name} subscriber. Every other listing is free; this is the one paid placement.</p>
  </div></section>
  <section class="band"><div class="wrap narrow">
    <p class="lede-note">${price ? html`<strong>${price}</strong> ` : ""}${price ? "Invoiced after we confirm the role is a direct opening. " : "Pricing comes by reply within one business day, and nothing is charged until you confirm. "}Featured roles are reviewed like any other: a real opening at a direct employer or a named staffing firm, linked to your own posting.</p>
    <form class="form big-form" method="post" action="/${city.slug}/jobs/feature" data-ajax>
      <input type="text" name="website_hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <fieldset><legend>The role</legend>
        <div class="row-2">
          <label>Company <input name="employer" required maxlength="120" autocomplete="organization"></label>
          <label>Role title <input name="title" required maxlength="140" placeholder="Manager, Security Compliance"></label>
        </div>
        <label>Link to the posting <span class="hint">Your careers page or applicant tracking system, not a job board. If the role is already on The Watch, the same link is fine.</span><input type="url" name="url" required maxlength="500" placeholder="https://"></label>
        <label>Featured for <select name="weeks"><option value="1">One week</option><option value="2" selected>Two weeks</option><option value="4">Four weeks</option></select></label>
      </fieldset>
      <fieldset><legend>Who to invoice</legend>
        <div class="row-2">
          <label>Your name <input name="contact_name" required maxlength="80" autocomplete="name"></label>
          <label>Your title <input name="contact_title" maxlength="120" placeholder="Talent Acquisition Partner"></label>
        </div>
        <label>Work email <input type="email" name="contact_email" required autocomplete="email"></label>
        <label>Anything else <span class="hint">Optional. A start date, a purchase order number, a second role.</span><textarea name="notes" rows="3" maxlength="1000"></textarea></label>
      </fieldset>
      <button class="btn btn-primary" type="submit">Request the featured slot</button>
      <p class="form-msg" role="status" aria-live="polite"></p>
    </form>
    <p class="jobs-fine">Prefer the free listing? <a href="/${city.slug}/jobs/post">Post a role</a> at no charge.</p>
  </div></section>`;
  return page(shell({ title: `Feature a role in ${city.name}`, body, city: city.slug, path: `/${city.slug}/jobs` }));
}

export async function onRequestPost({ params, request, env, waitUntil }) {
  const city = CITIES[params.city];
  if (!city) return json({ success: false, error: "Calendar not found" }, 404);
  const p = await readForm(request);
  if (str(p.website_hp)) return json({ success: true, message: "Thanks." });
  if (await rateLimited(env.DB, request, "jobfeature", 4, 60)) return json({ success: false, error: "Too many requests from this connection. Try again later." }, 429);
  const employer = str(p.employer, 120), title = str(p.title, 140), url = cleanJobUrl(str(p.url, 500)) || "";
  const name = str(p.contact_name, 80), email = str(p.contact_email, 200), weeks = [1, 2, 4].includes(parseInt(p.weeks, 10)) ? parseInt(p.weeks, 10) : 2;
  if (!employer || !title || !name || !EMAIL_RE.test(email)) return json({ success: false, error: "Please fill in the company, role title, your name and a valid email." }, 400);
  if (!url) return json({ success: false, error: "The posting link needs to be a full web address starting with https://" }, 400);
  if (isJobBoard(url)) return json({ success: false, error: "Please link to your own careers page or applicant tracking system rather than a job board." }, 400);
  const existing = await env.DB.prepare("SELECT id FROM jobs WHERE url=? AND status IN ('pending_review','published')").bind(url).first();
  const r = await env.DB.prepare("INSERT INTO feature_requests (city, job_id, employer, title, url, weeks, contact_name, contact_email, contact_title, notes) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(city.slug, existing ? existing.id : null, employer, title, url, weeks, name, email, str(p.contact_title, 120) || null, str(p.notes, 1000) || null).run();
  const site = env.SITE_URL || "https://bettersecurity.ai";
  const note = notifyJerome(env, `Featured role request: ${title} at ${employer} (${city.name})`, emailShell("Featured role request", `<p><strong>${esc(title)}</strong> at ${esc(employer)}, ${esc(city.name)}, ${weeks} week${weeks === 1 ? "" : "s"}.<br><a href="${esc(url)}">${esc(url)}</a>${existing ? "<br>Already on the board as listing " + existing.id + "." : "<br>Not on the board yet; approving adds it."}</p><p>From ${esc(name)}${p.contact_title ? ", " + esc(str(p.contact_title, 120)) : ""} &lt;${esc(email)}&gt;.${p.notes ? "<br>" + esc(str(p.notes, 1000)) : ""}</p><p><a href="${site}/admin/jobs/features">Approve, invoice or decline</a>. Nothing is pinned until you approve.</p>`));
  if (waitUntil) waitUntil(note); else await note;
  return json({ success: true, message: `Thanks. We confirm the role and reply to ${email} within one business day with the invoice and the start date.` });
}
