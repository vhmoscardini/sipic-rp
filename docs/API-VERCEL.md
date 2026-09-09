# Gateway API da Vercel

O deploy Vercel expõe `/api/*` e encaminha as principais consultas para a Edge Function do Supabase.

## Endpoints

- `GET /api/health` — saúde do gateway e do upstream.
- `GET /api/dashboard` — payload integrado.
- `GET /api/weather` — meteorologia.
- `GET /api/weather-comparison` — comparação Open-Meteo × OpenWeather.
- `GET /api/air-quality` — qualidade do ar.
- `GET /api/solar` — dados solares.
- `GET /api/cams-radiation` — CAMS ou contingência Open-Meteo Solar.
- `GET /api/diagnostics` — diagnóstico operacional.
- `GET /api/diagnostics/openweather` — DNS, TCP, TLS e HTTP da OpenWeather.
- `GET /api/settings/openweather` — somente status da variável de ambiente.
- `GET /api/logs` — logs recentes do gateway.

## Segurança

`OPENWEATHER_API_KEY` é exclusivamente server-side. Não versione `.env`, `.openweather-key` ou chaves reais.
