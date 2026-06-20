#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is required"
  exit 1
fi

if [ "$SKIP_DB_PUSH" != "true" ]; then
  echo "Applying Prisma schema..."
  attempts=0
  until ./node_modules/.bin/prisma db push --skip-generate; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge "${DB_PUSH_MAX_ATTEMPTS:-30}" ]; then
      echo "Prisma db push failed after $attempts attempts"
      exit 1
    fi
    echo "Database not ready yet, retrying in ${DB_PUSH_RETRY_SECONDS:-2}s..."
    sleep "${DB_PUSH_RETRY_SECONDS:-2}"
  done
fi

if [ "$RUN_SEED" = "true" ]; then
  echo "Seeding database..."
  node prisma/seed.js
fi

echo "Starting Next.js..."
exec node server.js
