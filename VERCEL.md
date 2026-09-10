# SIPIC-RP — Deploy na Vercel

## 1. Deploy

Suba esta pasta para um repositório Git e importe o projeto na Vercel. Não é necessário `npm install` para a aplicação principal.

O frontend é servido como arquivos estáticos e as rotas `/api/*` usam `api/[...path].mjs` como função Node.js.

## 2. OpenWeather

Há duas formas de configurar a chave:

### Painel do SIPIC-RP

No painel **Dados e fontes**, cole a chave e clique em **Salvar e testar**. A aplicação mantém a chave no `localStorage` do navegador e a envia somente para o backend SIPIC-RP através do header `X-SIPIC-OpenWeather-Key` em HTTPS. A chave nunca é enviada diretamente do navegador para a OpenWeather.

Como funções da Vercel são stateless, não use o arquivo `.openweather-key` como mecanismo de persistência em produção.

### Recomendado para produção

Em Vercel → Settings → Environment Variables, crie:

`OPENWEATHER_API_KEY`

O valor deve ser a chave real. Depois faça um novo deploy.

## 3. Variáveis opcionais

- `SIPIC_API_BASE_URL`
- `OPENWEATHER_API_KEY`
- `METEOMATICS_USERNAME`
- `METEOMATICS_PASSWORD`
- `CAMS_API_KEY`
- `REQUEST_TIMEOUT_MS`
- `DIRECT_SOURCE_TIMEOUT_MS`
- `API_CACHE_TTL_MS`

## 4. Rotas principais

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
- `/api/settings/openweather/test`
- `/api/openapi`

## 5. Diagnóstico OpenWeather

O painel separa DNS, TCP/443, TLS e HTTP/API. Em ambiente serverless, um timeout de rede pode ser externo à aplicação; o diagnóstico ajuda a identificar a etapa.

## 6. Observação sobre a API Key no painel

O uso pelo painel é conveniente para testes e demonstrações. Para produção, prefira `OPENWEATHER_API_KEY` nas Environment Variables da Vercel, porque a chave não precisa ser mantida no navegador.

## 7. Correção de runtime

Esta versão não declara `runtime` dentro de `vercel.json`. A Vercel detecta automaticamente a função Node.js pelo arquivo `api/[...path].mjs`. Isso evita o erro `Function Runtimes must have a valid version` causado por configurações de runtime incompatíveis com o CLI.

## 8. Importante sobre timeouts

A Vercel executa funções serverless com limites de duração que variam conforme o plano. Para produção, mantenha as requisições externas com timeout menor que o limite do plano e prefira `OPENWEATHER_API_KEY` em Environment Variables.
