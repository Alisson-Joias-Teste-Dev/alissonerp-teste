#!/usr/bin/env bash
#
# Protocolo de Pré-Flight Obrigatório — dba-alisson
# Executar ANTES de qualquer SQL, SEMPRE, sem exceção.
# 
# Regras:
#   1. Nunca executar SQL sem este script passar.
#   2. Nunca assumir que DATABASE_URL está herdado do ambiente.
#   3. Sempre validar env → carregar fallback → testar conexão real.
#   4. Se falhar: abortar e retornar erro padronizado (código + ação).
#
# Uso:
#   source check_db.sh   → carrega DATABASE_URL no ambiente da sessão atual
#   bash check_db.sh     → apenas testa (não exporta para a sessão chamadora)
#
# Após source + sucesso, usar:
#   psql "$DATABASE_URL" -c "..."

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ENV_FILE="${SCRIPT_DIR}/.env"
CONNECT_TIMEOUT=5

# ─── Códigos de erro padronizados ──────────────────────────────────────
ERR_ENV_MISSING=1
ERR_AUTH_FAILED=2
ERR_NETWORK_TIMEOUT=3
ERR_DNS_UNREACHABLE=4
ERR_DB_UNAVAILABLE=5
ERR_INVALID_URL=6

# ─── Passo 1: Resolver DATABASE_URL ────────────────────────────────────
resolve_database_url() {
  # Prioridade 1: variável de ambiente já exportada na sessão
  if [[ -n "${DATABASE_URL:-}" ]]; then
    echo "[check_db] ✅ DATABASE_URL encontrado no ambiente da sessão"
    return 0
  fi

  # Prioridade 2: fallback para o .env da skill (nunca falha se o arquivo existir)
  if [[ -f "$SKILL_ENV_FILE" ]]; then
    echo "[check_db] 🔄 DATABASE_URL não está no ambiente — carregando fallback do .env da skill"
    set -a
    # shellcheck source=/dev/null
    source "$SKILL_ENV_FILE"
    set +a
    if [[ -n "${DATABASE_URL:-}" ]]; then
      echo "[check_db] ✅ DATABASE_URL carregado do .env da skill"
      return 0
    fi
  fi

  echo "[check_db] ❌ ENV_MISSING: DATABASE_URL não encontrado no ambiente nem no .env da skill"
  echo "[check_db] Ação: verifique se .opencode/skills/dba-alisson/.env existe e contém DATABASE_URL"
  return $ERR_ENV_MISSING
}

# ─── Passo 2: Validar formato da URL ───────────────────────────────────
validate_url_format() {
  local url="${DATABASE_URL:-}"

  if [[ -z "$url" ]]; then
    echo "[check_db] ❌ INVALID_URL: DATABASE_URL está vazia"
    return $ERR_INVALID_URL
  fi

  # Formato esperado: postgres://user:pass@host:port/dbname
  if [[ ! "$url" =~ ^postgres(ql)?://[^@]+@[^:/]+(:[0-9]+)?/[^/]+$ ]]; then
    echo "[check_db] ❌ INVALID_URL: formato da DATABASE_URL é inválido"
    echo "[check_db]    esperado: postgres://user:senha@host:porta/database"
    echo "[check_db]    recebido: ${url}"
    return $ERR_INVALID_URL
  fi

  echo "[check_db] ✅ Formato da URL validado"
  return 0
}

# ─── Passo 3: Testar conectividade de rede (TCP) ───────────────────────
test_network_reachability() {
  local url="${DATABASE_URL}"
  # Extrai host e porta da URL
  local host port
  host=$(echo "$url" | sed -n 's|.*@\([^:/]*\).*|\1|p')
  port=$(echo "$url" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
  port="${port:-5432}"

  echo "[check_db] 🔍 Testando conectividade TCP para ${host}:${port}..."

  if command -v nc &>/dev/null; then
    if nc -z -w "$CONNECT_TIMEOUT" "$host" "$port" 2>/dev/null; then
      echo "[check_db] ✅ TCP ${host}:${port} — alcançável"
      return 0
    else
      echo "[check_db] ❌ NETWORK_TIMEOUT: sem resposta TCP de ${host}:${port} em ${CONNECT_TIMEOUT}s"
      echo "[check_db] Ação: verifique VPN, firewall, ou se o host/porta estão corretos"
      return $ERR_NETWORK_TIMEOUT
    fi
  elif command -v timeout &>/dev/null; then
    if timeout "$CONNECT_TIMEOUT" bash -c "echo >/dev/tcp/${host}/${port}" 2>/dev/null; then
      echo "[check_db] ✅ TCP ${host}:${port} — alcançável (bash built-in)"
      return 0
    else
      echo "[check_db] ❌ NETWORK_TIMEOUT: sem resposta TCP de ${host}:${port} em ${CONNECT_TIMEOUT}s"
      echo "[check_db] Ação: verifique VPN, firewall, ou se o host/porta estão corretos"
      return $ERR_NETWORK_TIMEOUT
    fi
  else
    echo "[check_db] ⚠️  nc e /dev/tcp indisponíveis — pulando teste de rede (confiando no psql)"
    return 0
  fi
}

# ─── Passo 4: Handshake PostgreSQL (conexão real + contexto) ────────────
test_db_handshake() {
  local url="${DATABASE_URL}"

  echo "[check_db] 🔍 Executando handshake PostgreSQL..."

  local result
  result=$(psql "$url" \
    -c "SELECT current_database() AS db, current_user AS usuario, now() AS data_hora;" \
    -t --no-align --field-separator=' | ' \
    -v ON_ERROR_STOP=1 \
    2>&1) || true

  local exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    # Classifica o erro
    if echo "$result" | grep -qi "password authentication failed"; then
      echo "[check_db] ❌ AUTH_FAILED: falha de autenticação — usuário ou senha incorretos"
      echo "[check_db] Ação: verifique as credenciais em .opencode/skills/dba-alisson/.env"
      return $ERR_AUTH_FAILED
    elif echo "$result" | grep -qi "could not translate host name"; then
      echo "[check_db] ❌ DNS_UNREACHABLE: nome do host não pôde ser resolvido"
      echo "[check_db] Ação: verifique DNS, VPN, ou se o IP 72.60.55.140 está correto"
      return $ERR_DNS_UNREACHABLE
    elif echo "$result" | grep -qi "Connection refused\|could not connect"; then
      echo "[check_db] ❌ DB_UNAVAILABLE: PostgreSQL não está aceitando conexões na porta especificada"
      echo "[check_db] Ação: verifique se o PostgreSQL está rodando e a porta 5543 está liberada"
      return $ERR_DB_UNAVAILABLE
    elif echo "$result" | grep -qi "timeout\|timed out"; then
      echo "[check_db] ❌ NETWORK_TIMEOUT: timeout ao conectar"
      echo "[check_db] Ação: verifique latência de rede, VPN, ou aumente CONNECT_TIMEOUT"
      return $ERR_NETWORK_TIMEOUT
    else
      echo "[check_db] ❌ DB_UNAVAILABLE: falha ao conectar — motivo desconhecido"
      echo "[check_db]    ${result}"
      return $ERR_DB_UNAVAILABLE
    fi
  fi

  echo "[check_db] ✅ Handshake bem-sucedido: ${result}"
  return 0
}

# ─── Execução principal ─────────────────────────────────────────────────
main() {
  echo "──────────────────────────────────────────"
  echo "🔧 dba-alisson — Pré-Flight de Conexão"
  echo "──────────────────────────────────────────"

  resolve_database_url || return $?
  validate_url_format || return $?
  test_network_reachability || return $?
  test_db_handshake || return $?

  echo "──────────────────────────────────────────"
  echo "✅ TUDO OK — Conexão pronta para uso"
  echo "   Database: postgres | Usuário: postgres"
  echo "   Schema: alissonerp"
  echo "   Para usar: psql \"\$DATABASE_URL\" -c \"SELECT ...\""
  echo "──────────────────────────────────────────"
  return 0
}

# Se executado diretamente (não como source), roda o main
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main
fi
