# SIPIC-RP — Deploy na Vercel

## Deploy

Importe o repositório Git na Vercel. O frontend é estático e as rotas `/api/*` usam funções Node.js em `api/`.

## OpenWeather

Para produção, configure `OPENWEATHER_API_KEY` em **Vercel → Settings → Environment Variables** e faça um novo deploy. A chave não deve ser colocada em `config.js`, `app.js`, `index.html` ou commitada no Git.

Localmente, use um `.env` na raiz:

```env
OPENWEATHER_API_KEY=sua_chave
```

O `.env` é ignorado pelo Git.

## Variáveis opcionais

- `SIPIC_API_BASE_URL`
- `OPENWEATHER_API_KEY`
- `METEOMATICS_USERNAME`
- `METEOMATICS_PASSWORD`
- `CAMS_API_KEY`
- `REQUEST_TIMEOUT_MS`

## Rotas principais

- `/api/health`
- `/api/dashboard`
- `/api/weather`
- `/api/air-quality`
- `/api/solar`
- `/api/weather-comparison`
- `/api/diagnostics`
- `/api/diagnostics/openweather`
- `/api/logs`
- `/api/settings/openweather`
- `/api/openapi`

## Runtime

Esta versão não declara `runtime` dentro de `vercel.json`. A Vercel detecta automaticamente as funções Node.js pelos arquivos `.mjs`, evitando configurações de runtime incompatíveis com o CLI.
