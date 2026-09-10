@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

echo ============================================================
echo SIPIC-RP - DIAGNOSTICO COMPLETO DA OPENWEATHER
echo ============================================================
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  pause
  exit /b 1
)
node --version

echo.
echo [1/4] Resolvendo DNS e testando TCP/TLS/HTTP pelo SIPIC-RP...
set "PORT=8099"
start "SIPIC-RP Diagnostic Server" /min cmd /c "node server.mjs"
timeout /t 3 /nobreak >nul

curl -s --max-time 45 http://127.0.0.1:8099/api/diagnostics/openweather

echo.
echo.
echo [2/4] Teste DNS do Windows:
powershell -NoProfile -Command "Resolve-DnsName api.openweathermap.org -Type A | Format-Table Name,IPAddress -AutoSize"

echo.
echo [3/4] Teste TCP 443:
powershell -NoProfile -Command "Test-NetConnection api.openweathermap.org -Port 443 | Select-Object ComputerName,RemoteAddress,RemotePort,TcpTestSucceeded | Format-List"

echo.
echo [4/4] Teste HTTPS sem chave (deve retornar HTTP 401 se a rede estiver funcionando):
curl -4 -sS -o nul -w "HTTP=%%{http_code} | IP=%%{remote_ip} | tempo=%%{time_total}s\n" --connect-timeout 10 --max-time 20 "https://api.openweathermap.org/data/2.5/weather?lat=-21.1775&lon=-47.8103&appid=TESTE_INVALIDA&units=metric"

echo.
echo Se o ultimo teste retornar HTTP 401, a conexao com a OpenWeather esta funcionando e a chave deve ser verificada.
echo Se der timeout/erro de DNS, o problema esta na rede, proxy, firewall, antivirus ou DNS do computador.
echo.
echo Feche a janela "SIPIC-RP Diagnostic Server" para encerrar o servidor temporario.
echo ============================================================
pause
