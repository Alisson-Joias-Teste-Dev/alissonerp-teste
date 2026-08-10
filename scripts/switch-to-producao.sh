#!/bin/bash
# Troca o ambiente para PRODUÇÃO
# Uso: bash scripts/switch-to-producao.sh
#
# REGRA DE SEGURANÇA (corrige o ALERTA-credenciais-expostas-2026-08-07):
#   - Este script NÃO contém senhas. Os segredos de produção vivem SÓ em
#     .env.production.local (fora do controle de versão, ver .gitignore),
#     exatamente como o switch-to-homolog.sh faz com .env.homolog.
#   - Se .env.production.local não existir, peça ao dono — NUNCA recrie
#     este arquivo com segredos dentro do repositório.

cd "$(dirname "$0")/.."

if [ ! -f .env.production.local ]; then
  echo "❌ Arquivo .env.production.local não encontrado."
  echo ""
  echo "   Os segredos de produção ficam nesse arquivo local (nunca no git)."
  echo "   Peça ao dono para recriá-lo a partir do gerenciador de senhas."
  exit 1
fi

# Backup do .env.local atual
cp .env.local .env.local.bak 2>/dev/null

# Copia a configuração de produção
cp .env.production.local .env.local

echo "🔴 PRODUÇÃO — banco 72.60.55.140:5543/postgres"
echo "⚠️  CUIDADO: todas as operações vão para o banco real."
echo "    Execute: rm -rf .next && npm run dev"
