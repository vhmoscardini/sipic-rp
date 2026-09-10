# Correção do 404 no painel OpenWeather

A rota `POST /api/settings/openweather` agora é uma função Vercel explícita em `api/settings/openweather.mjs`.
O `vercel.json` não usa mais rewrite para `/api`, evitando auto-rewrite/loop e deixando o roteamento nativo da Vercel.
A chave pode vir de `OPENWEATHER_API_KEY` ou ser enviada pelo painel. Em Vercel, a configuração enviada pelo painel fica em memória da instância; para produção persistente, use Environment Variables.
