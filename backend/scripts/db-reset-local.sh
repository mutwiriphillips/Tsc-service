#!/usr/bin/env bash
# Development/test only: drops the schema and applies every migration in order.
# In staging/production use `npx prisma migrate deploy` instead.
set -euo pipefail
URL="${1:-${DATABASE_URL:?DATABASE_URL not set}}"
URL="${URL%%\?*}"   # psql does not understand Prisma's ?schema= suffix
DIR="$(cd "$(dirname "$0")/../prisma/migrations" && pwd)"
PGOPTIONS="-c client_min_messages=warning" psql "$URL" -v ON_ERROR_STOP=1 -q -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
for f in $(ls -d "$DIR"/*/ | sort); do
  psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f/migration.sql"
  echo "applied $(basename "$f")"
done
