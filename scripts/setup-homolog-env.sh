#!/bin/bash
# Configura o ambiente de homologação pela primeira vez
# Uso: bash scripts/setup-homolog-env.sh
#
# REGRA DE SEGURANÇA:
#   - Este script NÃO contém senhas.
#   - Ele cria .env.homolog a partir do template exemplo.
#   - Você precisa editar .env.homolog manualmente para colocar a senha real.
#   - NUNCA commite .env.homolog com senha.

cd "$(dirname "$0")/.."

TEMPLATE="env/.env.homolog.example"
TARGET=".env.homolog"

if [ ! -f "$TEMPLATE" ]; then
  echo "❌ Template $TEMPLATE não encontrado."
  echo "   Certifique-se de que o arquivo env/.env.homolog.example existe no repositório."
  exit 1
fi

if [ -f "$TARGET" ]; then
  echo "⚠️  $TARGET já existe."
  echo "   Para recriar, remova primeiro: rm $TARGET"
  echo "   Ou edite diretamente: nano $TARGET"
  exit 0
fi

cp "$TEMPLATE" "$TARGET"

echo "✅ Arquivo $TARGET criado a partir do template."
echo ""
echo "🔐 AGORA EDITE O ARQUIVO para colocar a senha real:"
echo ""
echo "   nano $TARGET"
echo ""
echo "   Substitua <SENHA_HOMOLOG> pela senha real do banco de homologação."
echo ""
echo "📋 Depois de configurado, use:"
echo ""
echo "   npm run db:homolog    # alterna para banco de teste"
echo "   npm run db:producao   # volta para banco de produção"
echo ""
echo "🟡 O badge 'HOMOLOG - BANCO DE TESTE' aparecerá no topo da tela."
