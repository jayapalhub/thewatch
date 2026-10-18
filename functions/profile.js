import { html, page, raw } from "./_lib/html.js";
import { shell } from "./_lib/layout.js";
import { TOPICS, SENIORITY } from "./_lib/constants.js";

export async function onRequestGet({ request, env }) {
  const t = (new URL(request.url).searchParams.get("t") || "").slice(0, 64);
  const sub = t ? await env.DB.prepare("SELECT * FROM subscribers WHERE profile_token=?").bind(t).first() : null;
  const interests = sub ? (() => { try { return JSON.parse(sub.interests || "[]"); } catch { return []; } })() : [];
  const body = sub ? html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">You're subscribed</p>
    <h1>Thanks. One optional step.</h1>
    <p class="lede">Tell us a little about what you do and we'll use it for one thing: inviting the right people to Better Security's dinners, roundtables and conference sessions. Skip it if you'd rather just get the Sunday email.</p>
  </div></section>
  <section class="band"><div class="wrap narrow">
    <form class="form" method="post" action="/api/profile" data-ajax>
      <input type="hidden" name="t" value="${t}">
      <div class="row-2">
        <label>First name <input name="first_name" value="${sub.first_name || ""}" maxlength="60"></label>
        <label>Last name <input name="last_name" value="${sub.last_name || ""}" maxlength="60"></label>
      </div>
      <div class="row-2">
        <label>Company <input name="company" value="${sub.company || ""}" maxlength="120"></label>
        <label>Role <input name="role_title" value="${sub.role_title || ""}" maxlength="120" placeholder="Security engineer, IT auditor, CISO"></label>
      </div>
      <label>Seniority <select name="seniority"><option value="">Prefer not to say</option>${Object.entries(SENIORITY).map(([k, v]) => html`<option value="${k}" ${sub.seniority === k ? raw("selected") : ""}>${v}</option>`)}</select></label>
      <fieldset class="topics"><legend>Areas of interest</legend>
        ${Object.entries(TOPICS).map(([k, v]) => html`<label class="chip"><input type="checkbox" name="interests" value="${k}" ${interests.includes(k) ? raw("checked") : ""}> ${v}</label>`)}
      </fieldset>
      <label>LinkedIn <span class="hint">Optional, helps us avoid inviting you to the wrong dinner.</span><input type="url" name="linkedin_url" value="${sub.linkedin_url || ""}" placeholder="https://linkedin.com/in/"></label>
      <button class="btn btn-primary" type="submit">Save</button> <a class="btn btn-ghost" href="/sandiego">Skip, show me the calendar</a>
      <p class="form-msg" role="status" aria-live="polite"></p>
    </form>
  </div></section>` : html`
  <section class="hero hero-short"><div class="wrap narrow"><h1>This link isn't valid anymore.</h1><p class="lede">Profile links are personal and expire if you resubscribe. <a href="/subscribe">Subscribe again</a> to get a fresh one, or just enjoy the <a href="/sandiego">calendar</a>.</p></div></section>`;
  return page(shell({ title: "Your profile", body, path: "/subscribe", head: '<meta name="robots" content="noindex">' }), sub ? 200 : 404);
}
