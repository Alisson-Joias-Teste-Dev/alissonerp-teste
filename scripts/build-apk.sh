#!/bin/bash
# Build APK do App Alisson RFID e copia para public/apk/
# Uso: bash scripts/build-apk.sh
#
# Pre-requisitos:
#   - Android SDK instalado e configurado (ANDROID_HOME)
#   - JDK 17+
#   - Gradle wrapper no projeto android-rfid-app/

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ANDROID_DIR="$PROJECT_DIR/android-rfid-app"
APK_OUTPUT="$ANDROID_DIR/app/build/outputs/apk/release"
PUBLIC_APK="$PROJECT_DIR/public/apk"

echo "=== Build APK Alisson RFID ==="
echo "Projeto Android: $ANDROID_DIR"
echo ""

# Verificar se o diretorio existe
if [ ! -d "$ANDROID_DIR" ]; then
  echo "ERRO: Diretorio android-rfid-app nao encontrado!"
  exit 1
fi

# Build
cd "$ANDROID_DIR"
echo "[1/3] Compilando APK release..."
./gradlew assembleRelease
echo "OK"

# Verificar se foi gerado
APK_FILE=$(ls -t "$APK_OUTPUT"/app-release.apk 2>/dev/null | head -1)
if [ -z "$APK_FILE" ]; then
  echo "ERRO: APK nao foi gerado!"
  exit 1
fi

# Copiar para public/apk/
echo "[2/3] Copiando para $PUBLIC_APK..."
mkdir -p "$PUBLIC_APK"
cp "$APK_FILE" "$PUBLIC_APK/alisson-rfid.apk"
echo "OK"

# Mostrar resultado
echo "[3/3] APK pronto!"
echo ""
echo "Arquivo: $PUBLIC_APK/alisson-rfid.apk"
echo "Tamanho: $(du -h "$PUBLIC_APK/alisson-rfid.apk" | cut -f1)"
echo "URL: https://erp.alisson.api.br/apk/alisson-rfid.apk"
echo ""
echo "Instrucoes:"
echo "1. Abra android-rfid-app/ no Android Studio"
echo "2. Build -> Generate Signed Bundle/APK -> APK"
echo "3. OU execute este script"
