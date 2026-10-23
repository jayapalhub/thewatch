import { html, page, raw } from "./_lib/html.js";
import { shell } from "./_lib/layout.js";
import { TOPICS, SENIORITY } from "./_lib/constants.js";
import { withCookies, maySignIn } from "./_lib/cpe.js";

export async function onRequestGet({ request, env }) {
  const t = (new URL(request.url).searchParams.get("t") || "").slice(0, 64);
  const sub = t ? await env.DB.prepare("SELECT * FROM subscribers WHERE profile_token=?").bind(t).first() : null;
  const interests = sub ? (() => { try { return JSON.parse(sub.interests || "[]"); } catch { return []; } })() : [];
  if (t === "preview") {
    const body = html`<section class="hero hero-short"><div class="wrap narrow"><p class="kicker">Preview</p><h1>This is the preview copy.</h1><p class="lede">Subscribers who have not answered the profile questions get a personal link here. Everyone else never sees the box.</p></div></section>`;
    return page(shell({ title: "Your profile", body, path: "/subscribe", head: '<meta name="robots" content="noindex">' }), 200);
  }
  const body = sub ? html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">You're subscribed</p>
    <h1>Thanks. Two quick questions, if you like.</h1>
    <p class="lede">Your answers go to one use: telling sponsors what kind of audience reads The Watch (in aggregate, never by name) and inviting the right people to Better Security's own events. Skip it and you still get every Sunday email.</p>
  </div></section>
  <section class="band"><div class="wrap narrow">
    <form class="form" method="post" action="/api/profile" data-ajax>
      <input type="hidden" name="t" value="${t}">
      <label>First name <span class="hint">So the email can say hello properly.</span><input name="first_name" value="${sub.first_name || ""}" maxlength="60" autocomplete="given-name"></label>
      <label>Where you sit <select name="seniority"><option value="">Pick one</option>${Object.entries(SENIORITY).map(([k, v]) => html`<option value="${k}" ${sub.seniority === k ? raw("selected") : ""}>${v}</option>`)}</select></label>
      <fieldset class="topics"><legend>What you want more of <span class="hint">Optional, pick any.</span></legend>
        ${Object.entries(TOPICS).filter(([k]) => k !== "social").map(([k, v]) => html`<label class="chip"><input type="checkbox" name="interests" value="${k}" ${interests.includes(k) ? raw("checked") : ""}> ${v}</label>`)}
      </fieldset>
      <details class="more"><summary>Add your company and role (optional)</summary>
        <div class="row-2">
          <label>Company <input name="company" value="${sub.company || ""}" maxlength="120" autocomplete="organization"></label>
          <label>Role <input name="role_title" value="${sub.role_title || ""}" maxlength="120" placeholder="Security engineer, IT auditor, CISO" autocomplete="organization-title"></label>
        </div>
        <label>LinkedIn <input type="url" name="linkedin_url" value="${sub.linkedin_url || ""}" placeholder="https://linkedin.com/in/"></label>
      </details>
      <label class="chip" style="display:block;margin:14px 0 6px;"><input type="hidden" name="personalize_set" value="1"><input type="checkbox" name="personalize" value="1" ${Number(sub.personalize === undefined || sub.personalize === null ? 1 : sub.personalize) ? raw("checked") : ""}> Personalize my Sunday email <span class="hint">Links in your email carry a private code so we can see which events and roles you open and pick better ones for you. Untick it and your links are plain; you still get every Sunday email.</span></label>
      <button class="btn btn-primary" type="submit">Save</button> <a class="btn btn-ghost" href="/${sub.city || "sandiego"}">Skip, show me the calendar</a>
      <p class="form-msg" role="status" aria-live="polite"></p>
    </form>
    <p class="profile-cpe">Going to events for credit? <a href="/cpe?t=${t}">Your private CPE log</a> keeps the events you mark as attended, with hours and a CSV for your certification body.</p>
  </div></section>` : html`
  <section class="hero hero-short"><div class="wrap narrow"><h1>This link isn't valid anymore.</h1><p class="lede">Profile links are personal and expire if you resubscribe. <a href="/subscribe">Subscribe again</a> to get a fresh one, or just enjoy the <a href="/sandiego">calendar</a>.</p></div></section>`;
  const res = page(shell({ title: "Your profile", body, path: "/subscribe", head: '<meta name="robots" content="noindex">' }), sub ? 200 : 404);
  // So event pages can offer Mark attended. Never replaces a different person's sign in on this device.
  return sub && sub.status === "active" && (await maySignIn(env.DB, request, sub.profile_token)) ? withCookies(res, sub.profile_token) : res;
}
