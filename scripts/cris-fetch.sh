#!/bin/sh
# Hourly CRIS auto-fetch. Calls the in-app cron endpoint, which logs into CRIS
# (via the pre-authenticated dealer link, or stored credentials), downloads the
# Daily Sales Report, and caches it. The `cron` service in docker-compose.prod.yml
# runs this at the top of every hour; it's also safe to run by hand. CRIS allows
# only one active session, so a run that overlaps your own CRIS login may fail
# that hour (it logs out cleanly and the next hour retries). Settings come from
# the environment first, falling back to .env:
#   CRON_SECRET    bearer token the endpoint requires
#   CRIS_CRON_URL  full endpoint URL (defaults to https://$DOMAIN/api/cris/cron-fetch)
#   CRIS_LOG       log destination (defaults to <project>/cris-fetch.log)

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"

# Read a KEY=value from .env (strips surrounding quotes).
read_env() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- | sed 's/^"//; s/"$//'
}

LOG="${CRIS_LOG:-$PROJECT_DIR/cris-fetch.log}"
SECRET="${CRON_SECRET:-$(read_env CRON_SECRET)}"
DOMAIN="${DOMAIN:-$(read_env DOMAIN)}"
URL="${CRIS_CRON_URL:-https://${DOMAIN}/api/cris/cron-fetch}"

if [ -z "$SECRET" ]; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] CRON_SECRET not set in $ENV_FILE — aborting" >> "$LOG"
  exit 1
fi

echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] POST $URL" >> "$LOG"
curl -sS -X POST "$URL" \
  -H "Authorization: Bearer ${SECRET}" \
  -H "Content-Type: application/json" \
  --max-time 220 >> "$LOG" 2>&1
RC=$?
echo "" >> "$LOG"
echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] done (curl exit $RC)" >> "$LOG"
