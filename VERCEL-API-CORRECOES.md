# Correções de APIs — SIPIC-RP / Vercel

Esta revisão adiciona o gateway serverless da Vercel e melhora o diagnóstico das fontes externas.

## Corrigido

- `/api/health` valida o upstream Supabase real.
- `SIPIC_API_BASE_URL` continua opcional, usando a Edge Function SIPIC-RP como padrão.
- Rotas do dashboard são encaminhadas ao Supabase quando disponível.
- OpenWeather usa as coordenadas de Ribeirão Preto (-21.1775, -47.8103).
- `OPENWEATHER_API_KEY` é lida no backend; o frontend não precisa conhecer a chave.
- Sem chave, OpenWeather entra em contingência e o Open-Meteo continua operacional.
- Diagnósticos separam gateway, OpenWeather e fontes de contingência.
- `weather-comparison` compara Open-Meteo e OpenWeather para fins acadêmicos.

## Variáveis recomendadas na Vercel

```env
SIPIC_API_BASE_URL=https://pzwtoksbbfvgsnwunzri.supabase.co/functions/v1/sipic-api
OPENWEATHER_API_KEY=
REQUEST_TIMEOUT_MS=18000
```

A chave deve ser cadastrada em **Vercel → Settings → Environment Variables**. Nunca coloque uma chave real em arquivos versionados.

## CAMS Solar Radiation

Quando o CAMS oficial não estiver disponível/autenticado, `/api/cams-radiation` utiliza Open-Meteo Solar como contingência operacional e informa explicitamente a fonte alternativa.
