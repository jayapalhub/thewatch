# The Watch San Diego

The events calendar and weekly email for San Diego's cybersecurity community, published by Better Security at bettersecurity.ai. Plain HTML, CSS and JavaScript on Cloudflare Pages, with Pages Functions for every dynamic page, Cloudflare D1 as the database, Beehiiv as the sending list and Resend for one off emails. No framework, no build step.

See `SPEC.md` for the plan this was built from: positioning, data model, workflow and launch sequence.

## Layout

```
functions/            Every page and API is a Pages Function (server rendered from D1)
  _lib/               Shared code: html helpers, dates, layout, events, calendar (.ics), integrations, auth, newsletter
  index.js            /            homepage
  sandiego/           /sandiego    calendar (list and month), event pages, organizer pages, feeds
  events/             /events      Better Security's own events, Padel Social page
  submit.js sponsor.js subscribe.js profile.js about.js privacy.js terms.js
  api/                subscribe, interest, submit, sponsor, profile, beehiiv-webhook
  go/[id].js          click tracked redirects used by the newsletter
  admin/              review queue, events, organizers, people (CSV export), sponsor inquiries, newsletter issues
public/               Static assets (css, js, images), _headers, robots.txt
migrations/           D1 schema (applied with wrangler)
scripts/seed.mjs      Turns data/seed/*.json into SQL for organizations and events
data/seed/            Researched organizers and events
```

## Run it locally

```bash
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev            # http://localhost:8788  (DEV_MODE=1 so /admin needs no login locally)
```

## Deploy to Cloudflare, step by step

1. **Create the Pages project.** In the Cloudflare dashboard go to Workers & Pages, Create, Pages, connect the GitHub repo. Framework preset None, build command blank, build output directory `public`. Every push to `main` deploys.
2. **Create the database.** Run `npx wrangler d1 create thewatch` (after `npx wrangler login`), paste the `database_id` it prints into `wrangler.toml`, commit, then run `npm run db:migrate:remote` and `npm run db:seed:remote`.
3. **Bind the database to Pages.** Pages project, Settings, Bindings, add a D1 binding named `DB` pointing at `thewatch` (production and preview).
4. **Secrets.** Pages project, Settings, Variables and Secrets, add as encrypted: `BEEHIIV_API_KEY`, `RESEND_API_KEY`, `ADMIN_TOKEN` (any long random string, used by scripts), `BEEHIIV_WEBHOOK_SECRET` (another random string). Optional: `PADEL_EVENTBRITE_URL` once the Eventbrite listing exists; the Padel page switches from the interest form to the ticket button automatically.
5. **Plain variables.** `SITE_URL`, `BEEHIIV_PUBLICATION_ID`, `FROM_EMAIL`, `NOTIFY_EMAIL` are in `wrangler.toml` and can be overridden in the dashboard. Leave `DEV_MODE` unset or `0` in production.
6. **Protect the admin with Cloudflare Access.** Zero Trust, Access, Applications, add a self hosted application for `bettersecurity.ai/admin` (and the `pages.dev` preview hostname if you use it), identity provider Google (or the one time PIN), policy allowing your email addresses. Copy the application's Audience (AUD) tag and your team domain (`<team>.cloudflareaccess.com`) into the Pages variables `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN`. Until those two are set, `/admin` returns 401 in production, which is the safe default.
7. **Custom domain.** Pages project, Custom domains, add `bettersecurity.ai`. compass stays on its own subdomain and is untouched.
8. **Beehiiv.** Create custom fields named `Source`, `Tags`, `Company`, `First Name`, `Last Name`, `Role`, `Seniority`, `Interests` (text). Turn on double opt in if you want confirmed subscribers only. Add a webhook for `subscription.unsubscribed` pointing at `https://bettersecurity.ai/api/beehiiv-webhook?secret=<BEEHIIV_WEBHOOK_SECRET>` so unsubscribes sync back to D1.
9. **Resend.** `bettersecurity.ai` is already verified; add `watch@bettersecurity.ai` as a sender if Resend asks for it.
10. **Analytics.** Pages project, Web Analytics, enable. Newsletter clicks are counted by `/go/<id>` and shown per event and per issue in the admin.

## The Sunday routine

1. `/admin/review`: approve, edit or reject anything pending.
2. `/admin/issues`, Draft next week: pick one or two featured events, write the note, add a sponsor if there is one, Save.
3. Copy for Beehiiv, paste into a new post, check on your phone, schedule for Sunday 5:00 PM.
4. Mark pasted to Beehiiv so clicks are attributed to the issue.

## Adding events from research

Put new rows in `data/seed/events.json` (same shape the research agents produce) and run `npm run db:seed:remote`. Rows upsert by slug, so re-running is safe. Or add them one at a time in `/admin/events/new`.
