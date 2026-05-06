@echo off
title Ponte TSL 1128
cd /d "C:\Users\Jonathan Araújo\OneDrive\fabricaAJ"

:: Verifica se ja esta rodando
tasklist /fi "windowtitle eq Ponte TSL 1128*" 2>nul | find /i "node.exe" >nul
if not errorlevel 1 (
  echo Ponte ja esta rodando.
  timeout /t 3 >nul
  exit /b
)

echo ========================================
echo   Ponte TSL 1128 - Contagem RFID
echo ========================================
echo.
echo Deixe esta janela aberta enquanto usar
echo o leitor. Feche-a quando terminar.
echo.
call npm run tsl-bridge
pause
