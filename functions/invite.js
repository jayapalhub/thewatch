// The invitation request: the second, more exclusive offer next to the free calendar. Better Security hosts small,
// invite only experiences for San Diego security and IT practitioners starting in 2027, and this form collects what
// is needed to put the right people in the right room. It never names an event, a date, a venue or a sponsor
// (CLAUDE.md), and it is separate from the one field Sunday email signup, which stays as it is.
import { html, page } from "./_lib/html.js";
import { shell } from "./_lib/layout.js";
import { INVITE_SENIORITY, INVITE_AREAS } from "./_lib/constants.js";

export const INVITE_HEADLINE = "Request an invitation to small, invite only experiences for San Diego security and IT practitioners, starting in 2027.";

export async function onRequestGet({ request }) {
  const src = (new URL(request.url).searchParams.get("src") || "").replace(/[^a-z0-9_:-]/gi, "").slice(0, 40) || "invite_page";
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">Invitations</p>
    <h1>${INVITE_HEADLINE}</h1>
    <p class="lede">Better Security hosts a small number of experiences each year, each built for a particular group of practitioners, some over a meal and some around an activity. Tell us who you are and the areas you own or influence, and we will reach out when there is a fit. Your details stay with us and are never shared with sponsors.</p>
  </div></section>
  <section class="band"><div class="wrap narrow">
    <form class="form big-form" method="post" action="/api/invite" data-ajax data-keep>
      <input type="hidden" name="source" value="${src}">
      <input type="text" name="website_hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <fieldset>
        <legend>About you</legend>
        <div class="row-2">
          <label>First name <input name="first_name" required maxlength="80" autocomplete="given-name"></label>
          <label>Last name <input name="last_name" required maxlength="80" autocomplete="family-name"></label>
        </div>
        <div class="row-2">
          <label>Work email <input type="email" name="email" required maxlength="200" autocomplete="email" inputmode="email" placeholder="you@company.com"></label>
          <label>LinkedIn profile <input type="url" name="linkedin_url" required maxlength="300" placeholder="https://www.linkedin.com/in/yourname"></label>
        </div>
        <div class="row-2">
          <label>Company <input name="company" required maxlength="120" autocomplete="organization"></label>
          <label>Job title <input name="job_title" required maxlength="120" autocomplete="organization-title"></label>
        </div>
        <label>Seniority <select name="seniority" required><option value="">Choose one</option>${Object.entries(INVITE_SENIORITY).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
      </fieldset>
      <fieldset>
        <legend>What you own or influence</legend>
        <fieldset class="topics areas"><legend>Areas <span class="hint">Pick every area that applies.</span></legend>
          ${Object.entries(INVITE_AREAS).map(([k, v]) => html`<label class="chip"><input type="checkbox" name="areas" value="${k}"> ${v}</label>`)}
        </fieldset>
        <div class="check-block"><label class="check"><input type="checkbox" name="vendor" value="1"> I work for a vendor, reseller or services firm</label><span class="hint">Experiences are built for practitioners, and this helps us keep each room balanced.</span></div>
      </fieldset>
      <fieldset>
        <legend>Anything else</legend>
        <label>Anything else you want Jerome to know <span class="hint">Optional. The kind of conversation you would value, people you would like to meet, or anything that helps us place you well.</span><textarea name="notes" rows="4" maxlength="2000"></textarea></label>
      </fieldset>
      <button class="btn btn-primary btn-large" type="submit">Request an invitation</button>
      <p class="consent">By requesting an invitation you agree that Better Security may contact you about its experiences. We do not share attendee details with sponsors, and this does not subscribe you to the Sunday email. <a href="/privacy">Privacy policy</a>.</p>
      <p class="form-msg" role="status" aria-live="polite"></p>
    </form>
  </div></section>
  <section class="band band-paper"><div class="wrap narrow three-up">
    <div><h2>Small by design</h2><p>Each experience is sized for real conversation, so seats are matched to the room rather than first come, first served.</p></div>
    <div><h2>Practitioners first</h2><p>Rooms are built around the people who own security and technology decisions in San Diego, with sponsors there to listen.</p></div>
    <div><h2>Nothing sold</h2><p>Your details are used to invite you and for nothing else. They are never passed to a sponsor.</p></div>
  </div></section>`;
  return page(shell({ title: "Request an invitation", description: "Request an invitation to Better Security's small, invite only experiences for San Diego security and IT practitioners, starting in 2027.", body, path: "/invite" }), 200, { "Cache-Control": "no-store" });
}
