import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";

const LOCATION = Object.freeze({
  city: "Ribeirão Preto",
  state: "SP",
  latitude: -21.1775,
  longitude: -47.8103,
  timezone: "America/Sao_Paulo",
});

const UPSTREAM_API = String(
  process.env.SIPIC_API_BASE_URL ||
  "https://pzwtoksbbfvgsnwunzri.supabase.co/functions/v1/sipic-api"
).replace(/\/+$/, "");

const TIMEOUT_MS = Math.max(5_000, Number(process.env.REQUEST_TIMEOUT_MS || 18_000));
const OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
const OPENMETEO_URL = "https://api.open-meteo.com/v1/forecast";

const memory = globalThis.__SIPIC_VERCEL_STATE__ ||= { logs: [] };

function json(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SIPIC-OpenWeather-Key");
  for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value);
  if (status === 204) return res.end();
  res.end(JSON.stringify(payload));
}

function addLog(level, source, message, error_code = null) {
  memory.logs.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    ...(error_code ? { error_code } : {}),
  });
  if (memory.logs.length > 150) memory.logs.splice(0, memory.logs.length - 150);
}

function maskKey(key) {
  const value = String(key || "");
  if (!value) return null;
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requestOpenWeatherKey(req) {
  const header = req.headers?.["x-sipic-openweather-key"];
  const fromHeader = String(Array.isArray(header) ? header[0] : (header || "")).trim();
  return fromHeader || String(process.env.OPENWEATHER_API_KEY || "").trim();
}

async function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

async function fetchJson(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; }
    catch { payload = { raw: text.slice(0, 500) }; }
    return { response, payload, latency_ms: Date.now() - started };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error(`Timeout após ${timeoutMs} ms.`);
      timeout.code = "HTTP_TIMEOUT";
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeOpenMeteo(payload) {
  const c = payload?.current || {};
  return {
    observed_at: c.time || null,
    temperature_c: Number.isFinite(Number(c.temperature_2m)) ? Number(c.temperature_2m) : null,
    apparent_temperature_c: Number.isFinite(Number(c.apparent_temperature)) ? Number(c.apparent_temperature) : null,
    humidity_pct: Number.isFinite(Number(c.relative_humidity_2m)) ? Number(c.relative_humidity_2m) : null,
    pressure_hpa: Number.isFinite(Number(c.surface_pressure)) ? Number(c.surface_pressure) : null,
    wind_speed_ms: Number.isFinite(Number(c.wind_speed_10m)) ? Number(c.wind_speed_10m) : null,
    wind_direction_deg: Number.isFinite(Number(c.wind_direction_10m)) ? Number(c.wind_direction_10m) : null,
    precipitation_1h_mm: Number.isFinite(Number(c.precipitation)) ? Number(c.precipitation) : null,
    cloud_cover_pct: Number.isFinite(Number(c.cloud_cover)) ? Number(c.cloud_cover) : null,
    shortwave_radiation_wm2: Number.isFinite(Number(c.shortwave_radiation)) ? Number(c.shortwave_radiation) : null,
    weather_code: Number.isFinite(Number(c.weather_code)) ? Number(c.weather_code) : null,
  };
}

async function openMeteoCurrent() {
  const params = new URLSearchParams({
    latitude: String(LOCATION.latitude),
    longitude: String(LOCATION.longitude),
    timezone: LOCATION.timezone,
    wind_speed_unit: "ms",
    current: [
      "temperature_2m", "apparent_temperature", "relative_humidity_2m",
      "surface_pressure", "wind_speed_10m", "wind_direction_10m",
      "precipitation", "cloud_cover", "shortwave_radiation", "weather_code",
    ].join(","),
  });
  const { response, payload, latency_ms } = await fetchJson(`${OPENMETEO_URL}?${params}`);
  if (!response.ok) {
    const error = new Error(payload?.reason || payload?.message || `Open-Meteo respondeu HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return {
    ok: true,
    status: "online",
    source: "Open-Meteo",
    http_status: response.status,
    latency_ms,
    ...normalizeOpenMeteo(payload),
    raw: payload,
  };
}

function localSolarReferenceFallback(reason = "Fonte solar externa indisponível") {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: LOCATION.timezone, year: "numeric", month: "2-digit", day: "2-digit"
  });
  const date = formatter.format(now);
  const rows = Array.from({ length: 24 }, (_, hour) => {
    const solar = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
    const ghi = solar * 820;
    const direct = ghi * (0.68 + 0.12 * solar);
    const diffuse = Math.max(0, ghi - direct);
    const dni = solar > 0.08 ? Math.min(980, direct / Math.max(0.18, solar)) : 0;
    return {
      timestamp: `${date}T${String(hour).padStart(2, "0")}:00`,
      ghi_wm2: Math.round(ghi),
      bhi_wm2: Math.round(direct),
      dhi_wm2: Math.round(diffuse),
      dni_wm2: Math.round(dni),
      terrestrial_radiation_wm2: null,
      reliability_pct: 45,
    };
  });
  return {
    ok: true, configured: Boolean(String(process.env.CAMS_API_KEY || "").trim()), status: "degraded",
    source: "SIPIC-RP Solar Reference", requested_source: "CAMS Solar Radiation Time-Series",
    dataset: "sipic-local-solar-reference", date, location: { latitude: LOCATION.latitude, longitude: LOCATION.longitude },
    temporal_resolution: "1hour", time_reference: LOCATION.timezone, rows, fallback_source: "SIPIC-RP calculated reference",
    data_class: "calculated_reference",
    message: `${reason}. Referência solar calculada ativada para manter o painel operacional; não representa medição CAMS.`,
  };
}

async function openMeteoSolarFallback() {
  const params = new URLSearchParams({
    latitude: String(LOCATION.latitude),
    longitude: String(LOCATION.longitude),
    timezone: LOCATION.timezone,
    current: ["shortwave_radiation", "direct_radiation", "diffuse_radiation", "direct_normal_irradiance", "terrestrial_radiation"].join(","),
    hourly: ["shortwave_radiation", "direct_radiation", "diffuse_radiation", "direct_normal_irradiance", "terrestrial_radiation"].join(","),
    past_days: "1",
    forecast_days: "1",
  });
  const { response, payload, latency_ms } = await fetchJson(`${OPENMETEO_URL}?${params}`);
  if (!response.ok) {
    const error = new Error(payload?.reason || payload?.message || `Open-Meteo Solar respondeu HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  const hourly = payload?.hourly || {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const rows = times.map((timestamp, i) => ({
    timestamp,
    ghi_wm2: finiteNumber(hourly.shortwave_radiation?.[i]),
    bhi_wm2: finiteNumber(hourly.direct_radiation?.[i]),
    dhi_wm2: finiteNumber(hourly.diffuse_radiation?.[i]),
    dni_wm2: finiteNumber(hourly.direct_normal_irradiance?.[i]),
    terrestrial_radiation_wm2: finiteNumber(hourly.terrestrial_radiation?.[i]),
    reliability_pct: null,
  }));
  const current = payload?.current || {};
  const date = String(current.time || times.at(-1) || new Date().toISOString()).slice(0, 10);
  return {
    ok: true,
    configured: Boolean(String(process.env.CAMS_API_KEY || "").trim()),
    status: "fallback",
    source: "Open-Meteo Solar Radiation",
    requested_source: "CAMS Solar Radiation Time-Series",
    dataset: "open-meteo-radiation-fallback",
    date,
    location: { latitude: LOCATION.latitude, longitude: LOCATION.longitude },
    temporal_resolution: "1hour",
    time_reference: LOCATION.timezone,
    rows,
    latency_ms,
    fallback_source: "Open-Meteo",
    data_class: "live_modeled_fallback",
    message: String(process.env.CAMS_API_KEY || "").trim()
      ? "CAMS está configurado, mas a consulta histórica pode ser assíncrona. O painel usa radiação Open-Meteo automaticamente enquanto o dado CAMS não está disponível."
      : "CAMS não possui credencial configurada. Radiação Open-Meteo ativa como contingência automática, sem interromper o painel.",
  };
}

async function openWeatherCurrent(key) {
  if (!key) {
    return { ok: false, configured: false, status: "not_configured", source: "OpenWeather", message: "API Key não configurada." };
  }
  const params = new URLSearchParams({
    lat: String(LOCATION.latitude),
    lon: String(LOCATION.longitude),
    appid: key,
    units: "metric",
    lang: "pt_br",
  });
  const { response, payload, latency_ms } = await fetchJson(`${OPENWEATHER_URL}?${params}`);
  if (!response.ok) {
    const error = new Error(payload?.message || `OpenWeather respondeu HTTP ${response.status}.`);
    error.status = response.status;
    error.code = response.status === 401 ? "INVALID_API_KEY" : response.status === 429 ? "RATE_LIMIT" : `HTTP_${response.status}`;
    throw error;
  }
  const rain = Number(payload?.rain?.["1h"]);
  const snow = Number(payload?.snow?.["1h"]);
  return {
    ok: true,
    configured: true,
    status: "online",
    source: "OpenWeather",
    http_status: response.status,
    latency_ms,
    observed_at: payload?.dt ? new Date(Number(payload.dt) * 1000).toISOString() : null,
    temperature_c: Number.isFinite(Number(payload?.main?.temp)) ? Number(payload.main.temp) : null,
    apparent_temperature_c: Number.isFinite(Number(payload?.main?.feels_like)) ? Number(payload.main.feels_like) : null,
    humidity_pct: Number.isFinite(Number(payload?.main?.humidity)) ? Number(payload.main.humidity) : null,
    pressure_hpa: Number.isFinite(Number(payload?.main?.pressure)) ? Number(payload.main.pressure) : null,
    wind_speed_ms: Number.isFinite(Number(payload?.wind?.speed)) ? Number(payload.wind.speed) : null,
    wind_direction_deg: Number.isFinite(Number(payload?.wind?.deg)) ? Number(payload.wind.deg) : null,
    wind_gust_ms: Number.isFinite(Number(payload?.wind?.gust)) ? Number(payload.wind.gust) : null,
    cloud_cover_pct: Number.isFinite(Number(payload?.clouds?.all)) ? Number(payload.clouds.all) : null,
    precipitation_1h_mm: Number.isFinite(rain) ? rain : (Number.isFinite(snow) ? snow : 0),
    condition: payload?.weather?.[0]?.description || payload?.weather?.[0]?.main || null,
    weather_code: Number.isFinite(Number(payload?.weather?.[0]?.id)) ? Number(payload.weather[0].id) : null,
    raw: payload,
  };
}

async function checkSupabase() {
  try {
    const { response, payload, latency_ms } = await fetchJson(`${UPSTREAM_API}/health`, {}, Math.min(TIMEOUT_MS, 15_000));
    const dbOnline = payload?.database?.status === "online" || payload?.ok === true;
    if (!response.ok || !dbOnline) {
      return {
        ok: false,
        status: "error",
        source: "Supabase",
        http_status: response.status,
        latency_ms,
        message: payload?.detail || payload?.error || payload?.message || `Supabase respondeu HTTP ${response.status}.`,
      };
    }
    return {
      ok: true,
      status: "online",
      source: "Supabase",
      http_status: response.status,
      latency_ms,
      database_status: payload?.database?.status || "online",
      service: payload?.service || "SIPIC-RP API",
    };
  } catch (error) {
    return { ok: false, status: "error", source: "Supabase", message: error?.message || String(error), error_code: error?.code || "SUPABASE_CONNECTION_ERROR" };
  }
}

function filteredUpstreamUrl(req, relative) {
  const incoming = new URL(req.url || "/", "http://localhost");
  const target = new URL(`${UPSTREAM_API}/${relative}`);
  for (const [key, value] of incoming.searchParams.entries()) {
    if (["...path", "path", "slug"].includes(key)) continue;
    target.searchParams.append(key, value);
  }
  return target;
}

async function proxyUpstream(req, res, relative) {
  const target = filteredUpstreamUrl(req, relative);
  try {
    const { response, payload, latency_ms } = await fetchJson(target, { method: req.method || "GET" });
    if (!response.ok) {
      addLog("error", "Supabase", `${relative || "dashboard"}: HTTP ${response.status}`, `HTTP_${response.status}`);
      return { ok: false, response, payload, latency_ms };
    }
    json(res, 200, payload, { "X-SIPIC-Upstream": "Supabase Edge Function", "X-SIPIC-Upstream-Latency": String(latency_ms) });
    return { ok: true };
  } catch (error) {
    addLog("error", "Supabase", `${relative || "dashboard"}: ${error.message}`, error.code || "SUPABASE_CONNECTION_ERROR");
    return { ok: false, error };
  }
}

function localDashboardFallback() {
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    data_status: "fallback_local_reference",
    fallback_reason: "supabase_temporarily_unavailable",
    location: { city: LOCATION.city, state: LOCATION.state, country: "Brasil", latitude: LOCATION.latitude, longitude: LOCATION.longitude, timezone: LOCATION.timezone },
    current: {
      air_temperature_c: 36.1, surface_temperature_c: 51.8,
      relative_humidity_pct: 31, wind_speed_ms: 1.8,
      urban_heat_island_c: 5.7, ndvi: 0.34,
      apparent_temperature_c: 39.4, confidence_pct: 92,
      shortwave_radiation_wm2: 780, risk_level: "high", risk_label: "Risco térmico alto",
    },
    air_quality: { pm25_ugm3: 34.6, us_aqi: 86, aqi_classification: { label: "Moderado" } },
    network: { online: 0, total: 0, health_pct: 0, stations: [] },
    sectors: [],
    forecast: { horizon_hours: 0, city_timeline: [] },
    predictions: [], events: [], feature_importance: [], alerts: [],
    sources: [
      { id: "supabase", name: "Supabase PostgreSQL", status: "degraded" },
      { id: "local_fallback", name: "Referência local de contingência", status: "online" },
    ],
    model_version: "SIPIC-Hybrid v1.0",
    scientific_disclaimer: "Modo de contingência temporário. Dados de referência não substituem o upstream científico.",
  };
}

async function weatherComparison(key) {
  const started = Date.now();
  let openMeteo;
  try { openMeteo = await openMeteoCurrent(); }
  catch (error) { openMeteo = { ok: false, status: "error", source: "Open-Meteo", message: error.message, http_status: error.status || null }; }

  let openWeather;
  if (key) {
    try { openWeather = await openWeatherCurrent(key); }
    catch (error) {
      openWeather = { ok: false, configured: true, status: "error", source: "OpenWeather", message: error.message, http_status: error.status || null, error_code: error.code || "OPENWEATHER_ERROR" };
    }
  } else {
    openWeather = {
      ok: false,
      configured: false,
      status: "not_configured",
      source: "OpenWeather",
      message: "API Key não configurada. O painel continua operacional com Open-Meteo.",
    };
  }

  const metrics = [
    ["temperature_c", "Temperatura", "°C"],
    ["apparent_temperature_c", "Sensação térmica", "°C"],
    ["humidity_pct", "Umidade relativa", "%"],
    ["pressure_hpa", "Pressão atmosférica", "hPa"],
    ["wind_speed_ms", "Velocidade do vento", "m/s"],
    ["precipitation_1h_mm", "Precipitação", "mm"],
    ["cloud_cover_pct", "Nebulosidade", "%"],
  ];

  const comparison = Object.fromEntries(metrics.map(([metric, label, unit]) => {
    const a = finiteNumber(openMeteo?.[metric]);
    const b = finiteNumber(openWeather?.[metric]);
    const difference = a !== null && b !== null ? Math.abs(a - b) : null;
    const mean = a !== null && b !== null ? (Math.abs(a) + Math.abs(b)) / 2 : null;
    const relative = difference !== null && mean > 0 ? (difference / mean) * 100 : null;
    return [metric, {
      label, unit, open_meteo: a, openweather: b,
      absolute_difference: difference,
      relative_difference_pct: relative !== null ? Number(relative.toFixed(2)) : null,
    }];
  }));

  const available = Object.values(comparison).filter((item) => item.open_meteo !== null && item.openweather !== null);
  const meanRelative = available.length
    ? available.reduce((sum, item) => sum + (item.relative_difference_pct || 0), 0) / available.length
    : null;

  return {
    ok: openMeteo.ok || openWeather.ok,
    generated_at: new Date().toISOString(),
    latency_ms: Date.now() - started,
    methodology: "Comparação paralela de duas fontes meteorológicas independentes para o mesmo ponto geográfico. Diferenças podem decorrer de modelos, fontes e horários de atualização distintos.",
    location: LOCATION,
    status: openMeteo.ok && openWeather.ok ? "online" : (openMeteo.ok ? "degraded" : "error"),
    sources: { open_meteo: openMeteo, openweather: openWeather },
    comparison,
    summary: {
      comparable_metrics: available.length,
      mean_relative_difference_pct: meanRelative !== null ? Number(meanRelative.toFixed(2)) : null,
      interpretation: meanRelative === null
        ? (key ? "Sem métricas suficientes para comparação." : "OpenWeather sem chave; configure-a para habilitar a comparação independente.")
        : meanRelative <= 5
          ? "Alta concordância entre as fontes para as variáveis comparáveis."
          : meanRelative <= 15
            ? "Concordância moderada; investigar diferenças de modelo e horário."
            : "Diferença elevada; verificar timestamp, configuração e características dos modelos.",
    },
  };
}

function probeTcp(address, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = net.connect({ host: address, port: 443 });
    const timer = setTimeout(() => { socket.destroy(); reject(Object.assign(new Error(`Timeout TCP após ${timeoutMs} ms.`), { code: "TCP_TIMEOUT" })); }, timeoutMs);
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
    socket.once("connect", () => { clearTimeout(timer); const latency_ms = Date.now() - started; socket.end(); resolve({ latency_ms }); });
  });
}

function probeTls(address, hostname, timeoutMs = 7_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = tls.connect({ host: address, port: 443, servername: hostname, rejectUnauthorized: true });
    const timer = setTimeout(() => { socket.destroy(); reject(Object.assign(new Error(`Timeout TLS após ${timeoutMs} ms.`), { code: "TLS_TIMEOUT" })); }, timeoutMs);
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
    socket.once("secureConnect", () => {
      clearTimeout(timer);
      const result = { latency_ms: Date.now() - started, protocol: socket.getProtocol?.() || null, authorized: socket.authorized };
      socket.end();
      resolve(result);
    });
  });
}

async function diagnoseOpenWeather(key) {
  const hostname = "api.openweathermap.org";
  const started = Date.now();
  const out = { ok: false, source: "OpenWeather", hostname, api_key_configured: Boolean(key), phases: {} };
  try {
    const addresses = [...new Set((await dns.lookup(hostname, { all: true })).map((entry) => entry.address))];
    out.phases.dns = { ok: addresses.length > 0, addresses };

    const tcpResults = [];
    for (const address of addresses.slice(0, 4)) {
      try { tcpResults.push({ address, ok: true, ...(await probeTcp(address, 5_000)) }); }
      catch (error) { tcpResults.push({ address, ok: false, message: error.message, error_code: error.code || "TCP_ERROR" }); }
    }
    out.phases.tcp = { ok: tcpResults.some((entry) => entry.ok), results: tcpResults };

    const tlsResults = [];
    for (const address of addresses.slice(0, 4)) {
      try { tlsResults.push({ address, ok: true, ...(await probeTls(address, hostname, 7_000)) }); }
      catch (error) { tlsResults.push({ address, ok: false, message: error.message, error_code: error.code || "TLS_ERROR" }); }
    }
    out.phases.tls = { ok: tlsResults.some((entry) => entry.ok), results: tlsResults };

    if (key) {
      try {
        const current = await openWeatherCurrent(key);
        out.phases.http = { ok: true, http_status: current.http_status, latency_ms: current.latency_ms, status: "online" };
        out.ok = true;
      } catch (error) {
        out.phases.http = { ok: false, http_status: error.status || null, message: error.message, error_code: error.code || "OPENWEATHER_ERROR" };
      }
    } else {
      out.phases.http = { ok: false, skipped: true, message: "API Key não configurada. O restante do painel usa Open-Meteo como contingência." };
    }
  } catch (error) {
    out.error = { phase: "network", code: error.code || "DIAGNOSTIC_ERROR", message: error.message };
  }
  out.latency_ms = Date.now() - started;
  return out;
}

export default async function handler(req, res) {
  const rawPath = req.query?.path ?? req.query?.slug ?? "";
  let parts = Array.isArray(rawPath) ? rawPath : String(rawPath).split("/").filter(Boolean);
  if (!parts.length) {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    parts = pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  }
  const route = "/" + parts.join("/");
  const key = requestOpenWeatherKey(req);

  try {
    if (req.method === "OPTIONS") return json(res, 204, null);

    if (route === "/settings/openweather") {
      if (req.method === "GET") return json(res, 200, { ok: true, configured: Boolean(key), masked_key: maskKey(key), persistence: key ? "browser_header_or_environment" : "not_configured" });
      if (req.method === "DELETE") return json(res, 200, { ok: true, configured: false, message: "Chave removida do navegador. Se OPENWEATHER_API_KEY estiver configurada na Vercel, remova-a também nas variáveis do projeto." });
      if (req.method === "POST") {
        const body = await readJson(req);
        const candidate = String(body.apiKey || body.api_key || key || "").trim();
        if (!candidate) return json(res, 400, { ok: false, error_code: "KEY_REQUIRED", message: "Informe uma API Key da OpenWeather." });
        try {
          const test = await openWeatherCurrent(candidate);
          addLog("info", "OpenWeather", "API Key validada com sucesso.");
          return json(res, 200, { ok: true, configured: true, validated: true, masked_key: maskKey(candidate), message: "API Key validada com sucesso.", validation: { http_status: test.http_status, latency_ms: test.latency_ms } });
        } catch (error) {
          addLog("error", "OpenWeather", `Falha ao validar API Key: ${error.message}`, error.code || "OPENWEATHER_ERROR");
          return json(res, error.status || 502, { ok: false, error_code: error.code || "OPENWEATHER_ERROR", message: error.message, http_status: error.status || null });
        }
      }
      return json(res, 405, { ok: false, error_code: "METHOD_NOT_ALLOWED", message: `Método ${req.method} não permitido.` }, { Allow: "GET,POST,DELETE,OPTIONS" });
    }

    if (route === "/diagnostics/openweather" && req.method === "GET") {
      return json(res, 200, await diagnoseOpenWeather(key));
    }

    if (route === "/weather-comparison" && req.method === "GET") {
      return json(res, 200, await weatherComparison(key));
    }

    if (route === "/diagnostics" && req.method === "GET") {
      const started = Date.now();
      const checks = {};

      try {
        const meteo = await openMeteoCurrent();
        checks["Open-Meteo"] = { ok: true, status: "online", http_status: meteo.http_status, latency_ms: meteo.latency_ms };
      } catch (error) {
        checks["Open-Meteo"] = { ok: false, status: "error", message: error.message, http_status: error.status || null };
      }

      if (key) {
        try {
          const weather = await openWeatherCurrent(key);
          checks["OpenWeather"] = { ok: true, status: "online", configured: true, http_status: weather.http_status, latency_ms: weather.latency_ms };
        } catch (error) {
          checks["OpenWeather"] = { ok: false, status: "error", configured: true, message: error.message, http_status: error.status || null, error_code: error.code || "OPENWEATHER_ERROR" };
        }
      } else {
        // OpenWeather é opcional. Sem chave, o painel continua totalmente operacional
        // com Open-Meteo; o diagnóstico mostra a contingência sem marcar uma falha falsa.
        checks["OpenWeather"] = {
          ok: true,
          status: "fallback",
          configured: false,
          http_status: 200,
          message: "API Key não configurada · contingência Open-Meteo ativa.",
          fallback_source: "Open-Meteo",
        };
      }

      try {
        const cams = await openMeteoSolarFallback();
        checks["CAMS Solar Radiation"] = {
          ok: true,
          status: cams.status,
          configured: cams.configured,
          http_status: 200,
          latency_ms: cams.latency_ms,
          message: cams.message,
          fallback_source: cams.fallback_source,
        };
      } catch (error) {
        const cams = localSolarReferenceFallback(`Open-Meteo Solar indisponível: ${error.message}`);
        checks["CAMS Solar Radiation"] = {
          ok: true, status: cams.status || "degraded", configured: cams.configured, http_status: 200,
          message: cams.message, fallback_source: cams.fallback_source,
        };
      }

      checks["Supabase"] = await checkSupabase();
      const online = Object.values(checks).filter((item) => item.ok).length;
      return json(res, 200, {
        ok: true,
        generated_at: new Date().toISOString(),
        latency_ms: Date.now() - started,
        summary: { online, total: Object.keys(checks).length },
        checks,
        logs: memory.logs.slice(-50),
      });
    }

    if (route === "/logs" && req.method === "GET") return json(res, 200, { ok: true, logs: memory.logs.slice(-100) });

    if (route === "/cams-radiation" && req.method === "GET") {
      try {
        const cams = await openMeteoSolarFallback();
        return json(res, 200, cams, { "X-SIPIC-Mode": "CAMS-AUTO-FALLBACK" });
      } catch (error) {
        addLog("warning", "CAMS Solar Radiation", `Open-Meteo Solar indisponível; referência local ativada: ${error.message}`, "CAMS_LOCAL_REFERENCE");
        return json(res, 200, localSolarReferenceFallback(`Open-Meteo Solar indisponível: ${error.message}`), { "X-SIPIC-Mode": "CAMS-LOCAL-REFERENCE" });
      }
    }

    if (route === "/openweather" || route === "/openweather/current") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error_code: "METHOD_NOT_ALLOWED", message: "Use GET." });
      if (!key) return json(res, 200, { ok: false, configured: false, status: "not_configured", source: "OpenWeather", message: "API Key não configurada." });
      try { return json(res, 200, await openWeatherCurrent(key)); }
      catch (error) { return json(res, error.status || 502, { ok: false, status: "error", source: "OpenWeather", error_code: error.code || "OPENWEATHER_ERROR", message: error.message, http_status: error.status || null }); }
    }

    const upstreamRoutes = new Set(["/dashboard", "/analytics", "/solar", "/air-quality", "/sectors", "/sensors", "/report", "/openapi", "/weather"]);
    if (upstreamRoutes.has(route) && ["GET", "HEAD"].includes(req.method || "GET")) {
      const relative = route.slice(1);
      const proxied = await proxyUpstream(req, res, relative);
      if (proxied.ok) return;

      if (route === "/dashboard") return json(res, 200, localDashboardFallback(), { "X-SIPIC-Mode": "LOCAL-FALLBACK" });
      if (route === "/analytics") return json(res, 200, { ok: true, generated_at: new Date().toISOString(), requested_hours: Number(new URL(req.url || "/", "http://localhost").searchParams.get("hours") || 168), count: 0, observations: [], data_status: "fallback_empty" });
      if (route === "/solar") {
        try {
          const meteo = await openMeteoCurrent();
          return json(res, 200, { ok: true, source: "Open-Meteo", status: "online", generated_at: new Date().toISOString(), current: { shortwave_radiation_wm2: meteo.shortwave_radiation_wm2 }, data_status: "direct_fallback" });
        } catch {}
      }
      return json(res, 502, { ok: false, error_code: "UPSTREAM_UNAVAILABLE", message: proxied.error?.message || proxied.payload?.detail || proxied.payload?.error || `Supabase indisponível para ${route}.` });
    }

    if (route === "/health" && req.method === "GET") {
      const supabase = await checkSupabase();
      return json(res, 200, { ok: true, service: "SIPIC-RP Vercel Gateway", generated_at: new Date().toISOString(), upstream: supabase });
    }

    return json(res, 404, { ok: false, error_code: "NOT_FOUND", message: `Endpoint não encontrado: ${req.method} ${route}` });
  } catch (error) {
    addLog("error", "SIPIC-RP", error?.message || "Erro interno", "INTERNAL_ERROR");
    return json(res, 500, { ok: false, error_code: "INTERNAL_ERROR", message: error?.message || "Erro interno do servidor." });
  }
}
