# SIPIC-RP — versão local completa

**Sistema Inteligente de Monitoramento e Predição de Ilhas de Calor Urbanas Baseado na Dinâmica Atmosférica de Vênus**, com foco em Ribeirão Preto, SP.

Esta edição foi preparada para funcionar **sem Vercel**. O frontend é servido por um pequeno servidor Node.js local, que também atua como gateway para a API científica já implantada no Supabase.

> O sistema é acadêmico e experimental. Os dados meteorológicos e de qualidade do ar são consultados em fontes externas; as estimativas intraurbanas são calculadas por modelo e não substituem sensores calibrados nem alertas oficiais.

## O que está funcionando

- Dashboard responsivo para desktop, tablet e telemóvel.
- Atualização automática dos dados a cada 10 minutos.
- Meteorologia atual e previsão horária via Open-Meteo.
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
