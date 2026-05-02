#!/bin/bash
cd "$(dirname "$0")/.."
cp .env.local .env.local.bak 2>/dev/null
cp .env.homolog .env.local
echo "🟡 HOMOLOG — banco cloud.alisson.api.br:5435/postgres-homolog"
echo "   Execute: rm -rf .next && npm run dev"
