#!/bin/sh
set -e

echo "🔄 Running database migrations..."
./node_modules/.bin/prisma db push --skip-generate

echo "🌱 Seeding database..."
node prisma/seed.js || true

echo "🚀 Starting Next.js..."
exec node server.js
