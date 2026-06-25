#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations..."
npx prisma migrate deploy

echo "[entrypoint] Seeding admin account (idempotent)..."
npx prisma db seed || echo "[entrypoint] seed skipped (continuing)"

echo "[entrypoint] Starting app..."
exec "$@"
