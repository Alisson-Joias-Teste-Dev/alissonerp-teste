#!/bin/bash
# Troca o ambiente para HOMOLOG (teste)
# Uso: bash scripts/switch-to-homolog.sh

cd "$(dirname "$0")/.."

if [ ! -f .env.homolog ]; then
  echo "❌ Template .env.homolog não encontrado"
  exit 1
fi

# Backup do .env.local atual
cp .env.local .env.local.bak 2>/dev/null

# Copia template de homolog
cp .env.homolog .env.local

echo "🟡 HOMOLOG — banco cloud.alisson.api.br:5435/postgres-homolog"
echo "✅ Ambiente de teste — seguro para testes."
echo "    Execute: rm -rf .next && npm run dev"
