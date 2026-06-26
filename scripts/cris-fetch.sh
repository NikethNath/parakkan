#!/bin/sh
# Daily CRIS auto-fetch. Calls the in-app cron endpoint, which logs into CRIS
# with the stored credentials, downloads the Daily Sales Report, and caches it.
# Schedule it ~3 AM IST (see DEPLOY.md) when no one is logged into CRIS, since
# CRIS allows only one active session. Logs to cris-fetch.log. Safe to run by hand.

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
LOG="$PROJECT_DIR/cris-fetch.log"

# Read a KEY=value from .env (strips surrounding quotes).
read_env() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- | sed 's/^"//; s/"$//'
}

SECRET="$(read_env CRON_SECRET)"
DOMAIN="$(read_env DOMAIN)"
URL="${CRIS_CRON_URL:-https://${DOMAIN}/api/cris/cron-fetch}"

if [ -z "$SECRET" ]; then
  echo "[$(date -Is)] CRON_SECRET not set in $ENV_FILE — aborting" >> "$LOG"
  exit 1
fi

echo "[$(date -Is)] POST $URL" >> "$LOG"
curl -sS -X POST "$URL" \
  -H "Authorization: Bearer ${SECRET}" \
  -H "Content-Type: application/json" \
  --max-time 220 >> "$LOG" 2>&1
RC=$?
echo "" >> "$LOG"
echo "[$(date -Is)] done (curl exit $RC)" >> "$LOG"
