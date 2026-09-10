# Correções de APIs — SIPIC-RP / Vercel

Esta revisão corrige o diagnóstico falso-negativo exibido no painel e torna o gateway da Vercel funcional com o Supabase real.

## Corrigido

- O diagnóstico do Supabase agora faz `GET /health` na Edge Function real em vez de apenas verificar se uma variável de ambiente existe.
- `SIPIC_API_BASE_URL` continua opcional: se não existir na Vercel, o gateway usa a Edge Function SIPIC-RP já configurada no projeto.
- `dashboard`, `analytics`, `solar`, `air-quality`, `sectors`, `sensors`, `report`, `openapi` e `weather` usam o Supabase como upstream principal.
- Query string interna da rota catch-all (`...path`) não é mais repassada ao Supabase.
- OpenWeather agora usa as coordenadas corretas de Ribeirão Preto (-21.1775, -47.8103).
- A chave OpenWeather em Vercel é tratada de forma stateless: o navegador envia a chave protegida ao backend em `X-SIPIC-OpenWeather-Key`; também é possível definir `OPENWEATHER_API_KEY` nas variáveis da Vercel.
- Sem chave OpenWeather, o painel não acusa uma falha geral: informa `CONTINGÊNCIA ATIVA` e continua com Open-Meteo.
- O endpoint `/api/health` valida o upstream Supabase sem derrubar o frontend caso haja indisponibilidade temporária.
- O dashboard mantém fallback local somente se o upstream Supabase estiver realmente indisponível.

## Variáveis recomendadas na Vercel

```env
SIPIC_API_BASE_URL=https://pzwtoksbbfvgsnwunzri.supabase.co/functions/v1/sipic-api
OPENWEATHER_API_KEY=
REQUEST_TIMEOUT_MS=18000
```

`OPENWEATHER_API_KEY` é opcional se a chave for informada pelo painel. Nunca coloque a chave em `config.js`, `app.js` ou `index.html`.


## v1.3.2 — CAMS Solar Radiation

- Corrigido o `404`/estado `ERRO` de `GET /api/cams-radiation` na Vercel.
- O endpoint agora responde em serverless e usa **Open-Meteo Solar Radiation como contingência automática** quando a consulta CAMS histórica não estiver disponível.
- A contingência fornece GHI, BHI, DHI e DNI sem derrubar o painel.
- O diagnóstico passou a tratar `fallback` como fonte operacional, exibindo `CONTINGÊNCIA` em vez de `ERRO`.
- No servidor local, quando `CAMS_API_KEY` estiver configurada, o sistema tenta o CAMS oficial; se a consulta falhar ou estiver em fila, troca automaticamente para Open-Meteo.
- O adaptador Python deixou de solicitar sempre `ontem`: ele consulta a data mais recente publicada no catálogo CAMS, evitando erros por atraso de disponibilidade do dataset.

## v1.3.3 — diagnóstico de contingência CAMS

- A contingência **Open-Meteo Solar** do CAMS continua explícita, mas agora é classificada como `INFO/ONLINE` no console porque a fonte alternativa está respondendo normalmente.
- `WARN` fica reservado para degradação real, como quando Open-Meteo Solar também falha e o sistema precisa usar a referência solar calculada localmente.
- O painel continua informando que o CAMS oficial não está autenticado, sem tratar uma contingência saudável como erro operacional.
