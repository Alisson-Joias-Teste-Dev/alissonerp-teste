@echo off
title Ponte TSL 1128
cd /d "%~dp0"

:: Mata processos antigos na porta 9101
for /f "tokens=5" %%a in ('netstat -ano ^| find ":9101" ^| find "LISTENING"') do (
  taskkill /f /pid %%a >nul 2>&1
)

echo ========================================
echo   Ponte TSL 1128 - Contagem RFID
echo ========================================
echo.
call npm run tsl-bridge
pause
