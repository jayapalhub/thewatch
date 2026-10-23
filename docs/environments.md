# Environments

The Watch runs in three places. Each has its own database, and only one of them can send anything.

| | Development | Preview | Production |
|---|---|---|---|
| Where | `npm run dev` on your machine | the Pages deployment of every pull request (`*.thewatch.pages.dev`) | bettersecurity.ai, deployed from `main` |
| Database | local D1 in `.wrangler/` | `thewatch-staging` (D1 id `f4236033-993f-4427-945b-e7b9eaa4777d`) | `thewatch` |
| `ENVIRONMENT` var | unset | `preview` | `production` |
| `/admin` | open (`DEV_MODE=1`) | closed: `DEV_MODE=0` and no Access session on `pages.dev`, so protected routes answer 401 (add the hostname to the Access application to use it) | Cloudflare Access |
| Email, LinkedIn | sent if a key is set locally | never sent, logged as skipped | sent |
| Lazy jobs on page visits | run | skipped | run |

The configuration lives in `wrangler.toml`. The top level `[vars]` and `[[d1_databases]]` are production. `[env.preview]`
restates every var and the database binding for previews, because Pages treats vars and bindings as non inheritable: an
environment that defines its own gets only what is written under it. When a var is added to `[vars]`, add it to
`[env.preview.vars]` too; `test/wrangler-env.test.js` fails when the two drift apart or when the preview binding names the
production database.

## What a preview cannot do

With `ENVIRONMENT = "preview"` the code returns before any outward call:

- `sendEmail` and `notifyJerome` (`functions/_lib/integrations.js`), and the newsletter's own Resend calls in
  `functions/_lib/dispatch.js`, log one line (`preview: skipped email ...`) with no recipients or bodies and return
  `{ ok: true, skipped: "preview" }`.
- A queued LinkedIn post (`sendQueued` in `functions/_lib/linkedin.js`) is marked `skipped` with the reason instead of
  going to the page or the webhook.
- The background jobs that pages start on a visit (`lazyAutoPublish`, `lazyNewsletterTick`, `lazyReminders`,
  `lazyJobs`) return without touching the database.

The cron Worker only ever calls bettersecurity.ai, so it never reaches a preview. The admin pages work on a preview
against staging data, and their Run and Send now buttons go through the same guards. `test/preview-guards.test.js`
covers each path.

The Resend key must also be absent from the Preview environment in the dashboard (Pages project, Settings, Variables and
Secrets, Preview). The guards are the second line; an empty key is the first.

## Keeping staging current

Every new migration is applied to both databases. Production is applied by hand as before; staging the same way, with
the staging name. The staging binding is defined only under `env.preview` in `wrangler.toml`, so wrangler needs
`--env preview` to find it:

```bash
npx wrangler d1 migrations apply thewatch-staging --remote --env preview
```

The D1 connector in Claude is the dependable route: on 2026-10-23 wrangler on Jerome's machine returned error 7403
("The given account is not valid or is not authorized to access this service") for the staging database, so staging was
loaded through the connector instead, with each migration recorded in `d1_migrations` by name exactly as wrangler
would, so either route can be used next time.

Then, when the sample data should be refreshed or the calendar has run out of upcoming events (the seed's dates are
relative to the day it is loaded):

```bash
npx wrangler d1 execute thewatch-staging --remote --env preview --file tools/staging/seed.sql
```

The seed is idempotent, so loading it again adds nothing new; it is also run by `test/staging-seed.test.js` against every
migration, so a migration that breaks it fails CI. The data is fictional: made up organizers and employers on `.test`
hosts, no subscribers and no real person's address. When staging was first loaded, the production data that some
migrations insert (the ten real job boards in 0016, the feed sources in 0003, the sweep targets in 0008, the LinkedIn
page id in 0017) was left out, so staging holds only the three sample boards. A fresh `migrations apply` on an empty
database would add them; running one from the staging admin reads that employer's public board and writes only to
staging. D1 refuses a compound SELECT with many terms, which Node's SQLite allows, so the seed uses `VALUES` lists and
`test/staging-seed.test.js` fails on any `UNION`.

Never load `tools/staging/seed.sql` into production. The slugs all start with `staging-` so a mistake would be visible,
but the guard is to read the database name before pressing enter.
