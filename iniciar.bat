@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERRO] Node.js 20 ou superior nao foi encontrado.
  echo Instale o Node.js e execute este arquivo novamente.
  echo.
  pause
  exit /b 1
)

node --check server.mjs >nul 2>&1
if errorlevel 1 (
  echo [ERRO] server.mjs possui erro de sintaxe.
  node --check server.mjs
  pause
  exit /b 1
)

set "SIPIC_PORT=8080"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":8080 .*LISTENING"') do set "SIPIC_PID=%%P"
if defined SIPIC_PID (
  echo.
  echo [AVISO] A porta 8080 ja esta em uso pelo processo !SIPIC_PID!.
  echo Isso pode significar que outra versao do SIPIC-RP ja esta aberta.
  echo.
  choice /C SN /N /M "Encerrar esse processo e iniciar esta versao? [S/N]: "
  if errorlevel 2 (
    set "SIPIC_PORT=8081"
    echo Usando a porta 8081 para evitar conflito.
  ) else (
    taskkill /PID !SIPIC_PID! /F >nul 2>&1
    timeout /t 1 /nobreak >nul
  )
)

set "PORT=%SIPIC_PORT%"
set "SIPIC_PORT=%SIPIC_PORT%"
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:%SIPIC_PORT%"
echo.
echo ================================================================
echo SIPIC-RP iniciado em http://127.0.0.1:%SIPIC_PORT%
echo ================================================================
echo.
node server.mjs

if errorlevel 1 (
  echo.
  echo [ERRO] O servidor terminou com erro.
  echo Execute diagnostico.bat para identificar o problema.
  echo.
  pause
)
