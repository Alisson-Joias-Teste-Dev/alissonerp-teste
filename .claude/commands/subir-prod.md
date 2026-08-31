# /subir-prod — Subir uma mudança para PRODUÇÃO (AlissonERP)

Use esta skill ao **finalizar uma task** e querer levá-la com segurança pra produção.
São **2 trilhos** independentes: **código** (o app) e **banco** (schema/dados). Faça os que a task exigir.

> Fonte de verdade: `CLAUDE.md` (§0 fluxo, §Git, §Database Safety, §Assinatura). Esta skill operacionaliza essas regras.

---

## ⛔ Regra de ferro (banco de produção)
**Antes de QUALQUER comando que toque a PROD** (`72.60.55.140:5543`): **PARAR e pedir o "ok" explícito do Jonathan.**
"funcionou/testei/ok pra homolog" **não** é autorização pra prod. Sem "ok" claro, não roda.

---

## Trilho 1 — Código (front/back)
1. Trabalhar numa **branch da feature** (nome = a feature). **NUNCA** commitar direto em `main`/`homolog`.
2. `npx tsc --noEmit` passar.
3. `git commit` → `git push` na branch.
4. Tipo de mudança:
   - **Fix pequeno** (bug, UI, texto): pode mergear na `main`.
   - **Feature / migration / estrutural:** **PARAR.** Jonathan testa → **"ok" separado** pra `main`.
5. **Deploy:** Easypanel → **"Implantar"** (merge na main com `-m "vX.Y.Z: descrição"`).

## Trilho 2 — Banco (só se a task criou/alterou tabela, view, função, trigger, ou dados)

### a) Escrever a migration
- Arquivo novo em `supabase/migrations/NNN_descricao.sql` (NNN = próximo número).
- **SQL defensivo** (roda igual em qualquer estado do banco):
  `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`. **Nunca** `DROP`/remover coluna.
- Mapear impactos (views, triggers, componentes) ANTES — se mexe em 3 lugares, arruma os 3.

### b) Ensaiar (NUNCA estrear na prod)
- Rodar no **LOCAL** (clone fresco da prod): porta 54322.
  ```bash
  PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres \
    psql -d postgres --single-transaction -v ON_ERROR_STOP=1 -f supabase/migrations/NNN_descricao.sql
  ```
- (Opcional, ensaio mais fiel) banco **homolog**: `cloud.alisson.api.br:5435/postgres-homolog`.

### c) Commitar a migration (compartilha; NÃO toca a prod)
`git add supabase/migrations/NNN_*.sql` → commit na branch → push. (Migration **criada** ≠ **executada**.)

### d) Aplicar na PROD — com aprovação, assinatura e transação
**Pré:** ter o "ok" do Jonathan (regra de ferro). Backup antes se houver `ALTER/DELETE/TRUNCATE`.
Use o helper (token `APROVO` evita disparo acidental):
```bash
bash ~/projetos/alissonerp/scripts/aplicar-migracao-prod.sh supabase/migrations/NNN_descricao.sql "descrição clara" APROVO
```
O helper faz, numa tacada: **assina** (`assinar_mudanca_banco`) + seta `PGAPPNAME` + aplica em **transação única** (`--single-transaction -v ON_ERROR_STOP=1`; se der erro, **desfaz tudo**). Conexão lida de `.env.production.local`.

> Se o helper não existir, crie-o com o conteúdo do Apêndice.

### e) Conferir e fechar
- Conferir que aplicou (contagem/estrutura no banco de prod).
- **Deploy do código** (Trilho 1) pro app usar a estrutura nova.

### Ordem
**Banco primeiro, código depois** — a prod já tem a coluna/tabela quando o app novo subir (senão o app quebra procurando o que não existe).

---

## Pitfalls
- **Commit não aplica na prod** — o deploy do Easypanel sobe só o código; migration é aplicada à parte (passo d).
- **Não suba dados de teste do local** — só a migration (estrutura). Os registros que você criou testando ficam no local.
- **O local "envelhece"** conforme a prod muda — re-semeie de tempos em tempos (ver `/supabase-local`) pra o ensaio continuar fiel.
- **Em homolog não existe** a função de assinatura (`assinar_mudanca_banco`) — ela é só na prod.

---

## Apêndice — `scripts/aplicar-migracao-prod.sh`
```bash
#!/usr/bin/env bash
# Aplica uma migration na PRODUCAO: assina + transacao unica. Token APROVO evita disparo acidental.
# Uso: bash scripts/aplicar-migracao-prod.sh <arquivo.sql> "descricao" APROVO
set -euo pipefail
SQLFILE="${1:?passe o arquivo .sql}"; DESC="${2:?passe a descricao}"; OK="${3:-}"
[ "$OK" = "APROVO" ] || { echo "BLOQUEADO: passe o token APROVO como 3o argumento (aprovacao explicita)."; exit 1; }
cd "$(dirname "$0")/.."
[ -f "$SQLFILE" ] || { echo "arquivo nao encontrado: $SQLFILE"; exit 1; }
PROD="$(grep -m1 '^DATABASE_URL=' .env.production.local | cut -d= -f2-)"
[ -n "$PROD" ] || { echo "DATABASE_URL nao achado em .env.production.local"; exit 1; }
export PGAPPNAME='claude-code-jonathan'
echo ">>> PROD ALVO: $(echo "$PROD" | sed -E 's#:[^:@]+@#:****@#')"
echo ">>> Migration: $SQLFILE  | Descricao: $DESC"
# 1) assinar (rastreia QUEM mexeu) — :'var' do psql cuida das aspas com seguranca
psql "$PROD" -v ON_ERROR_STOP=1 -v desc="$DESC" -v sqlf="$SQLFILE" -c \
  "SELECT alissonerp.assinar_mudanca_banco('jonathan','claude-code', :'desc', :'sqlf')"
# 2) aplicar em transacao unica (rollback automatico se falhar)
psql "$PROD" --single-transaction -v ON_ERROR_STOP=1 -f "$SQLFILE"
echo ">>> OK: migration aplicada na producao."
```
