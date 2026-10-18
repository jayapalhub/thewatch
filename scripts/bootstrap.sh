#!/usr/bin/env bash
# One time setup: creates the D1 database, applies the schema, seeds organizers
# and events, creates the Pages project and deploys a first preview.
#
# Usage (from the repo root, with Node 18+ installed):
#   export CLOUDFLARE_API_TOKEN=...     # token with Pages Edit, D1 Edit, Account Settings Read
#   export CLOUDFLARE_ACCOUNT_ID=...    # from the dashboard URL
#   bash scripts/bootstrap.sh
#
# Safe to re-run: every step checks whether it already happened.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN first}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID first}"
PROJECT="${PAGES_PROJECT:-thewatch}"
DB="thewatch"

echo "==> Installing wrangler"
npm install --silent

echo "==> Checking the token"
npx wrangler whoami >/dev/null

echo "==> D1 database"
if grep -q "00000000-0000-0000-0000-000000000000" wrangler.toml; then
  if ! npx wrangler d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);process.exit(j.some(d=>d.name==="'"$DB"'")?0:1)})'; then
    npx wrangler d1 create "$DB" >/dev/null
  fi
  ID=$(npx wrangler d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const d=j.find(x=>x.name==="'"$DB"'");console.log(d.uuid||d.id)})')
  echo "    database id: $ID"
  # Write the real id into wrangler.toml (works with BSD and GNU sed)
  node -e 'const fs=require("fs");let t=fs.readFileSync("wrangler.toml","utf8");t=t.replace("00000000-0000-0000-0000-000000000000",process.argv[1]);fs.writeFileSync("wrangler.toml",t)' "$ID"
else
  echo "    wrangler.toml already has a database id"
fi

echo "==> Applying migrations"
npx wrangler d1 migrations apply "$DB" --remote

echo "==> Seeding organizers and events"
node scripts/seed.mjs > scripts/seed.sql
npx wrangler d1 execute "$DB" --remote --file scripts/seed.sql >/dev/null
echo "    seeded"

echo "==> Pages project"
if ! npx wrangler pages project list 2>/dev/null | grep -q "^│ $PROJECT "; then
  npx wrangler pages project create "$PROJECT" --production-branch main >/dev/null
fi

echo "==> Deploying"
npx wrangler pages deploy public --project-name "$PROJECT" --branch main --commit-dirty=true

cat <<EOF

Done. Next, in the Cloudflare dashboard (Workers & Pages, $PROJECT):
  1. Settings > Variables and Secrets: add BEEHIIV_API_KEY, RESEND_API_KEY as encrypted secrets
     (copy them from the compass project's settings), plus ADMIN_TOKEN and BEEHIIV_WEBHOOK_SECRET
     (any long random strings). Redeploy after adding secrets.
  2. Settings > Builds: connect the GitHub repo jayapalhub/thewatch so pushes deploy automatically
     (build command blank, output directory public).
  3. Zero Trust > Access > Applications: protect /admin (see README step 6), then set
     ACCESS_TEAM_DOMAIN and ACCESS_AUD in Variables.
  4. Custom domains: add bettersecurity.ai when you're ready to replace the advisory site.
EOF
