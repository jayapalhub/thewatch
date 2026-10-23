#!/usr/bin/env bash
# D1 point in time restore rehearsal for The Watch (GitHub issue #4, DR plan in project doc 171).
#
# What it does, in order:
#   1. Checks you are logged in to wrangler (run `npx wrangler login` yourself first; nothing here signs in for you).
#   2. Waits for a quiet minute (not near the hourly run, not near the 10 minute newsletter tick on Fri to Sun).
#   3. Records row counts for the main tables.
#   4. Exports the whole database to backups/ as a safety copy.
#   5. Asks D1 for the bookmark for "now" (time travel info).
#   6. DRY RUN stops here. LIVE mode asks you to type RESTORE, then restores to that bookmark and times it.
#   7. Records row counts again, compares them, checks the public site, and writes a result file.
#
# Restoring to a bookmark taken seconds earlier exercises the full restore path with almost nothing to lose:
# only writes in the few seconds between steps 5 and 6 are rolled back, and the quiet minute guard makes that
# window empty in practice. Wrangler prints the bookmark from before the restore, so the restore itself can be undone.
#
# Usage:  scripts/dr-restore-rehearsal.sh            # dry run (default): steps 1 to 5 only
#         scripts/dr-restore-rehearsal.sh --live     # full rehearsal, with a typed confirmation
set -euo pipefail

DB="thewatch"
MODE="dry"
[[ "${1:-}" == "--live" ]] && MODE="live"
cd "$(dirname "$0")/.."
mkdir -p backups
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="backups/dr-rehearsal-$STAMP.txt"
W="npx --yes wrangler@3"

say() { echo "$*" | tee -a "$LOG"; }

counts() {
  $W d1 execute "$DB" --remote --json --command "SELECT
    (SELECT count(*) FROM events) AS events,
    (SELECT count(*) FROM organizations) AS organizations,
    (SELECT count(*) FROM jobs) AS jobs,
    (SELECT count(*) FROM subscribers) AS subscribers,
    (SELECT count(*) FROM job_sources) AS job_sources,
    (SELECT count(*) FROM feed_sources) AS feed_sources" 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s)[0].results[0];console.log(JSON.stringify(r))})'
}

say "The Watch D1 restore rehearsal, mode: $MODE, started $(date -u +%FT%TZ)"

say "Step 1: wrangler login check"
if ! $W whoami 2>/dev/null | grep -qi "associated with the email"; then
  echo "Not logged in. Run: npx wrangler login   (it opens your browser; sign in yourself), then run this again."
  exit 1
fi

say "Step 2: waiting for a quiet minute"
while :; do
  M=$((10#$(date -u +%M)))
  if (( M >= 6 && M <= 50 && M % 10 >= 2 && M % 10 <= 7 )); then break; fi
  sleep 15
done
say "  quiet minute reached at $(date -u +%T)"

say "Step 3: row counts before"
BEFORE="$(counts)"; say "  $BEFORE"

say "Step 4: safety export"
$W d1 export "$DB" --remote --output "backups/thewatch-$STAMP.sql" >/dev/null
say "  wrote backups/thewatch-$STAMP.sql ($(wc -c < "backups/thewatch-$STAMP.sql") bytes)"

say "Step 5: bookmark for now"
BOOKMARK="$($W d1 time-travel info "$DB" --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let b="";try{b=JSON.parse(s).bookmark||""}catch{};if(!b){const m=s.match(/[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{32}/);b=m?m[0]:""};console.log(b)})')"
[[ -n "$BOOKMARK" ]] || { say "Could not read a bookmark from time-travel info; stopping."; exit 1; }
say "  bookmark $BOOKMARK"

if [[ "$MODE" == "dry" ]]; then
  say "Dry run complete. Nothing was restored. Run with --live for the full rehearsal."
  exit 0
fi

echo
echo "LIVE: this restores the production database '$DB' to bookmark $BOOKMARK (taken moments ago)."
read -r -p "Type RESTORE to continue, anything else to stop: " OK
[[ "$OK" == "RESTORE" ]] || { say "Stopped before restoring."; exit 0; }

say "Step 6: restoring"
T0=$(date +%s)
$W d1 time-travel restore "$DB" --bookmark="$BOOKMARK" --json 2>&1 | tee -a "$LOG" || { say "Restore command failed; see output above."; exit 1; }
T1=$(date +%s)
say "  restore took $((T1 - T0)) seconds"

say "Step 7: row counts after and site check"
AFTER="$(counts)"; say "  $AFTER"
if [[ "$BEFORE" == "$AFTER" ]]; then say "  counts match"; else say "  COUNTS DIFFER, compare the two lines above"; fi
T2=$(date +%s)
HEALTH="$(curl -s -o /dev/null -w '%{http_code}' https://bettersecurity.ai/api/health)"
say "  /api/health returned $HEALTH"
say "Total time from restore start to verified: $((T2 - T0)) seconds"
say "Result file: $LOG"
