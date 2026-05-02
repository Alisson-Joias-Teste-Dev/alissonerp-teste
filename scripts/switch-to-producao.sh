#!/bin/bash
cd "$(dirname "$0")/.."
cp .env.local .env.local.bak 2>/dev/null
cat > .env.local << 'ENVEOF'
NEXT_PUBLIC_SUPABASE_URL=https://api.alisson.api.br
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InNlbGYtaG9zdCIsImlhdCI6MTc1NzMwMzUzNiwiZXhwIjoyMDcyNjYzNTM2fQ.6aDnTwDlKSnfMP4M1lt59KVZ1Np3yf0t70tiTYSy_fI
DATABASE_URL=postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres
NEXT_PUBLIC_AMBIENTE=producao
NEXT_PUBLIC_SITE_URL=https://erp.alisson.api.br
ENVEOF
echo "🔴 PRODUÇÃO — banco 72.60.55.140:5543/postgres"
echo "   Execute: rm -rf .next && npm run dev"
