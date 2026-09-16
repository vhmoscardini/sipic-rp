# SIPIC-RP — versão local completa

**Sistema Inteligente de Monitoramento e Predição de Ilhas de Calor Urbanas Baseado na Dinâmica Atmosférica de Vênus**, com foco em Ribeirão Preto, SP.

Esta edição foi preparada para funcionar **sem Vercel**. O frontend é servido por um pequeno servidor Node.js local, que também atua como gateway para a API científica já implantada no Supabase.

> O sistema é acadêmico e experimental. Os dados meteorológicos e de qualidade do ar são consultados em fontes externas; as estimativas intraurbanas são calculadas por modelo e não substituem sensores calibrados nem alertas oficiais.

## O que está funcionando

- Dashboard responsivo para desktop, tablet e telemóvel.
- Atualização automática dos dados a cada 10 minutos.
- Meteorologia atual e previsão horária via Open-Meteo.
- Condições atuais opcionais via OpenWeather (API key no backend).
- Observações de estação opcionais via Meteomatics `mix-obs` (credenciais no backend).
- Qualidade do ar via Open-Meteo Air Quality/CAMS.
- Série solar e meteorológica via NASA POWER.
- Banco PostgreSQL/Supabase com histórico, cache, previsões, alertas e relatórios.
- Modelo híbrido por oito setores experimentais de Ribeirão Preto.
- Previsão de até 48 horas, confiança, intervalo de incerteza e explicabilidade.
- Mapa térmico, hotspots, séries temporais e comparação didática com Vênus.
- Inventário da rede de sensores e endpoint protegido para ingestão de medições próprias.
- Exportações JSON, CSV e GeoJSON.
- Relatórios imprimíveis.
- Fallback de cache quando uma fonte externa fica temporariamente indisponível.

## Arquitetura sem Vercel

```text
Navegador
   │
   ├── http://127.0.0.1:8080          frontend
   │
   └── http://127.0.0.1:8080/api/*    gateway local Node.js
                         │
                         ▼
       Supabase Edge Function sipic-api
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
  PostgreSQL/Supabase          Open-Meteo, CAMS e NASA POWER
```

A chave de serviço do Supabase fica somente nas Edge Functions. O navegador não recebe segredos.

## Iniciar no Windows

1. Instale o Node.js 20 ou superior.
2. Extraia o projeto.
3. Execute `iniciar.bat`.
4. O navegador abrirá em:

```text
http://127.0.0.1:8080
```

## Iniciar pelo terminal

```bash
npm start
```

Acesse:

```text
http://127.0.0.1:8080
```

Verificação do servidor local:

```text
http://127.0.0.1:8080/local-health
```

Verificação da API através do gateway:

```text
http://127.0.0.1:8080/api/health
```

## Executar com Docker

```bash
docker compose up --build -d
```

Depois acesse `http://127.0.0.1:8080`.

## API científica

A Edge Function já configurada é:

```text
https://pzwtoksbbfvgsnwunzri.supabase.co/functions/v1/sipic-api
```

O frontend não chama essa URL diretamente. Ele usa `/api`, e o servidor local faz o redirecionamento seguro.

Rotas públicas principais:

| Rota local | Função |
|---|---|
| `GET /api/health` | Saúde da API, banco e cache |
| `GET /api/dashboard` | Payload completo do painel |
| `GET /api/weather` | Meteorologia atual e previsão |
| `GET /api/air-quality` | PM2.5, PM10, AQI, gases e UV |
| `GET /api/solar` | Série NASA POWER |
| `GET /api/sectors` | Setores experimentais |
| `GET /api/sensors` | Rede de estações/fontes |
| `GET /api/analytics?hours=168` | Histórico persistido |
| `GET /api/report` | Gera e persiste relatório |
| `GET /api/openapi` | Contrato OpenAPI resumido |

## Ingestão de sensores físicos

A função `sipic-ingest` permanece protegida por JWT do Supabase Auth. Ela aceita medições próprias de temperatura, umidade, vento, radiação, temperatura de superfície e qualidade do ar.

Exemplo de payload:

```json
{
  "station_code": "RP-CENTRO-04",
  "observed_at": "2026-08-25T20:00:00-03:00",
  "source": "sensor_escola_01",
  "quality_score": 96,
  "measurements": {
    "air_temperature_c": 32.7,
    "relative_humidity_pct": 38.2,
    "wind_speed_ms": 1.8,
    "surface_temperature_c": 45.1
  }
}
```

Consulte `docs/API.md` para o exemplo completo de autenticação.

## Configuração

Copie `.env.example` para `.env` somente quando precisar alterar a porta ou usar outra API:

```env
HOST=127.0.0.1
PORT=8080
SIPIC_API_BASE_URL=https://SEU_PROJETO.supabase.co/functions/v1/sipic-api
```

O arquivo `config.js` deve continuar apontando para o gateway local:

```js
apiBaseUrl: "/api"
```

## Validação

```bash
npm run check
npm run validate
npm run smoke
```

- `check`: valida a sintaxe do frontend e do servidor local.
- `validate`: verifica a estrutura e procura configurações inseguras.
- `smoke`: consulta as rotas públicas da API remota; precisa de internet.

## Recriar o backend em outro Supabase

O projeto inclui:

```text
supabase/migrations/20260825230000_sipic_core.sql
supabase/functions/sipic-api/
supabase/functions/sipic-ingest/
```

Passos resumidos:

```bash
supabase db push
supabase functions deploy sipic-api --no-verify-jwt
supabase functions deploy sipic-ingest
```

Depois altere `SIPIC_API_BASE_URL` no `.env` local.

## Classificação científica

| Classe | Significado |
|---|---|
| Observado | Medição de sensor autenticado |
| Modelado | Resultado de serviço meteorológico ou reanálise |
| Calculado | Derivação do sistema, como correção morfológica |
| Predito | Estimativa futura do modelo híbrido |
| Simulado | Cenário hipotético de intervenção urbana |

## Limitações científicas

- Os setores são experimentais e não representam limites administrativos oficiais.
- A temperatura de superfície é estimada quando não há imagem térmica orbital instantânea.
- O modelo deve ser calibrado com sensores locais e validado de forma independente.
- A dinâmica de Vênus é usada como analogia didática e referência de transferência radiativa, não como equivalência climática direta.
- O sistema não substitui INMET, Defesa Civil, serviços de saúde ou protocolos oficiais.

## Fontes meteorológicas e qualidade do ar
A aplicação utiliza o gateway local (`/api`) para evitar problemas de CORS. Se a Edge Function estiver indisponível ou reportar falha nas fontes, o gateway consulta diretamente a **Open-Meteo Forecast API** e a **CAMS via Open-Meteo** e atualiza os status no painel. Execute o projeto pelo servidor Node (`npm start` ou `iniciar.bat`); abrir o `index.html` diretamente no navegador não ativa o gateway.


### OpenWeather e Meteomatics

O gateway consulta as duas fontes em paralelo quando as credenciais estiverem configuradas. O painel prioriza **Meteomatics `mix-obs`** para observação de estação, depois **OpenWeather** para condições atuais e mantém **Open-Meteo** como fonte de previsão/modelagem e radiação. Se as chaves não forem configuradas, o projeto continua funcionando com Open-Meteo. Nunca coloque essas credenciais em `app.js`, `config.js` ou `index.html`.


## CAMS — integração isolada

O endpoint `GET /api/cams-radiation` consulta o dataset CAMS Solar Radiation Time-Series do Copernicus quando a integração CAMS está disponível. Ele é executado separadamente do pipeline principal: falhas, fila, timeout ou ausência de `CAMS_API_KEY` não interrompem Open-Meteo, OpenWeather, Meteomatics, Supabase ou o endpoint `/api/solar`.

Na Vercel, o endpoint possui **contingência automática por Open-Meteo Solar Radiation** e continua fornecendo GHI, BHI, DHI e DNI com `status: fallback`, evitando o antigo estado `ERRO`. Quando essa contingência externa está saudável, o console a classifica como **INFO/ONLINE**; `WARN` é usado apenas se também houver degradação da contingência e for necessário recorrer à referência solar calculada localmente. No servidor local, configure `CAMS_API_KEY` no `.env` para tentar a fonte CAMS oficial; se ela não responder, o mesmo fallback é aplicado.


## Configuração da OpenWeather pelo painel

Acesse a página **Dados e fontes** e use o cartão **Chave da API OpenWeather**. Cole a sua API Key e clique em **Salvar e testar**.

- A chave é enviada somente ao servidor local do SIPIC-RP.
- O servidor mantém a chave apenas em memória durante a sessão.
- O navegador guarda a chave no `localStorage` para recarregá-la automaticamente quando o painel for aberto.
- A chave nunca é devolvida em texto puro pela API; o status usa uma forma mascarada.
- **Remover chave** apaga a chave da sessão do servidor e do `localStorage`.
- O arquivo `iniciar.bat` não precisa mais conter a chave.

Endpoints locais:
- `GET /api/settings/openweather` — status da configuração (sem revelar a chave).
- `POST /api/settings/openweather` — carrega uma chave na memória do servidor.
- `DELETE /api/settings/openweather` — remove a chave da sessão.

## Diagnóstico e OpenWeather

A OpenWeather é validada de verdade quando a chave é cadastrada no painel. O endpoint `POST /api/settings/openweather` realiza uma chamada real ao Current Weather antes de aceitar a chave. A chave validada é armazenada apenas localmente em `.openweather-key`, ignorado pelo Git, e mantida em memória no servidor.

O endpoint `GET /api/diagnostics` testa em paralelo Open-Meteo, OpenWeather, Meteomatics, CAMS, Open-Meteo Solar e Supabase e devolve status, HTTP, latência e mensagens de erro. O painel de Dados e fontes exibe esse resultado em um console de diagnóstico.

Este projeto é Node.js e **não possui arquivo JAR**. Não é necessário Java para executar o servidor; o requisito é Node.js 20 ou superior.


## Correção do painel OpenWeather
Erros de resposta agora são normalizados no frontend e nunca são exibidos como `[object Object]`. O painel mostra mensagem, código e HTTP quando disponíveis.


## Vercel — correção definitiva do painel OpenWeather
A rota `POST /api/settings/openweather` é atendida diretamente pela função serverless catch-all. O painel recebe JSON consistente e não depende de gravação em arquivo local, evitando 404 e `[object Object]`.


## Segurança da OpenWeather
A configuração pelo painel foi removida. A chave é lida exclusivamente de `OPENWEATHER_API_KEY` no backend (`.env` local ou Environment Variables da Vercel). Nunca coloque a chave no frontend.

## Banco científico principal

A versão final inclui o banco científico consolidado em `supabase/banco-principal.sql` e a migration `supabase/migrations/20260910000000_sipic_scientific_primary.sql`. Para ativá-lo como fonte principal do dashboard, consulte `docs/BANCO-PRINCIPAL.md` e configure `SIPIC_PRIMARY_DB=true` com as credenciais do Supabase no ambiente do backend.
