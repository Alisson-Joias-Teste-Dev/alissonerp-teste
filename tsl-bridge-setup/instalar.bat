@echo off
title Instalador - Ponte TSL 1128
cd /d "%~dp0"
echo ========================================
echo   Instalador - Ponte TSL 1128
echo ========================================
echo.

:: Verificar Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado!
    echo.
    echo Instale o Node.js LTS em: https://nodejs.org
    echo Apos instalar, execute este arquivo novamente.
    echo.
    pause & exit /b 1
)
for /f %%v in ('node --version') do echo [OK] Node.js %%v encontrado

:: Instalar dependencias
echo.
echo Instalando dependencias (pode demorar alguns minutos)...
cd tsl-bridge
call npm install
if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao instalar dependencias!
    echo Tente executar como Administrador (botao direito - Executar como administrador).
    echo.
    pause & exit /b 1
)
cd ..
echo [OK] Dependencias instaladas

:: Criar atalho na area de trabalho
echo.
echo Criando atalho na area de trabalho...
set "VBSPATH=%~dp0iniciar.vbs"
set "SHORTCUT=%USERPROFILE%\Desktop\Ponte TSL 1128.lnk"
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath='%VBSPATH%'; $s.WorkingDirectory='%~dp0'; $s.Description='Ponte TSL 1128 - Contagem RFID'; $s.Save()"
echo [OK] Atalho criado na area de trabalho

echo.
echo ========================================
echo   Instalacao concluida com sucesso!
echo ========================================
echo.
echo Use o atalho "Ponte TSL 1128" na area de trabalho para iniciar.
echo.
pause
