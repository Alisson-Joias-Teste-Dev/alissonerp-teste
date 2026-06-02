#!/bin/bash
# Troca o ambiente para PRODUÇÃO
# Uso: bash scripts/switch-to-producao.sh

cd "$(dirname "$0")/.."

if [ ! -f .env.homolog ]; then
  echo "❌ Template .env.homolog não encontrado"
  exit 1
fi

# Backup do .env.local atual
cp .env.local .env.local.bak 2>/dev/null

# Gera .env.local com dados de produção
cat > .env.local << 'ENVEOF'
# ── Supabase ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://api.alisson.api.br
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InNlbGYtaG9zdCIsImlhdCI6MTc1NzMwMzUzNiwiZXhwIjoyMDcyNjYzNTM2fQ.6aDnTwDlKSnfMP4M1lt59KVZ1Np3yf0t70tiTYSy_fI

# ── Banco de Dados ────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres

# ── Ambiente ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_AMBIENTE=producao

# ── Supabase Server ───────────────────────────────────────────────────────────
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzZWxmLWhvc3Qtc3VwYWJhc2UiLCJpYXQiOjE3NTczMDM1MzYsImV4cCI6MjA3MjY2MzUzNiwicm9sZSI6InNlcnZpY2Vfcm9sZSJ9.aSNZgcB4V0Lp6VqMjVlzmkW1Fp0bI3ORH9dTjrD4w24

# ── Tiny ERP ──────────────────────────────────────────────────────────────────
TINY_CLIENT_ID=47e9b1c7-db7f-4470-8e3e-5b4f5a0f3c1b
TINY_CLIENT_SECRET=8a6c3e5d-f1b9-4a0d-8c6e-7d2f3b5a0e9c
TINY_REDIRECT_URI=https://erp.alisson.api.br/api/integracoes/tiny/callback

# ── Mercado Pago ──────────────────────────────────────────────────────────────
MERCADOPAGO_ACCESS_TOKEN=APP_USR-1090135778493250-032717-44cd6ba7128f0c5aee2e978e92446fca-176456412
NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY=APP_USR-d1f3c6e8-99a4-4e8b-8090-f2b56d4e73a3

# ── App ───────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SITE_URL=https://erp.alisson.api.br
ENVEOF

echo "🔴 PRODUÇÃO — banco 72.60.55.140:5543/postgres"
echo "⚠️  CUIDADO: todas as operações vão para o banco real."
echo "    Execute: rm -rf .next && npm run dev"
