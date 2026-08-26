@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js 20 ou superior nao foi encontrado.
  echo Instale o Node.js e execute este arquivo novamente.
  echo.
  pause
  exit /b 1
)

start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:8080"
echo Iniciando o SIPIC-RP em http://127.0.0.1:8080
node server.mjs

if errorlevel 1 (
  echo.
  echo O servidor terminou com erro.
  pause
)
