#!/usr/bin/env bash
# Aplica uma migration na PRODUCAO: assina + transacao unica (rollback se falhar).
# Token APROVO (3o argumento) evita disparo acidental.
# Uso: bash scripts/aplicar-migracao-prod.sh <arquivo.sql> "descricao clara" APROVO
set -euo pipefail
SQLFILE="${1:?passe o arquivo .sql}"; DESC="${2:?passe a descricao}"; OK="${3:-}"
[ "$OK" = "APROVO" ] || { echo "BLOQUEADO: passe o token APROVO como 3o argumento (aprovacao explicita)."; exit 1; }
cd "$(dirname "$0")/.."
[ -f "$SQLFILE" ] || { echo "arquivo nao encontrado: $SQLFILE"; exit 1; }
PROD="$(grep -m1 '^DATABASE_URL=' .env.production.local | cut -d= -f2-)"
[ -n "$PROD" ] || { echo "DATABASE_URL nao achado em .env.production.local"; exit 1; }
export PGAPPNAME='claude-code-jonathan'
echo ">>> PROD ALVO: $(echo "$PROD" | sed -E 's#:[^:@]+@#:****@#')"
echo ">>> Migration: $SQLFILE | Descricao: $DESC"
# 1) assinar (rastreia QUEM mexeu) — :'var' do psql cuida das aspas com seguranca
psql "$PROD" -v ON_ERROR_STOP=1 -v desc="$DESC" -v sqlf="$SQLFILE" -c \
  "SELECT alissonerp.assinar_mudanca_banco('jonathan','claude-code', :'desc', :'sqlf')"
# 2) aplicar em transacao unica (rollback automatico se falhar)
psql "$PROD" --single-transaction -v ON_ERROR_STOP=1 -f "$SQLFILE"
echo ">>> OK: migration aplicada na producao."
