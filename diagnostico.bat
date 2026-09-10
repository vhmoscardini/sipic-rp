@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo SIPIC-RP - DIAGNOSTICO LOCAL
echo ================================================
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  pause
  exit /b 1
)
node --version

echo.
echo Iniciando servidor temporario na porta 8099...
set "PORT=8099"
start "SIPIC-RP Diagnostic Server" /min cmd /c "node server.mjs"
timeout /t 2 /nobreak >nul

echo.
echo Testando endpoints locais...
curl -s -o nul -w "Health:        HTTP %%{http_code}\n" http://127.0.0.1:8099/api/health
curl -s -o nul -w "Open-Meteo:    HTTP %%{http_code}\n" http://127.0.0.1:8099/api/weather
curl -s -o nul -w "Comparison:    HTTP %%{http_code}\n" http://127.0.0.1:8099/api/weather-comparison
curl -s -o nul -w "Diagnostics:   HTTP %%{http_code}\n" http://127.0.0.1:8099/api/diagnostics
curl -s -o nul -w "OW Network:    HTTP %%{http_code}\n" http://127.0.0.1:8099/api/diagnostics/openweather
curl -s -o nul -w "OpenWeather:   HTTP %%{http_code}\n" http://127.0.0.1:8099/api/settings/openweather

echo.
echo Abra no navegador: http://127.0.0.1:8099/api/diagnostics
echo Para o servidor temporario, feche a janela "SIPIC-RP Diagnostic Server".
echo.
pause
