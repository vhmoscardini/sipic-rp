@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo SIPIC-RP - DIAGNOSTICO DE REDE OPENWEATHER
echo ============================================================
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  pause
  exit /b 1
)
node --version

echo.
echo [1/4] DNS:
powershell -NoProfile -Command "Resolve-DnsName api.openweathermap.org -Type A | Format-Table Name,IPAddress -AutoSize"

echo.
echo [2/4] Teste TCP 443:
powershell -NoProfile -Command "Test-NetConnection api.openweathermap.org -Port 443 | Select-Object ComputerName,RemoteAddress,RemotePort,TcpTestSucceeded | Format-List"

echo.
echo [3/4] Teste HTTPS sem chave (deve retornar HTTP 401 se a rede estiver funcionando):
curl -4 -sS -o nul -w "HTTP=%%{http_code} | IP=%%{remote_ip} | tempo=%%{time_total}s\n" --connect-timeout 10 --max-time 20 "https://api.openweathermap.org/data/2.5/weather?lat=-21.1775&lon=-47.8103&appid=TESTE_INVALIDA&units=metric"

echo.
echo [4/4] Diagnostico do gateway local:
curl -s http://127.0.0.1:8099/api/diagnostics/openweather

echo.
echo Se houver timeout/erro de DNS, investigue rede, proxy, firewall, antivirus ou DNS.
echo ============================================================
pause
