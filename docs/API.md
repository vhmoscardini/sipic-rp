# API do SIPIC-RP

## Visão geral

A API pública agrega meteorologia, qualidade do ar, série solar, morfologia urbana e persistência científica. Ela é executada em uma Supabase Edge Function e retorna JSON com CORS habilitado para leitura.

```text
Base URL:
https://pzwtoksbbfvgsnwunzri.supabase.co/functions/v1/sipic-api
```

O endpoint de ingestão é separado e protegido:

```text
https://pzwtoksbbfvgsnwunzri.supabase.co/functions/v1/sipic-ingest
```

## Convenções

- Datas: ISO 8601.
- Horário do modelo: `America/Sao_Paulo`.
- Temperatura: graus Celsius.
- Vento: metros por segundo.
- Pressão: hectopascais.
- Radiação: watts por metro quadrado.
- Material particulado: microgramas por metro cúbico.
- Coordenadas: WGS 84 / EPSG:4326.

## Cache e contingência

- Meteorologia: cache de 10 minutos.
- Qualidade do ar: cache de 20 minutos.
- NASA POWER: cache de 6 horas.
- Quando a fonte externa falha, a API pode responder com o último cache válido e `stale: true`.
- `refresh=1` solicita atualização, mas existe limitação mínima de frequência para impedir abuso.

## `GET /health`

Retorna o estado da API, banco, catálogo e cache.

```bash
curl "BASE_URL/health"
```

Campos importantes:

```json
{
  "ok": true,
  "service": "SIPIC-RP API",
  "api_version": "1.0.1",
  "model_version": "sipic-hybrid-1.0.0",
  "database": {
    "status": "online",
    "sectors": 8,
    "stations": 11
  }
}
```

## `GET /dashboard`

Payload principal do frontend. Integra:

- condições meteorológicas atuais;
- qualidade do ar;
- oito setores urbanos;
- setor mais quente;
- previsão de até 48 horas;
- intervalo inferior e superior;
- confiança;
- risco térmico;
- explicação das variáveis;
- inventário de fontes;
- alertas ativos;
- metadados científicos.

```bash
curl "BASE_URL/dashboard"
curl "BASE_URL/dashboard?refresh=1"
```

Trecho de resposta:

```json
{
  "ok": true,
  "data_status": "live_and_calculated",
  "location": {
    "city": "Ribeirão Preto",
    "state": "SP",
    "timezone": "America/Sao_Paulo"
  },
  "current": {
    "air_temperature_c": 28.4,
    "surface_temperature_c": 30.4,
    "relative_humidity_pct": 56,
    "urban_heat_island_c": 4.1,
    "risk_level": "moderate",
    "confidence_pct": 92
  },
  "forecast": {
    "horizon_hours": 48,
    "city_timeline": [],
    "by_sector": []
  }
}
```

## `GET /weather`

Retorna o formato original e a normalização da Open-Meteo Forecast API.

```bash
curl "BASE_URL/weather"
```

Variáveis utilizadas:

- `temperature_2m`;
- `relative_humidity_2m`;
- `apparent_temperature`;
- `surface_pressure`;
- `wind_speed_10m`;
- `wind_direction_10m`;
- `shortwave_radiation`;
- `soil_temperature_0cm`;
- precipitação, nebulosidade e código WMO.

## `GET /air-quality`

Retorna dados da Open-Meteo Air Quality API/CAMS.

```bash
curl "BASE_URL/air-quality"
```

Variáveis:

- PM2.5 e PM10;
- US AQI;
- ozônio;
- dióxido de nitrogênio;
- dióxido de enxofre;
- monóxido de carbono;
- índice UV.

## `GET /solar`

Retorna a série diária recente da NASA POWER.

```bash
curl "BASE_URL/solar"
```

Parâmetros consultados:

- `ALLSKY_SFC_SW_DWN`;
- `T2M`;
- `RH2M`;
- `WS2M`;
- `PRECTOTCORR`.

## `GET /sectors`

Catálogo de setores e parâmetros morfológicos.

```bash
curl "BASE_URL/sectors"
```

Principais campos:

```json
{
  "code": "RP-CENTRO-04",
  "name": "Centro / Quadrilátero Central",
  "latitude": -21.1775,
  "longitude": -47.8103,
  "imperviousness": 0.91,
  "ndvi": 0.19,
  "sky_view_factor": 0.34,
  "building_density": 0.88,
  "ventilation_factor": 0.24,
  "heat_offset_c": 3.35
}
```

## `GET /sensors`

Inventário de estações lógicas, fontes externas e grades virtuais.

```bash
curl "BASE_URL/sensors"
```

O estado `online` significa que a fonte lógica participou do ciclo recente. Uma grade virtual não deve ser confundida com um sensor físico instalado.

## `GET /analytics`

Consulta o histórico persistido.

```bash
curl "BASE_URL/analytics?hours=168"
```

- Mínimo: 6 horas.
- Máximo: 720 horas.
- Limite atual: 10.000 registros por resposta.

## `GET /report`

Gera um retrato operacional e salva uma cópia em `sipic_reports`.

```bash
curl "BASE_URL/report"
```

## `GET /openapi`

Retorna a descrição resumida do contrato público.

```bash
curl "BASE_URL/openapi"
```

Uma versão estática mais detalhada também está no arquivo [`../openapi.json`](../openapi.json).

## `POST /sipic-ingest`

A função protegida recebe observações de sensores próprios.

### Autenticação

```http
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json
```

### Exemplo

```bash
curl -X POST \
  "https://SEU_PROJETO.supabase.co/functions/v1/sipic-ingest" \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "station_code": "RP-CENTRO-04",
    "observed_at": "2026-08-25T20:00:00-03:00",
    "source": "estacao_escola",
    "quality_score": 96,
    "metadata": {
      "instrument": "abrigo meteorologico",
      "height_m": 2
    },
    "measurements": {
      "air_temperature_c": 32.7,
      "apparent_temperature_c": 34.4,
      "surface_temperature_c": 45.1,
      "relative_humidity_pct": 38.2,
      "surface_pressure_hpa": 952.7,
      "wind_speed_ms": 1.8,
      "wind_direction_deg": 145,
      "shortwave_radiation_wm2": 743,
      "pm25_ugm3": 21.4,
      "ndvi": 0.18
    }
  }'
```

### Resposta de sucesso

```json
{
  "ok": true,
  "message": "Observação recebida e persistida.",
  "station": {
    "code": "RP-CENTRO-04",
    "name": "Centro / Quadrilátero Central — grade virtual"
  },
  "observation": {
    "id": 123,
    "observed_at": "2026-08-25T23:00:00+00:00",
    "source": "estacao_escola",
    "quality_score": 96
  }
}
```

### Erros esperados

| HTTP | Motivo |
|---:|---|
| 400 | JSON inválido |
| 401 | JWT ausente, inválido ou expirado |
| 404 | Estação não cadastrada ou inativa |
| 405 | Método não permitido |
| 422 | Medição fora dos intervalos aceitos |
| 500 | Falha de persistência |

## Modelo de risco

O índice atual é **experimental**, não clínico nem oficial. Combina:

- temperatura aparente;
- diferença urbano–referência;
- impermeabilização;
- vegetação/NDVI.

O retorno usa as classes `low`, `moderate`, `high` e `critical`. O frontend traduz essas classes e mantém o aviso científico visível.

### GET /weather-comparison

Compara Open-Meteo e OpenWeather para Ribeirão Preto/SP. Retorna os valores normalizados de cada fonte, diferença absoluta, diferença relativa, quantidade de métricas comparáveis e uma interpretação agregada. Uma fonte indisponível não invalida os dados da outra.
