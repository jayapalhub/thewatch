// The case study: a gated set of pages that shows how The Watch is built and run. Content lives here as data so it
// can be reviewed in one place. Nothing on these pages names a secret, an admin path, a table or a token.
import { html, raw } from "./html.js";

export const PASS_COOKIE = "cs_ok";

export const SECTIONS = {
  engineering: {
    title: "Engineering",
    kicker: "How it is built and shipped",
    blurb: "A read heavy site on Cloudflare's edge, a SQL database, scheduled jobs, and a research pipeline that mixes code with AI agents under controls.",
    body: `
<h2>The system at a glance</h2>
<p>The Watch is a set of city calendars, a virtual calendar, a jobs board and a Sunday email for each city. Every page renders from one SQL database at the edge, so there is no application server to keep up. Research arrives through four routes: automatic feeds (iCal from Meetup and Luma, BrightTALK channels, SANS webcasts), employer job boards read through ten applicant tracking system adapters (Workday, Greenhouse, Lever, Ashby, iCIMS, SmartRecruiters, Eightfold, Radancy, Phenom, SuccessFactors), scheduled AI research sweeps, and organizer submissions. Email goes out through a transactional provider with per subscriber links.</p>
<div class="cs-diagram">
<div class="cs-box"><strong>Sources</strong><span>Organizer feeds, ATS boards, research agents, submissions</span></div><div class="cs-arrow">&rarr;</div>
<div class="cs-box"><strong>Review queue</strong><span>Dedupe, hold rules, 24 hour auto publish</span></div><div class="cs-arrow">&rarr;</div>
<div class="cs-box"><strong>Database</strong><span>Events, organizations, jobs, subscribers, usage</span></div><div class="cs-arrow">&rarr;</div>
<div class="cs-box"><strong>Edge pages and email</strong><span>40 calendars, feeds, Sunday issues, health</span></div>
</div>
<h2>How a change reaches production</h2>
<ol>
<li><strong>Branch or direct commit</strong> with a message that says what changed and why. Every commit carries a co-author line naming the AI model that wrote it, so the history shows which work was human directed and which was generated.</li>
<li><strong>Push to main deploys</strong> through Cloudflare Pages. The deploy status is checked by script before anything that depends on it runs.</li>
<li><strong>Schema changes are numbered migrations</strong> in the repo, applied by hand to the production database and recorded, so the database and the code can be reconciled at any time. There have been 25 migrations in the first week.</li>
<li><strong>Bulk data loads go through a seed runner</strong>: idempotent statements committed to the repo, run in batches with per statement fallback, never SQL taken from a request.</li>
<li><strong>Verification is a step, not an afterthought.</strong> Pages are opened after deploy, numbers are re-queried, and high stakes work is checked by a second agent that did not see the first one's output.</li>
</ol>
<h2>APIs, feeds and MCP</h2>
<p>The site talks to the world three ways, and the distinction matters when designing automation. <strong>Plain HTTP APIs</strong> are used for the ATS boards (each vendor exposes JSON differently, hence ten adapters), for the email provider, and for the site's own admin endpoints. <strong>Feeds</strong> (iCal, RSS) are pulled on a schedule and diffed by a content hash, so a page that has not changed is not re-read. <strong>MCP</strong> (Model Context Protocol) is how the AI side reaches tools: the research agents query the database, read Google Sheets and drive a browser through MCP servers rather than through hand written integrations. The rule of thumb used here: an API is a contract between two programs; MCP is a contract between a model and a set of tools, with the model choosing which to call. The site itself exposes APIs; the operator's agents consume them through MCP.</p>
<h2>Cost and scale controls</h2>
<p>Edge caching for anonymous pages, a two day stale copy as a fallback, bounded month views, a robots policy that keeps crawlers on plain pages, a metered database binding that counts rows read per request, and a daily read budget with an alert. Monthly running cost is about $5 for compute and database, plus email volume.</p>
<h2>Numbers</h2>
<p>About 150 commits in the first seven days, 40 city calendars launched from a data driven playbook (a city is a row, not a code change), 10 ATS adapters, 4 feed adapters, 25 migrations, 2 scheduled workers and 4 weekly scheduled AI tasks.</p>`,
  },
  "ai-governance": {
    title: "AI governance in practice",
    kicker: "How the agents are controlled",
    blurb: "Most of the research is done by AI agents. They are productive because they are constrained: narrow briefs, hold rules, an evidence trail, and a second agent checking the first.",
    body: `
<h2>The AI system inventory</h2>
<table class="cs-table"><thead><tr><th>System</th><th>Purpose</th><th>Autonomy</th><th>Controls</th></tr></thead><tbody>
<tr><td>Weekly event sweep</td><td>Finds new events across 40 cities and the virtual calendar</td><td>Writes to the review queue; never publishes directly</td><td>Change detection decides what it reads; 30 fetch budget per city; dedupe before insert; hold rules; reviewer notes name the page verified</td></tr>
<tr><td>Jobs lane</td><td>Finds hiring posts and names the person who posted</td><td>Writes pending roles; never applies, messages or connects</td><td>Employer's own posting required; aggregators banned; a person must be named, not a company page</td></tr>
<tr><td>Sunday note drafter</td><td>Writes the personal note and picks in the publisher's voice</td><td>Writes drafts only; the site sends on schedule</td><td>Voice rules in the brief; preview to the publisher the day before; one issue per city per week</td></tr>
<tr><td>Research passes (city launches, sponsor sweeps)</td><td>Bulk discovery of organizers, events and employers</td><td>Produces files; a merge script with explicit rules loads them</td><td>Confidence field per row; medium confidence or missing venue is held; verification by a separate agent against the organizer's page; duplicates dropped by fuzzy match</td></tr>
<tr><td>Hourly maintenance</td><td>Publishes rows whose hold has passed, checks boards and feeds</td><td>Fully automatic within fixed rules</td><td>Request budget per run; boards that fail are paused with the error recorded; usage metered</td></tr>
</tbody></table>
<h2>Publish by default, with holds</h2>
<p>Every researched row lands as pending with a 24 hour timer. It publishes itself unless held or rejected. A row is held only for stated reasons: the venue or time is not confirmed, the source was an aggregator rather than the organizer, the topical fit is doubtful, or it might duplicate an existing row. The reason is written in the row's reviewer notes. This keeps the human from being a bottleneck while making every exception visible and explainable.</p>
<h2>Evidence trail</h2>
<p>Each row records its source, the page it was verified on, the date, who or what verified it, and every later change as an appended note. A reviewer can answer "why is this here" for any listing in under a minute. That is the same property a model governance program needs for a recommendation decision: provenance, the rule applied, and who signed off.</p>
<h2>Separation of duties between agents</h2>
<p>Verification is done by an agent that was not given the first agent's conclusions, only the row and the organizer's page. The first pass is optimistic by design (find things), the second is skeptical (confirm or reject). Of 107 held rows in one pass, 88 were confirmed, 13 rejected and 6 kept on hold, and the rejections were mostly members only events and stale listings the first pass could not have known about.</p>
<h2>Budgets as a control</h2>
<p>Agents have explicit budgets: searches per city, fetches per run, tokens per sweep. When the search budget ran out mid launch the last four cities came out thin, which was visible in the numbers and was fixed with a second pass. Budget exhaustion is treated as a reportable condition, not a silent degradation.</p>
<h2>What this maps to</h2>
<p>Inventory of AI systems with purpose and autonomy level; human oversight proportionate to risk (none for publishing a free meetup, more for anything that emails people); logging and traceability; bias toward reversible actions; and a written policy on what agents may never do (send email, post, sign in, click apply, publish directly). Those are the controls an AI governance program asks for, applied to a small system where they can be seen working.</p>`,
  },
  privacy: {
    title: "Privacy and data flow",
    kicker: "What personal data exists and where it goes",
    blurb: "A subscriber gives an email address and a city. Everything else is a design choice, and each one is written down.",
    body: `
<h2>Data inventory</h2>
<table class="cs-table"><thead><tr><th>Data</th><th>Why</th><th>Where it goes</th><th>Retention</th></tr></thead><tbody>
<tr><td>Subscriber email, city, status, sign up source</td><td>Send the Sunday email</td><td>Database; email provider at send time</td><td>Until unsubscribe, then kept as unsubscribed so the address is not re-added by a feed or import</td></tr>
<tr><td>Per subscriber tokens (profile, unsubscribe, click)</td><td>One click unsubscribe, profile edits, optional click attribution</td><td>Only in links inside that subscriber's own email</td><td>Lifetime of the subscription; the click token is separate so a shared link never opens the profile</td></tr>
<tr><td>Link clicks with subscriber id</td><td>Learn which events a reader opens, to improve picks</td><td>Database only</td><td>Only when the subscriber leaves personalization on; switch is on the profile page</td></tr>
<tr><td>CPE attendance log</td><td>Subscriber's own record of events attended</td><td>Database; export to the subscriber</td><td>Subscriber controlled</td></tr>
<tr><td>Organizer and speaker names, public event data</td><td>The calendar</td><td>Public pages</td><td>Public information from organizers' own pages</td></tr>
<tr><td>Job postings and the name of the person who posted publicly</td><td>The jobs board</td><td>Public pages, linking to the employer's own posting</td><td>Expires with the posting; names only from public posts</td></tr>
</tbody></table>
<h2>Records of processing, in short</h2>
<p>Purpose: publishing a calendar and sending a weekly email the reader asked for. Lawful basis: consent on sign up with a visible description of what is sent, double opt in for referral driven sign ups. Processors: the hosting and database provider and the email provider, both under their standard terms. No advertising pixels, no third party analytics scripts, no sale or sharing of addresses. Sponsors buy a slot in the email; they never receive the list.</p>
<h2>Design choices worth pointing at</h2>
<ul>
<li><strong>Personalization is opt out and explained.</strong> The privacy page says what the click token does and the profile page has the switch. Links are plain when it is off.</li>
<li><strong>Tokens are separated by purpose.</strong> A click token cannot open a profile or the CPE log, so a forwarded email leaks nothing that matters.</li>
<li><strong>Admin sits behind an identity aware proxy</strong>, not a password on the page, and every admin change is a same origin POST.</li>
<li><strong>Secrets live in the platform's secret store</strong>, never in the repo or in chat transcripts, and were rotated once when a provider was removed.</li>
</ul>
<h2>Automating a multi source flow</h2>
<p>The privacy relevant lesson from the build is the same one an impact assessment pipeline needs: sources arrive in different shapes (ten ATS formats, three feed formats, free text from agents), so the work is a normalizing layer with a strict schema, a dedupe step with a fuzzy key, a hold rule for anything uncertain, and a reviewer queue that only shows exceptions. That turns a manual review of everything into a manual review of what the rules could not decide.</p>`,
  },
  operations: {
    title: "Running it like a business",
    kicker: "Operations, incidents, risk and recovery",
    blurb: "Monitoring, a runbook, a risk register, a recovery plan and a postmortem for the one real incident so far.",
    body: `
<h2>Operating cadence</h2>
<table class="cs-table"><thead><tr><th>When</th><th>What</th></tr></thead><tbody>
<tr><td>Hourly</td><td>Publish due rows, reminders, a few job boards and feeds, change detection, usage flush, budget check</td></tr>
<tr><td>Friday</td><td>Event sweep across all calendars; jobs lane for posted by names</td></tr>
<tr><td>Saturday</td><td>Sunday note drafted; previews to the publisher for cities with subscribers plus one digest</td></tr>
<tr><td>Sunday 8 AM local</td><td>Each city's email sends itself</td></tr>
<tr><td>Monday</td><td>Numbers email: subscribers, events, jobs, boards and feeds that need a look, database usage</td></tr>
</tbody></table>
<h2>Monitoring</h2>
<p>A public health endpoint reports the database, today's rows read against a budget, and the age of the last hourly run, returning a failure code when any is wrong, so an external monitor can watch it. Alerts email the operator at most once an hour when a fallback page is served and once a day when reads pass the budget. Public pages answer with a header saying whether they came from cache, from the stale fallback, or fresh.</p>
<h2>Incidents</h2>
<div class="cs-tiles">
<a class="cs-tile cs-tile-inc" href="/casestudy/incident-2026-001"><span class="cs-tile-k">INC-2026-001 &middot; Sev 1 &middot; resolved</span><strong>Database read limit outage</strong><span>About 7 hours overnight, Oct 22 to 23. Root cause: unindexed duplicate checks in bulk loads on a plan with a hard daily read limit. Eleven action items, nine done.</span></a>
</div>
<h2>Risk register</h2>
<table class="cs-table"><thead><tr><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Treatment</th><th>Status</th></tr></thead><tbody>
<tr><td>Database allowance or budget exceeded</td><td>Was high, now low</td><td>Full outage</td><td>Paid plan, indexes, cache with stale fallback, metering, budget alert</td><td>Treated; occurred once (INC-2026-001)</td></tr>
<tr><td>Email provider suspends sending (complaints, bounces)</td><td>Low</td><td>No Sunday email</td><td>Double opt in on referrals, one click unsubscribe, bounce and complaint events recorded, per city sends</td><td>Monitored</td></tr>
<tr><td>Agent publishes something wrong or embarrassing</td><td>Medium</td><td>Reputation</td><td>24 hour hold, hold rules, verification pass, organizer's own link only, reviewer notes</td><td>Treated</td></tr>
<tr><td>Crawler or scraper load</td><td>Medium</td><td>Cost</td><td>Edge cache, bounded views, robots policy, budget alert</td><td>Treated</td></tr>
<tr><td>Source site blocks the fetcher (ATS, Meetup)</td><td>High</td><td>Thin data for that source</td><td>Pause with error recorded, visible in Monday numbers, browser route as fallback</td><td>Accepted; occurs weekly</td></tr>
<tr><td>Single operator unavailable</td><td>Medium</td><td>Nothing publishes beyond the automatic rules</td><td>Everything runs on schedule without the operator; runbook; recovery plan</td><td>Partly treated</td></tr>
<tr><td>Secret exposure</td><td>Low</td><td>Email abuse, data access</td><td>Secrets only in the platform store, admin behind identity proxy, rotation done once</td><td>Treated</td></tr>
<tr><td>Loss of the database</td><td>Low</td><td>Loss of subscribers and curated data</td><td>Point in time recovery for 30 days, code and seeds in version control, export procedure</td><td>See recovery plan</td></tr>
<tr><td>Legal: listing an event the organizer objects to, or a name from a public post</td><td>Low</td><td>Takedown request</td><td>Organizer's own link always; names only from public posts; correction address on every page</td><td>Accepted</td></tr>
</tbody></table>
<h2>Recovery plan</h2>
<p>Read the <a href="/casestudy/recovery">disaster recovery plan</a>: what is backed up where, recovery objectives, the restore procedure and what has been tested.</p>
<h2>Vendor register</h2>
<table class="cs-table"><thead><tr><th>Vendor</th><th>Used for</th><th>Data it sees</th><th>Dependency</th></tr></thead><tbody>
<tr><td>Cloudflare</td><td>Hosting, database, identity proxy, DNS, cache</td><td>Everything</td><td>Critical</td></tr>
<tr><td>Resend</td><td>Transactional and newsletter email</td><td>Subscriber addresses at send time</td><td>Critical for email</td></tr>
<tr><td>GitHub</td><td>Source control and deploy trigger</td><td>Code, no secrets</td><td>Critical for change</td></tr>
<tr><td>Google Workspace</td><td>Operator's sheets and mail used by research tasks</td><td>Sponsor and contact lists</td><td>Operational</td></tr>
<tr><td>Anthropic</td><td>Research and operations agents</td><td>Public pages, database contents during tasks</td><td>Operational</td></tr>
<tr><td>Meetup, Luma, BrightTALK, SANS, ATS vendors</td><td>Source feeds and boards</td><td>None of ours</td><td>Degrades gracefully</td></tr>
</tbody></table>`,
  },
  "incident-2026-001": {
    title: "INC-2026-001: database read limit outage",
    kicker: "Postmortem",
    blurb: "Sev 1, about seven hours, no data lost. Blameless, with action items.",
    body: `
<p><strong>Date:</strong> 2026-10-23. <strong>Duration:</strong> roughly 22:30 PT Oct 22 to 05:25 PT Oct 23. <strong>Impact:</strong> every public page returned an error; no data lost; no email affected.</p>
<h2>Summary</h2>
<p>The database was on a free plan with a hard limit of 5 million rows read per day. An evening of bulk research loads, each statement guarded by an unindexed duplicate check that scanned the whole table, consumed the allowance. From then on every query failed, and because every page needed the database, every page failed until the account was upgraded the next morning.</p>
<h2>Timeline</h2>
<table class="cs-table"><tbody>
<tr><td>Evening</td><td>Three bulk loads run: a second research pass, a 492 statement sponsor pass, a 112 statement verification fix</td></tr>
<tr><td>22:30</td><td>First failed query, inside a job board check, read as a vendor problem</td></tr>
<tr><td>04:30</td><td>Second failure, same misread</td></tr>
<tr><td>04:32</td><td>Public page loaded during other work shows the error; cause identified from the error text within two minutes</td></tr>
<tr><td>04:35 to 04:45</td><td>Mitigations shipped before the database was back: edge cache with stale fallback, friendly 503, bounded month views, robots change, index migration written</td></tr>
<tr><td>05:25</td><td>Account upgraded; site back immediately</td></tr>
<tr><td>05:30 to 06:40</td><td>Indexes applied, pending jobs run, metering, health endpoint and alerts shipped</td></tr>
</tbody></table>
<h2>Root cause</h2>
<p>Unindexed duplicate checks in bulk loads, on a plan whose limit is daily and absolute. Both halves mattered: the paid plan removes the hard stop, the indexes remove the waste.</p>
<h2>Contributing factors</h2>
<ul><li>No usage visibility of any kind.</li><li>No degraded mode: every page needed the database on every request.</li><li>Unbounded crawl surface from month and filter views.</li><li>The first signal was misattributed for six hours because it surfaced inside an unrelated task.</li><li>Growth from one city to forty in a week outran the plan.</li></ul>
<h2>What went well</h2>
<ul><li>Cause identified in two minutes once seen.</li><li>Mitigations designed and deployed in fifteen minutes, ready before the database unlocked.</li><li>Clear, cheap decision for the owner, made within the hour.</li><li>Clean recovery, nothing lost.</li></ul>
<h2>What went poorly</h2>
<ul><li>Six hours from first failure to recognition.</li><li>Loads were run without considering read cost.</li><li>No runbook existed; the response was improvised.</li></ul>
<h2>Action items</h2>
<table class="cs-table"><thead><tr><th>#</th><th>Action</th><th>Status</th></tr></thead><tbody>
<tr><td>1</td><td>Upgrade plan (reads are billed past the allowance, never blocked)</td><td>Done</td></tr>
<tr><td>2</td><td>Indexes on every column used by duplicate guards and maintenance queries</td><td>Done</td></tr>
<tr><td>3</td><td>Edge cache, two day stale fallback, plain notice page</td><td>Done</td></tr>
<tr><td>4</td><td>Bound month views; crawlers kept off query URLs</td><td>Done</td></tr>
<tr><td>5</td><td>Meter rows read and written per day</td><td>Done</td></tr>
<tr><td>6</td><td>Health endpoint with budget and job freshness</td><td>Done</td></tr>
<tr><td>7</td><td>Fallback and budget alerts, rate limited</td><td>Done</td></tr>
<tr><td>8</td><td>Usage in the Monday numbers</td><td>Done</td></tr>
<tr><td>9</td><td>External uptime monitor on the health endpoint</td><td>Open</td></tr>
<tr><td>10</td><td>Operations runbook</td><td>Done</td></tr>
<tr><td>11</td><td>Standing rule: check usage before and after any bulk load</td><td>Adopted</td></tr>
</tbody></table>
<h2>Lessons</h2>
<p>Visibility before scale. Degrade, do not fail. A plan limit is an architectural constraint. Check the shared dependency first when a task fails.</p>`,
  },
  recovery: {
    title: "Disaster recovery plan",
    kicker: "What is backed up, how fast it comes back",
    blurb: "Short on purpose. A calendar does not need a continuity plan; it needs to know how it gets its data back.",
    body: `
<h2>What exists and where</h2>
<table class="cs-table"><thead><tr><th>Asset</th><th>Primary</th><th>Copy</th><th>Recovery</th></tr></thead><tbody>
<tr><td>Code, migrations, seeds, adapters</td><td>Cloudflare Pages deploy</td><td>GitHub repository</td><td>Push to main redeploys in about two minutes</td></tr>
<tr><td>Database (events, organizations, jobs, subscribers, issues)</td><td>Cloudflare D1</td><td>Point in time recovery, any minute in the last 30 days; manual export on demand</td><td>Restore to a bookmark in minutes; export and import if the account itself is lost</td></tr>
<tr><td>Email templates and sending</td><td>Code plus Resend</td><td>Repo; provider keeps delivery logs</td><td>Re-add the domain and key at a new provider if needed</td></tr>
<tr><td>Secrets</td><td>Cloudflare secret store</td><td>None by design</td><td>Rotate and re-enter; the runbook lists which ones exist</td></tr>
<tr><td>Research data files</td><td>Session scratch space</td><td>Loaded results are in the database and the seed modules in the repo</td><td>Regenerate from seeds</td></tr>
<tr><td>Documentation (playbooks, postmortems, runbook)</td><td>Project knowledge base</td><td>Key documents mirrored on these pages</td><td>No recovery needed for the site to run</td></tr>
</tbody></table>
<h2>Objectives</h2>
<p><strong>Recovery point objective:</strong> one hour for the database (point in time recovery is per minute, and the hourly job is the only writer most of the day). <strong>Recovery time objective:</strong> one hour for a database restore, fifteen minutes for a code rollback, one day for moving email providers. During a database outage, cached pages keep serving for up to two days, so readers see a stale calendar rather than an error.</p>
<h2>Scenarios</h2>
<table class="cs-table"><thead><tr><th>Scenario</th><th>Response</th></tr></thead><tbody>
<tr><td>Bad deploy</td><td>Revert the commit and push. Pages keeps every previous deployment, so a rollback is also one click in the dashboard.</td></tr>
<tr><td>Bad migration or data corruption (for example a seed that overwrote good rows)</td><td>Restore the database to the minute before the load using point in time recovery. Re-run anything legitimate that happened after.</td></tr>
<tr><td>Database unavailable (quota, platform incident)</td><td>Cached pages and the notice page serve automatically. Alert fires. Wait or fix the quota; nothing to restore.</td></tr>
<tr><td>Email provider suspended</td><td>Sends fail with the error recorded on the issue. Resolve with the provider or re-point the domain at another; subscribers are in the database, not the provider.</td></tr>
<tr><td>Account compromise</td><td>Rotate every secret, revoke the identity proxy sessions, review the admin audit of recent changes, restore the database to before the compromise if data changed.</td></tr>
<tr><td>Operator unavailable</td><td>Everything scheduled keeps running. Held rows wait. The runbook plus repository access is enough for someone else to take over.</td></tr>
</tbody></table>
<h2>Tests</h2>
<ul>
<li><strong>Code rollback:</strong> exercised in practice several times during the first week (reverting and redeploying), each under five minutes.</li>
<li><strong>Stale page fallback:</strong> tested the day it was built, with a forced failure, and observed during INC-2026-001 once deployed.</li>
<li><strong>Database point in time restore:</strong> not yet tested. Scheduled as the next exercise: restore to a bookmark from the previous hour into the same database during a quiet window, confirm counts, and record the time taken. Until that is done this plan's one hour recovery time is an expectation, not a measurement.</li>
</ul>`,
  },
};

export function home(n) {
  const stat = (v, l) => html`<div class="cs-stat"><strong>${v}</strong><span>${l}</span></div>`;
  return html`
  <section class="cs-hero"><div class="wrap">
    <p class="kicker kicker-light">Case study</p>
    <h1>The Watch: a multi city security events calendar, built and run as a product in one week.</h1>
    <p class="cs-lede">Forty city calendars, a jobs board and a Sunday email, researched largely by AI agents under written controls, running on about $5 a month of infrastructure. This page shows how it is engineered, how the AI is governed, how personal data is handled, and how it is operated. Nothing here is a mock up: the numbers below are live from the database.</p>
    <div class="cs-stats">${stat(n.cities, "city calendars")}${stat(n.events, "upcoming events published")}${stat(n.orgs, "organizations")}${stat(n.feeds, "live feeds")}${stat(n.boards, "employer job boards")}${stat(n.jobs, "live roles")}</div>
    <p class="cs-fine">Built from October 17 to 24, 2026 by Jerome Jayapal with Claude as the engineering and research partner. About 150 commits, 25 schema migrations, 2 scheduled workers, 4 weekly AI tasks, 1 incident with a postmortem.</p>
  </div></section>
  <section class="band"><div class="wrap">
    <div class="cs-tiles cs-tiles-4">
      ${Object.entries(SECTIONS).filter(([k]) => !["incident-2026-001", "recovery"].includes(k)).map(([k, s]) => html`<a class="cs-tile" href="/casestudy/${k}"><span class="cs-tile-k">${s.kicker}</span><strong>${s.title}</strong><span>${s.blurb}</span></a>`)}
    </div>
    <div class="cs-tiles cs-tiles-2" style="margin-top:14px">
      <a class="cs-tile cs-tile-inc" href="/casestudy/incident-2026-001"><span class="cs-tile-k">Incident &middot; Sev 1 &middot; resolved</span><strong>INC-2026-001: database read limit outage</strong><span>Seven hours overnight, no data lost, eleven action items. Read the postmortem.</span></a>
      <a class="cs-tile" href="/casestudy/recovery"><span class="cs-tile-k">Disaster recovery</span><strong>Recovery plan and objectives</strong><span>What is backed up where, one hour RPO and RTO for the database, and which tests have been run.</span></a>
    </div>
  </div></section>
  <section class="band band-paper"><div class="wrap narrow prose">
    <h2>The week, in order</h2>
    <table class="cs-table"><tbody>
    <tr><td>Oct 17</td><td>San Diego calendar, submissions, sign ups, admin and the newsletter generator. First 38 organizers and 25 events.</td></tr>
    <tr><td>Oct 18 to 20</td><td>Feeds (iCal, BrightTALK, SANS), review queue, the virtual calendar, sponsor slots, a sweep of 815 vendors for virtual sessions, Cloudflare Access on the admin, key rotation.</td></tr>
    <tr><td>Oct 21</td><td>Jobs board with ten ATS adapters, publish by default with holds, cities as data, CPE log, referral links, speaker board, LinkedIn page posting (held pending approval), organization enrichment.</td></tr>
    <tr><td>Oct 22</td><td>Nine cities launched by hand, then a playbook, then 31 more by data: 40 calendars live. Per subscriber click tokens with an opt out. Saturday preview digest.</td></tr>
    <tr><td>Oct 23</td><td>Second research pass, 158 in person vendor events verified and loaded, the database read limit incident, postmortem, runbook, metering, health and alerts, this page.</td></tr>
    </tbody></table>
    <h2>Three design decisions I would defend</h2>
    <p><strong>Publish by default with holds</strong>, rather than approve everything by hand. A one person operation cannot review 700 rows a week, and a calendar that is three days stale is not a calendar. The holds make the exceptions visible and the reviewer notes make them explainable.</p>
    <p><strong>Cities as data, not code.</strong> Launching a city is a row plus research. That is why forty happened in two days and why the fortieth cost the same as the second.</p>
    <p><strong>The organizer's own link, always.</strong> Never an aggregator, never a ticket reseller, never a job board. It costs research time and it is the single thing that makes the site trustworthy.</p>
  </div></section>`;
}

export const CSS = `
.cs-hero{background:var(--navy);color:#fff;padding:48px 0 36px}.cs-hero h1{color:#fff;font-size:clamp(1.6rem,3.2vw,2.4rem);max-width:820px}.cs-lede{max-width:760px;font-size:1.05rem;color:#CFE3F5;line-height:1.6}.cs-fine{color:#9FB6CC;font-size:.9rem;margin-top:18px}
.cs-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-top:26px}.cs-stat{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px 14px}.cs-stat strong{display:block;font-size:1.7rem;color:#1FB6F0;font-family:var(--display)}.cs-stat span{font-size:.82rem;color:#CFE3F5}
.cs-tiles{display:grid;gap:14px}.cs-tiles-4{grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}.cs-tiles-2{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.cs-tile{display:block;border:1px solid #DCE4EE;border-radius:12px;padding:18px;text-decoration:none;color:var(--ink);background:#fff;transition:border-color .15s,transform .15s}.cs-tile:hover{border-color:#1FB6F0;transform:translateY(-1px)}.cs-tile strong{display:block;font-family:var(--display);font-size:1.1rem;margin:4px 0 6px}.cs-tile span{display:block;font-size:.9rem;color:#3d4a63}.cs-tile-k{font-size:.75rem!important;text-transform:uppercase;letter-spacing:.06em;color:#5B6B82!important}.cs-tile-inc{border-left:4px solid #D9480F}
.cs-table{width:100%;border-collapse:collapse;font-size:.92rem;margin:10px 0 22px}.cs-table th,.cs-table td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid #EEF2F7}.cs-table th{font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:#5B6B82}
.cs-diagram{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px;margin:14px 0 24px}.cs-box{flex:1 1 150px;border:1px solid #DCE4EE;border-radius:10px;padding:12px;background:#fff}.cs-box strong{display:block;margin-bottom:4px}.cs-box span{font-size:.85rem;color:#3d4a63}.cs-arrow{align-self:center;color:#1FB6F0;font-size:1.4rem}
.cs-gate{max-width:440px;margin:60px auto;padding:0 20px}.cs-gate input{width:100%;padding:12px;border:1px solid #DCE4EE;border-radius:8px;font-size:1rem;margin:10px 0}
@media (max-width:640px){.cs-diagram{flex-direction:column}.cs-arrow{transform:rotate(90deg);align-self:flex-start;margin-left:20px}}`;
