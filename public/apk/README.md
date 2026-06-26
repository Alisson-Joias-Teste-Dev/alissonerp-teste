# APK do App Alisson RFID

## Download
O APK esta disponivel na pagina de documentacao:
`https://erp.alisson.api.br/docs/inventario-rfid`

## Como gerar o APK

### Opcao 1: GitHub Actions (automatico)
1. Faca push das alteracoes no branch `main`
2. Acesse: GitHub > Actions > "Build APK"
3. Na execucao mais recente, baixe o artefato `alisson-rfid-apk`
4. Extraia o APK e copie para `public/apk/alisson-rfid.apk` no servidor

### Opcao 2: Android Studio (manual)
1. Abra `android-rfid-app/` no Android Studio
2. Build > Generate Signed Bundle/APK > APK
3. Preencha as informacoes da keystore (crie uma se nao tiver)
4. Selecione "release" como build variant
5. Apos o build, copie `app/build/outputs/apk/release/app-release.apk` para `public/apk/alisson-rfid.apk`

### Opcao 3: Script automatico (requer Java + Gradle)
```bash
bash scripts/build-apk.sh
```

---

**Versao atual do APK:** 1.0.0
**Ultima atualizacao:** 14/05/2026
