import { html, page, readForm, redirect, str } from "../_lib/html.js";
import { shell } from "../_lib/layout.js";
import { eventPath } from "../_lib/constants.js";
import { fmtDateLong } from "../_lib/dates.js";
import { tokenFromCookie, subscriberByToken, withCookies, maySignIn, logEntries, yearTotals, cleanHours, PT_COOKIE, FLAG_COOKIE } from "../_lib/cpe.js";

// Private CPE log at /cpe?t=<profile token> (or the watch_pt cookie). Never indexed, never cached, never linked publicly.
const HEAD = '<meta name="robots" content="noindex"><meta name="referrer" content="same-origin">';
const fmtH = (h) => (h == null ? "" : Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0$/, ""));

function view(body, status = 200) {
  return page(shell({ title: "Your CPE log", body, path: "/cpe", head: HEAD }), status, { "Cache-Control": "private, no-store" });
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  if (u.searchParams.get("signout") === "1") {
    const res = view(html`<section class="hero hero-short"><div class="wrap narrow"><h1>Signed out on this device.</h1><p class="lede">Your log is still saved. Open it again from the link in any email from The Watch, or from your profile link.</p></div></section>`);
    res.headers.append("Set-Cookie", `${PT_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    res.headers.append("Set-Cookie", `${FLAG_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Lax`);
    return res;
  }
  const t = (u.searchParams.get("t") || "").slice(0, 64) || tokenFromCookie(request);
  const sub = await subscriberByToken(env.DB, t);
  if (!sub) return view(html`<section class="hero hero-short"><div class="wrap narrow"><p class="kicker">CPE log</p><h1>Your CPE log lives behind your personal link.</h1><p class="lede">Every subscriber to The Watch gets a private log of the events they attended, with credit hours and a CSV for your certification body. Open it from the profile link in your welcome email, or <a href="/subscribe">subscribe</a> to start one.</p></div></section>`, 404);
  const rows = await logEntries(env.DB, sub.id);
  const years = yearTotals(rows);
  const msg = u.searchParams.get("msg");
  const body = html`
  <section class="hero hero-short"><div class="wrap narrow">
    <p class="kicker">Private to you</p>
    <h1>Your CPE log</h1>
    <p class="lede">Events you marked as attended on The Watch, with the credit hours the organizer reported. Change any figure to match what you actually earned. Nobody else can see this page, and we never publish it.</p>
    <p class="lede-note">This is the log for ${sub.email}. Not you? <a href="/cpe?signout=1">Sign out on this device</a>.</p>
  </div></section>
  <section class="band"><div class="wrap narrow cpe">
    ${msg ? html`<p class="notice notice-deal">${msg}</p>` : ""}
    ${years.length ? html`<div class="cpe-years">${years.map((y) => html`<div class="cpe-year">
      <span class="cpe-y">${y.year}</span><span class="cpe-n">${fmtH(y.hours) || "0"}</span><span class="cpe-l">hours across ${y.events} event${y.events === 1 ? "" : "s"}</span>
      ${Object.keys(y.byBody).length > 1 ? html`<span class="cpe-b">${Object.entries(y.byBody).map(([b, h]) => `${b} ${fmtH(h)}`).join(" · ")}</span>` : ""}
      <a class="cpe-csv" href="/cpe/export?t=${sub.profile_token}&year=${y.year}">Download ${y.year} as CSV</a>
    </div>`)}</div>` : ""}
    ${rows.length ? html`
    <ul class="cpe-list">${rows.map((r) => html`<li class="cpe-row" id="e${r.event_id}">
      <div class="cpe-main">
        <span class="cpe-date">${fmtDateLong(r.start_at)}</span>
        <a class="cpe-title" href="${eventPath(r)}">${r.title}</a>
        <span class="cpe-org">${r.org_name || ""}${r.cpe_body ? ` · ${r.cpe_body}` : ""}${r.cpe_eligible && r.cpe_hours != null ? ` · organizer reports ${fmtH(r.cpe_hours)} hour${r.cpe_hours === 1 ? "" : "s"}` : " · no hours reported by the organizer"}</span>
      </div>
      <form method="post" action="/cpe" class="cpe-edit">
        <input type="hidden" name="t" value="${sub.profile_token}"><input type="hidden" name="id" value="${r.id}">
        <label>Hours<input type="number" name="hours" min="0" max="40" step="0.25" value="${fmtH(r.hours)}" placeholder="0"></label>
        <button class="btn btn-small btn-outline" name="action" value="hours">Save</button>
        <button class="cpe-remove" name="action" value="remove" onclick="return confirm('Remove this event from your log?')">Remove</button>
      </form>
    </li>`)}</ul>
    <p class="cpe-foot"><a href="/cpe/export?t=${sub.profile_token}">Download everything as CSV</a> · <a href="/profile?t=${sub.profile_token}">Your profile</a> · <a href="/cpe?signout=1">Sign out on this device</a></p>`
    : html`<div class="cpe-empty"><h2>Nothing logged yet</h2><p>After an event, open its page on The Watch and press <strong>Mark attended</strong>, or use the link at the bottom of a reminder email. It lands here with the organizer's credit hours filled in.</p><p><a class="btn btn-primary" href="/${sub.city || "sandiego"}">Browse the calendar</a></p></div>`}
    <p class="cpe-fine">Credit hours are as reported by each organizer, and your certification body decides what counts. Keep your certificates of attendance; this log is a record for you, not a certificate.</p>
  </div></section>`;
  return (await maySignIn(env.DB, request, sub.profile_token)) ? withCookies(view(body), sub.profile_token) : view(body);
}

export async function onRequestPost({ request, env }) {
  const p = await readForm(request);
  const sub = await subscriberByToken(env.DB, str(p.t, 64) || tokenFromCookie(request));
  if (!sub) return redirect("/cpe");
  const id = parseInt(str(p.id), 10);
  // Signed in by cookie: keep the private token out of the address bar and history.
  const viaCookie = tokenFromCookie(request) === sub.profile_token;
  const back = (m) => redirect(`/cpe?${viaCookie ? "" : `t=${sub.profile_token}&`}msg=${encodeURIComponent(m)}`, 303);
  const row = id ? await env.DB.prepare("SELECT a.id, e.title FROM event_attendance a JOIN events e ON e.id=a.event_id WHERE a.id=? AND a.subscriber_id=?").bind(id, sub.id).first() : null;
  if (!row) return back("That entry is not in your log.");
  if (str(p.action) === "remove") { await env.DB.prepare("DELETE FROM event_attendance WHERE id=? AND subscriber_id=?").bind(id, sub.id).run(); return back(`Removed ${row.title}.`); }
  const raw = str(p.hours, 10);
  const hours = raw === "" ? null : cleanHours(raw);
  if (raw !== "" && hours == null) return back("Hours must be a number from 0 to 40.");
  await env.DB.prepare("UPDATE event_attendance SET hours=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND subscriber_id=?").bind(hours, id, sub.id).run();
  return back(`Saved ${row.title}.`);
}
