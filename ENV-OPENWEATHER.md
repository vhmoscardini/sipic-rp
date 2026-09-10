# OpenWeather — configuração segura

A chave da OpenWeather **não é configurada pelo painel** e não é enviada pelo navegador.

## Local

Crie um arquivo `.env` na raiz do projeto (ao lado de `server.mjs`):

```env
OPENWEATHER_API_KEY=sua_chave
```

O `.env` está no `.gitignore` e não deve ser enviado ao GitHub.

## Vercel

No projeto da Vercel, abra **Settings → Environment Variables** e crie:

`OPENWEATHER_API_KEY`

com a sua chave. Depois faça um novo deploy.

O frontend nunca recebe a chave. O backend lê `process.env.OPENWEATHER_API_KEY` e faz a requisição diretamente à OpenWeather.
