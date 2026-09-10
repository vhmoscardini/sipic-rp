# Correção do 404 no painel OpenWeather

A configuração da OpenWeather passou a ser exclusivamente server-side. A rota `GET /api/settings/openweather` expõe somente o status e uma chave mascarada; não existe persistência da chave no navegador.

O `vercel.json` não usa runtime manual nem rewrite para `/api`. O roteamento é feito pelas funções nativas em `api/`, incluindo `api/[...path].mjs` e `api/health.mjs`.

Para produção, configure `OPENWEATHER_API_KEY` em **Vercel → Settings → Environment Variables** e faça um novo deploy.
