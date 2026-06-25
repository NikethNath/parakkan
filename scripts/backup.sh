#!/bin/sh
# Hourly PostgreSQL backup. Dumps the DB, gzips it, keeps the last 14 days.
# Run from cron (see DEPLOY.md). Safe to run by hand too.
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$PROJECT_DIR/backups"
mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d-%H%M)
OUT="$BACKUP_DIR/hpcl-$TS.sql.gz"

docker compose -f "$PROJECT_DIR/docker-compose.prod.yml" exec -T db \
  pg_dump -U hpcl hpcl | gzip > "$OUT"

# prune backups older than 14 days
find "$BACKUP_DIR" -name 'hpcl-*.sql.gz' -mtime +14 -delete

echo "$(date '+%Y-%m-%d %H:%M:%S')  backed up -> $OUT ($(du -h "$OUT" | cut -f1))"
