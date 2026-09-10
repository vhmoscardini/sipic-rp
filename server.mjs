import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import tls from "node:tls";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

const MIME = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
});

function loadEnv(content) {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

try {
  loadEnv(await fs.readFile(path.join(ROOT, ".env"), "utf8"));
} catch {
  // O arquivo .env é opcional.
}

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8080);
const REQUEST_TIMEOUT_MS = Math.max(3_000, Number(process.env.REQUEST_TIMEOUT_MS || 25_000));
const UPSTREAM_API = String(
  process.env.SIPIC_API_BASE_URL ||
  "https://pzwtoksbbfvgsnwunzri.supabase.co/functions/v1/sipic-api",
).replace(/\/$/, "");

const apiCache = new Map();
const runtimeLogs = [];
function logRuntime(level, source, message, details = {}) {
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: new Date().toISOString(), level, source, message, ...details };
  runtimeLogs.push(entry);
  if (runtimeLogs.length > 300) runtimeLogs.splice(0, runtimeLogs.length - 300);
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  fn(`[SIPIC][${source}] ${message}`);
}
const CACHE_TTL_MS = Math.max(60_000, Number(process.env.API_CACHE_TTL_MS || 10 * 60_000));
const IS_VERCEL = String(process.env.VERCEL || "").toLowerCase() === "1" || Boolean(process.env.VERCEL_ENV);

// Fontes públicas diretas: usadas como rota principal de contingência quando a
// Edge Function não estiver disponível. Open-Meteo e CAMS são acessados sem
// chave e o gateway evita problemas de CORS no navegador.
const RIBEIRAO_PRETO = Object.freeze({ latitude: -21.1775, longitude: -47.8103, timezone: "America/Sao_Paulo" });
const OPEN_METEO_WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const DIRECT_SOURCE_TIMEOUT_MS = Math.max(5_000, Number(process.env.DIRECT_SOURCE_TIMEOUT_MS || 15_000));

const OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
let runtimeOpenWeatherApiKey = String(process.env.OPENWEATHER_API_KEY || "").trim();

const METEOMATICS_URL = "https://api.meteomatics.com";

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseMeteomatics(payload) {
  const out = {};
  for (const item of payload?.data || []) {
    const parameter = item?.parameter;
    const value = item?.coordinates?.[0]?.dates?.[0]?.value;
    if (parameter) out[parameter] = finiteNumber(value);
  }
  return out;
}

async function fetchOpenMeteoCurrent() {
  const params = new URLSearchParams({
    latitude: String(RIBEIRAO_PRETO.latitude), longitude: String(RIBEIRAO_PRETO.longitude),
    timezone: RIBEIRAO_PRETO.timezone,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,pressure_msl,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,weather_code",
  });
  const payload = await fetchJsonWithTimeout(`${OPEN_METEO_WEATHER_URL}?${params}`);
  const c = payload?.current || {};
  return {
    configured: true, status: "online", source: "Open-Meteo",
    observed_at: c.time ? new Date(c.time).toISOString() : null,
    temperature_c: finiteNumber(c.temperature_2m),
    apparent_temperature_c: finiteNumber(c.apparent_temperature),
    humidity_pct: finiteNumber(c.relative_humidity_2m),
    pressure_hpa: finiteNumber(c.pressure_msl),
    wind_speed_ms: finiteNumber(c.wind_speed_10m) !== null ? finiteNumber(c.wind_speed_10m) / 3.6 : null,
    wind_direction_deg: finiteNumber(c.wind_direction_10m),
    precipitation_1h_mm: finiteNumber(c.precipitation),
    cloud_cover_pct: finiteNumber(c.cloud_cover),
    weather_code: finiteNumber(c.weather_code),
  };
}

async function weatherComparison() {
  const started = Date.now();
  const results = await Promise.allSettled([fetchOpenMeteoCurrent(), fetchOpenWeatherCurrent()]);
  const openMeteo = results[0].status === "fulfilled" ? results[0].value : { status: "error", source: "Open-Meteo", message: results[0].reason?.message || "Falha na consulta." };
  const openWeather = results[1].status === "fulfilled" ? results[1].value : { status: "error", source: "OpenWeather", message: results[1].reason?.message || "Falha na consulta." };
  const metrics = [
    ["temperature_c", "Temperatura", "°C"],
    ["apparent_temperature_c", "Sensação térmica", "°C"],
    ["humidity_pct", "Umidade relativa", "%"],
    ["pressure_hpa", "Pressão atmosférica", "hPa"],
    ["wind_speed_ms", "Velocidade do vento", "m/s"],
    ["precipitation_1h_mm", "Precipitação", "mm"],
    ["cloud_cover_pct", "Nebulosidade", "%"],
  ];
  const comparison = Object.fromEntries(metrics.map(([key, label, unit]) => {
    const a = finiteNumber(openMeteo[key]);
    const b = finiteNumber(openWeather[key]);
    const difference = a !== null && b !== null ? Math.abs(a - b) : null;
    const mean = a !== null && b !== null ? (Math.abs(a) + Math.abs(b)) / 2 : null;
    const relative_difference_pct = difference !== null && mean > 0 ? (difference / mean) * 100 : null;
    return [key, { label, unit, open_meteo: a, openweather: b, absolute_difference: difference, relative_difference_pct: relative_difference_pct !== null ? Number(relative_difference_pct.toFixed(2)) : null }];
  }));
  const available = Object.values(comparison).filter((m) => m.open_meteo !== null && m.openweather !== null);
  const meanRelativeDifferencePct = available.length ? available.reduce((sum, m) => sum + (m.relative_difference_pct || 0), 0) / available.length : null;
  return {
    ok: openMeteo.status === "online" || openWeather.status === "online",
    generated_at: new Date().toISOString(), latency_ms: Date.now() - started,
    methodology: "Comparação paralela de duas fontes meteorológicas independentes para o mesmo ponto geográfico. Diferenças não são tratadas como erro automaticamente, pois podem decorrer de modelos, fontes e horários de atualização distintos.",
    location: RIBEIRAO_PRETO,
    sources: { open_meteo: openMeteo, openweather: openWeather },
    comparison,
    summary: { comparable_metrics: available.length, mean_relative_difference_pct: meanRelativeDifferencePct !== null ? Number(meanRelativeDifferencePct.toFixed(2)) : null, interpretation: meanRelativeDifferencePct === null ? "Sem métricas suficientes para comparação." : meanRelativeDifferencePct <= 5 ? "Alta concordância entre as fontes para as variáveis comparáveis." : meanRelativeDifferencePct <= 15 ? "Concordância moderada; investigar diferenças de modelo e horário." : "Diferença elevada; verificar timestamp, configuração e características dos modelos." },
  };
}

async function resolveOpenWeatherAddresses(hostname) {
  try {
    const addresses = await dns.promises.resolve4(hostname);
    if (!addresses.length) throw new Error(`DNS não retornou endereços IPv4 para ${hostname}.`);
    return [...new Set(addresses)];
  } catch (error) {
    const code = error?.code || "DNS_ERROR";
    throw Object.assign(new Error(`DNS IPv4 não resolveu ${hostname}: ${code} ${error?.message || "falha na resolução"}`), {
      phase: "dns",
      error_code: code,
      hostname,
    });
  }
}

function probeTcp(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = net.connect({ host, port, family: 4 });
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn(value);
    };
    socket.setTimeout(timeoutMs, () => finish(reject, Object.assign(new Error(`Timeout TCP ao conectar ${host}:${port} após ${timeoutMs} ms.`), { phase: "tcp", host, port, latency_ms: Date.now() - started })));
    socket.once("connect", () => finish(resolve, { host, port, latency_ms: Date.now() - started }));
    socket.once("error", (error) => finish(reject, Object.assign(new Error(`Falha TCP em ${host}:${port}: ${error.code || error.message}`), { phase: "tcp", error_code: error.code || "TCP_ERROR", host, port, latency_ms: Date.now() - started })));
  });
}

function probeTls(host, port, servername, timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = tls.connect({ host, port, family: 4, servername, rejectUnauthorized: true });
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn(value);
    };
    socket.setTimeout(timeoutMs, () => finish(reject, Object.assign(new Error(`Timeout TLS em ${servername} após ${timeoutMs} ms.`), { phase: "tls", host, servername, latency_ms: Date.now() - started })));
    socket.once("secureConnect", () => finish(resolve, { host, servername, latency_ms: Date.now() - started, protocol: socket.getProtocol() }));
    socket.once("error", (error) => finish(reject, Object.assign(new Error(`Falha TLS em ${servername}: ${error.code || error.message}`), { phase: "tls", error_code: error.code || "TLS_ERROR", host, servername, latency_ms: Date.now() - started })));
  });
}

function requestOpenWeather(url) {
  const parsed = new URL(url);
  const timeoutMs = Math.max(5_000, DIRECT_SOURCE_TIMEOUT_MS);
  return (async () => {
    const started = Date.now();
    const addresses = await resolveOpenWeatherAddresses(parsed.hostname);
    const attempts = [];
    let lastError = null;

    for (const address of addresses) {
      const attempt = { address, tcp: null, tls: null, http: null };
      try {
        attempt.tcp = await probeTcp(address, Number(parsed.port || 443), Math.min(timeoutMs, 5_000));
        attempt.tls = await probeTls(address, Number(parsed.port || 443), parsed.hostname, Math.min(timeoutMs, 8_000));
        const response = await new Promise((resolve, reject) => {
          const req = https.request({
            hostname: address,
            port: Number(parsed.port || 443),
            path: `${parsed.pathname}${parsed.search}`,
            method: "GET",
            family: 4,
            servername: parsed.hostname,
            headers: { Accept: "application/json", "User-Agent": "SIPIC-RP/1.1" },
          }, (res) => {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", chunk => { body += chunk; });
            res.on("end", () => resolve({ status: res.statusCode || 0, body, latency_ms: Date.now() - started }));
          });
          req.setTimeout(timeoutMs, () => req.destroy(Object.assign(new Error(`Timeout HTTP após ${timeoutMs} ms.`), { phase: "http", error_code: "HTTP_TIMEOUT" })));
          req.once("error", reject);
          req.end();
        });
        attempt.http = { status: response.status, latency_ms: response.latency_ms };
        attempts.push(attempt);
        return { ...response, diagnostics: { hostname: parsed.hostname, addresses, selected_address: address, attempts, total_latency_ms: Date.now() - started } };
      } catch (error) {
        lastError = error;
        attempt.error = { phase: error?.phase || "connection", code: error?.error_code || error?.code || "CONNECTION_ERROR", message: error?.message || String(error), latency_ms: error?.latency_ms ?? null };
        attempts.push(attempt);
      }
    }

    const phase = lastError?.phase || "connection";
    const message = lastError?.message || `Não foi possível conectar à ${parsed.hostname}.`;
    throw Object.assign(new Error(message), {
      phase,
      error_code: lastError?.error_code || lastError?.code || "CONNECTION_ERROR",
      diagnostics: { hostname: parsed.hostname, addresses, attempts, total_latency_ms: Date.now() - started },
    });
  })();
}

async function diagnoseOpenWeatherNetwork() {
  const hostname = new URL(OPENWEATHER_URL).hostname;
  const started = Date.now();
  const out = { ok: false, hostname, api_key_configured: Boolean(runtimeOpenWeatherApiKey), latency_ms: 0, phases: {} };
  try {
    const addresses = await resolveOpenWeatherAddresses(hostname);
    out.phases.dns = { ok: true, addresses };
    const tcpResults = [];
    for (const address of addresses) {
      try { tcpResults.push({ address, ok: true, ...(await probeTcp(address, 443, 5_000)) }); }
      catch (error) { tcpResults.push({ address, ok: false, message: error.message, error_code: error.error_code || error.code }); }
    }
    out.phases.tcp = { ok: tcpResults.some(x => x.ok), results: tcpResults };
    const tlsResults = [];
    for (const address of addresses.filter((a) => tcpResults.some((x) => x.address === a && x.ok))) {
      try { tlsResults.push({ address, ok: true, ...(await probeTls(address, 443, hostname, 8_000)) }); }
      catch (error) { tlsResults.push({ address, ok: false, message: error.message, error_code: error.error_code || error.code }); }
    }
    out.phases.tls = { ok: tlsResults.some(x => x.ok), results: tlsResults };
    if (runtimeOpenWeatherApiKey) {
      const result = await fetchOpenWeatherCurrent();
      out.phases.http = { ok: result.status === "online", status: result.status, http_status: result.http_status || null, message: result.message || null };
      out.ok = result.status === "online";
    } else {
      out.phases.http = { ok: false, skipped: true, message: "API Key não configurada." };
    }
  } catch (error) {
    out.error = { phase: error?.phase || "unknown", code: error?.error_code || error?.code || "DIAGNOSTIC_ERROR", message: error?.message || String(error), details: error?.diagnostics || null };
  }
  out.latency_ms = Date.now() - started;
  return out;
}

async function fetchOpenWeatherCurrent() {
  const key = runtimeOpenWeatherApiKey;
  if (!key) return { configured: false, status: "not_configured", message: "OPENWEATHER_API_KEY não configurada. Informe a chave no painel Dados e fontes." };
  const params = new URLSearchParams({
    lat: String(RIBEIRAO_PRETO.latitude), lon: String(RIBEIRAO_PRETO.longitude),
    appid: key, units: "metric", lang: "pt_br",
  });
  try {
    const response = await requestOpenWeather(`${OPENWEATHER_URL}?${params}`);
    let payload = null;
    try { payload = response.body ? JSON.parse(response.body) : null; } catch {}
    const status = response.status;
    if (status < 200 || status >= 300) {
      const apiCode = payload?.cod || status;
      const message = payload?.message || `OpenWeather respondeu HTTP ${status}.`;
      const errorCode = status === 401 ? "invalid_or_inactive_api_key" : status === 429 ? "rate_limit" : status === 403 ? "forbidden" : `http_${status}`;
      logRuntime("error", "OpenWeather", message, { http_status: status, error_code: errorCode });
      return { configured: true, status: "error", source: "OpenWeather", http_status: status, error_code: errorCode, api_code: apiCode, message, latency_ms: response.latency_ms };
    }
    const rain = finiteNumber(payload?.rain?.["1h"]);
    const snow = finiteNumber(payload?.snow?.["1h"]);
    return {
      configured: true, status: "online", source: "OpenWeather", http_status: status, latency_ms: response.latency_ms,
      observed_at: payload?.dt ? new Date(Number(payload.dt) * 1000).toISOString() : null,
      temperature_c: finiteNumber(payload?.main?.temp), apparent_temperature_c: finiteNumber(payload?.main?.feels_like),
      humidity_pct: finiteNumber(payload?.main?.humidity), pressure_hpa: finiteNumber(payload?.main?.pressure),
      wind_speed_ms: finiteNumber(payload?.wind?.speed), wind_direction_deg: finiteNumber(payload?.wind?.deg),
      wind_gust_ms: finiteNumber(payload?.wind?.gust), cloud_cover_pct: finiteNumber(payload?.clouds?.all),
      precipitation_1h_mm: rain ?? snow, condition: payload?.weather?.[0]?.description || payload?.weather?.[0]?.main || null,
      weather_code: finiteNumber(payload?.weather?.[0]?.id), icon: payload?.weather?.[0]?.icon || null,
    };
  } catch (error) {
    const message = error?.message || String(error);
    const details = { error_code: error?.error_code || "connection_error", phase: error?.phase || "connection", diagnostics: error?.diagnostics || null };
    logRuntime("error", "OpenWeather", message, details);
    const wrapped = new Error(`Não foi possível conectar à OpenWeather: ${message}`);
    Object.assign(wrapped, details);
    throw wrapped;
  }
}

async function fetchMeteomaticsCurrent() {
  const user = String(process.env.METEOMATICS_USERNAME || "").trim();
  const password = String(process.env.METEOMATICS_PASSWORD || "").trim();
  if (!user || !password) return { configured: false, status: "configured", message: "METEOMATICS_USERNAME/PASSWORD não configurados." };
  const now = new Date();
  const start = new Date(Math.floor(now.getTime() / 3600000) * 3600000);
  const end = new Date(start.getTime() + 3600000);
  const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const range = `${iso(start)}--${iso(end)}:PT1H`;
  const parameters = "t_2m:C,relative_humidity_2m:p,wind_speed_10m:ms,wind_dir_10m:d,wind_gusts_10m_1h:ms,precip_1h:mm,global_rad:W";
  const url = `${METEOMATICS_URL}/${range}/${parameters}/${RIBEIRAO_PRETO.latitude},${RIBEIRAO_PRETO.longitude}/json?source=mix-obs&temporal_interpolation=none&on_invalid=fill_with_invalid`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECT_SOURCE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}` }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const values = parseMeteomatics(payload);
    return {
      configured: true, status: "online", source: "Meteomatics",
      observed_at: payload?.data?.[0]?.coordinates?.[0]?.dates?.[0]?.date || null,
      temperature_c: values["t_2m:C"], humidity_pct: values["relative_humidity_2m:p"],
      wind_speed_ms: values["wind_speed_10m:ms"], wind_direction_deg: values["wind_dir_10m:d"],
      wind_gust_ms: values["wind_gusts_10m_1h:ms"], precipitation_1h_mm: values["precip_1h:mm"],
      global_radiation_wm2: values["global_rad:W"],
      interpolation: "none", source_mode: "mix-obs (estação mais próxima)",
    };
  } finally { clearTimeout(timer); }
}

async function directWeatherSources() {
  const results = await Promise.allSettled([fetchOpenWeatherCurrent(), fetchMeteomaticsCurrent()]);
  const openWeather = results[0].status === "fulfilled" ? results[0].value : { configured: true, status: "error", message: String(results[0].reason?.message || results[0].reason) };
  const meteomatics = results[1].status === "fulfilled" ? results[1].value : { configured: true, status: "error", message: String(results[1].reason?.message || results[1].reason) };
  return { openWeather, meteomatics };
}


function localCamsSolarReference(reason = "Fonte solar externa indisponível") {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: RIBEIRAO_PRETO.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const rows = Array.from({ length: 24 }, (_, hour) => {
    const solar = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
    const ghi = solar * 820;
    const direct = ghi * (0.68 + 0.12 * solar);
    const diffuse = Math.max(0, ghi - direct);
    const dni = solar > 0.08 ? Math.min(980, direct / Math.max(0.18, solar)) : 0;
    return {
      timestamp: `${parts}T${String(hour).padStart(2, "0")}:00`,
      ghi_wm2: Math.round(ghi), bhi_wm2: Math.round(direct), dhi_wm2: Math.round(diffuse), dni_wm2: Math.round(dni),
      reliability_pct: 45,
    };
  });
  return {
    ok: true, configured: Boolean(String(process.env.CAMS_API_KEY || "").trim()), status: "degraded",
    source: "SIPIC-RP Solar Reference", requested_source: "CAMS Solar Radiation Time-Series",
    dataset: "sipic-local-solar-reference", date: parts, location: { latitude: RIBEIRAO_PRETO.latitude, longitude: RIBEIRAO_PRETO.longitude },
    temporal_resolution: "1hour", time_reference: RIBEIRAO_PRETO.timezone, rows,
    fallback_source: "SIPIC-RP calculated reference", data_class: "calculated_reference",
    message: `${reason}. Referência solar calculada ativada para manter o painel operacional; não representa medição CAMS.`,
    generated_at: new Date().toISOString(),
  };
}

async function camsFallbackFromOpenMeteo(reason = "CAMS indisponível") {
  try {
    const solar = await directSolarData();
    const rows = Array.isArray(solar.timeline) ? solar.timeline.map((row) => ({
      timestamp: row.time,
      ghi_wm2: Number.isFinite(Number(row.shortwave_radiation_wm2)) ? Number(row.shortwave_radiation_wm2) : null,
      bhi_wm2: Number.isFinite(Number(row.direct_radiation_wm2)) ? Number(row.direct_radiation_wm2) : null,
      dhi_wm2: Number.isFinite(Number(row.diffuse_radiation_wm2)) ? Number(row.diffuse_radiation_wm2) : null,
      dni_wm2: Number.isFinite(Number(row.direct_normal_irradiance_wm2)) ? Number(row.direct_normal_irradiance_wm2) : null,
      reliability_pct: null,
    })) : [];
    return {
      ok: true, configured: Boolean(String(process.env.CAMS_API_KEY || "").trim()), status: "fallback",
      source: "Open-Meteo Solar Radiation", requested_source: "CAMS Solar Radiation Time-Series",
      dataset: "open-meteo-radiation-fallback",
      date: String(solar.earth?.time || rows.at(-1)?.timestamp || new Date().toISOString()).slice(0, 10),
      location: { latitude: RIBEIRAO_PRETO.latitude, longitude: RIBEIRAO_PRETO.longitude },
      temporal_resolution: "1hour", time_reference: RIBEIRAO_PRETO.timezone, rows, fallback_source: "Open-Meteo",
      data_class: "live_modeled_fallback", message: `${reason}. Contingência Open-Meteo Solar ativa automaticamente.`,
      generated_at: new Date().toISOString(),
    };
  } catch (error) {
    return localCamsSolarReference(`${reason}; Open-Meteo Solar também indisponível: ${error?.message || error}`);
  }
}

async function fetchCamsRadiation() {
  const key = String(process.env.CAMS_API_KEY || "").trim();
  if (!key) return await camsFallbackFromOpenMeteo("CAMS_API_KEY não configurada");
  const cacheKeyName = "cams-radiation-latest-day";
  const cached = apiCache.get(cacheKeyName);
  if (cached && Date.now() - cached.savedAt < 6 * 60 * 60 * 1000) return cached.payload;
  const python = process.platform === "win32" ? "python" : "python3";
  try {
    const { stdout } = await execFileAsync(python, [path.join(ROOT, "cams_radiation.py")], {
      env: { ...process.env, CAMS_API_KEY: key, SIPIC_RADIATION_LAT: String(RIBEIRAO_PRETO.latitude), SIPIC_RADIATION_LON: String(RIBEIRAO_PRETO.longitude) },
      timeout: Math.max(DIRECT_SOURCE_TIMEOUT_MS * 8, 60_000),
      maxBuffer: 4 * 1024 * 1024,
    });
    const payload = JSON.parse(stdout.trim());
    if (!payload?.ok) throw new Error(payload?.message || "CAMS retornou uma resposta inválida.");
    payload.status = "online";
    payload.configured = true;
    apiCache.set(cacheKeyName, { payload, savedAt: Date.now() });
    return payload;
  } catch (error) {
    const message = error?.stderr?.trim() || error?.message || String(error);
    logRuntime("warning", "CAMS", `Consulta CAMS falhou; usando Open-Meteo Solar: ${message}`);
    return await camsFallbackFromOpenMeteo(`CAMS temporariamente indisponível: ${message}`);
  }
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECT_SOURCE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

function classifyAqi(aqi) {
  const value = Number(aqi);
  if (!Number.isFinite(value)) return { label: "Indisponível" };
  if (value <= 50) return { label: "Boa" };
  if (value <= 100) return { label: "Moderada" };
  if (value <= 150) return { label: "Sensível" };
  return { label: "Atenção" };
}

async function directScientificDashboard() {
  const weatherParams = new URLSearchParams({
    latitude: String(RIBEIRAO_PRETO.latitude), longitude: String(RIBEIRAO_PRETO.longitude),
    timezone: RIBEIRAO_PRETO.timezone,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code,shortwave_radiation,direct_radiation,diffuse_radiation,direct_normal_irradiance,terrestrial_radiation",
    hourly: "temperature_2m,apparent_temperature,relative_humidity_2m,shortwave_radiation,direct_radiation,diffuse_radiation,direct_normal_irradiance,terrestrial_radiation",
    forecast_days: "3",
  });
  const airParams = new URLSearchParams({
    latitude: String(RIBEIRAO_PRETO.latitude), longitude: String(RIBEIRAO_PRETO.longitude),
    timezone: RIBEIRAO_PRETO.timezone,
    current: "pm2_5,us_aqi",
  });
  const [weatherResult, airResult, sourceResult] = await Promise.allSettled([
    fetchJsonWithTimeout(`${OPEN_METEO_WEATHER_URL}?${weatherParams}`),
    fetchJsonWithTimeout(`${OPEN_METEO_AIR_URL}?${airParams}`),
    directWeatherSources(),
  ]);
  if (weatherResult.status !== "fulfilled" && airResult.status !== "fulfilled") throw new Error("As fontes meteorológica e de qualidade do ar não responderam.");

  const base = localReferencePayload("dashboard");
  const now = new Date();
  const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
  const air = airResult.status === "fulfilled" ? airResult.value : null;
  const external = sourceResult.status === "fulfilled" ? sourceResult.value : { openWeather: { status: "error" }, meteomatics: { status: "error" } };
  const current = weather?.current || {};
  const obs = external.meteomatics?.status === "online" ? external.meteomatics : external.openWeather?.status === "online" ? external.openWeather : null;
  const airCurrent = air?.current || {};
  const realAir = Number(current.temperature_2m);
  const realHumidity = Number(current.relative_humidity_2m);
  const apparent = Number(current.apparent_temperature);
  const windKmh = Number(current.wind_speed_10m);
  const shortwave = Number(current.shortwave_radiation);
  const directRadiation = Number(current.direct_radiation);
  const diffuseRadiation = Number(current.diffuse_radiation);
  const dni = Number(current.direct_normal_irradiance);
  const terrestrial = Number(current.terrestrial_radiation);
  const observedTemp = finiteNumber(obs?.temperature_c);
  const observedHumidity = finiteNumber(obs?.humidity_pct);
  const observedWind = finiteNumber(obs?.wind_speed_ms);
  const observedPrecip = finiteNumber(obs?.precipitation_1h_mm);

  if (Number.isFinite(realAir)) {
    const surfaceDelta = Math.max(2.0, Number(base.current.surface_temperature_c) - Number(base.current.air_temperature_c));
    base.current.air_temperature_c = realAir;
    base.current.surface_temperature_c = Number((realAir + surfaceDelta).toFixed(1));
    base.current.apparent_temperature_c = Number.isFinite(apparent) ? apparent : Number((realAir + 1.2).toFixed(1));
    base.current.shortwave_radiation_wm2 = Number.isFinite(shortwave) ? shortwave : null;
    base.current.direct_radiation_wm2 = Number.isFinite(directRadiation) ? directRadiation : null;
    base.current.diffuse_radiation_wm2 = Number.isFinite(diffuseRadiation) ? diffuseRadiation : null;
    base.current.direct_normal_irradiance_wm2 = Number.isFinite(dni) ? dni : null;
    base.current.terrestrial_radiation_wm2 = Number.isFinite(terrestrial) ? terrestrial : null;
    if (Number.isFinite(realHumidity)) base.current.relative_humidity_pct = Math.round(realHumidity);
    if (Number.isFinite(windKmh)) base.current.wind_speed_ms = Number((windKmh / 3.6).toFixed(1));
    base.sectors = base.sectors.map((sector, index) => {
      const offset = (index - 3.5) * .18;
      return { ...sector, air_temperature_c: Number((realAir + offset).toFixed(1)), surface_temperature_c: Number((realAir + surfaceDelta + offset + sector.urban_heat_island_c * .32).toFixed(1)), relative_humidity_pct: Number.isFinite(realHumidity) ? Math.round(realHumidity) : sector.relative_humidity_pct };
    });
  }
  if (Number.isFinite(observedTemp)) {
    base.current.air_temperature_c = observedTemp;
    base.current.apparent_temperature_c = finiteNumber(obs?.apparent_temperature_c) ?? base.current.apparent_temperature_c;
  }
  if (Number.isFinite(observedHumidity)) base.current.relative_humidity_pct = Math.round(observedHumidity);
  if (Number.isFinite(observedWind)) base.current.wind_speed_ms = Number(observedWind.toFixed(1));
  base.current.precipitation_1h_mm = Number.isFinite(observedPrecip) ? Number(observedPrecip.toFixed(2)) : null;
  base.current.weather_condition = obs?.condition || null;
  base.current.wind_direction_deg = finiteNumber(obs?.wind_direction_deg);
  base.current.wind_gust_ms = finiteNumber(obs?.wind_gust_ms);
  base.weather_observations = { openweather: external.openWeather, meteomatics: external.meteomatics, preferred: obs?.source || "Open-Meteo" };
  const hourly = weather?.hourly;
  if (hourly?.time?.length) {
    const timeline = hourly.time.slice(0, 48).map((time, index) => {
      const t = Number(hourly.temperature_2m?.[index]);
      const a = Number(hourly.apparent_temperature?.[index]);
      const sw = Number(hourly.shortwave_radiation?.[index]);
      const direct = Number(hourly.direct_radiation?.[index]);
      const diffuse = Number(hourly.diffuse_radiation?.[index]);
      const dniH = Number(hourly.direct_normal_irradiance?.[index]);
      const terr = Number(hourly.terrestrial_radiation?.[index]);
      const valid = Number.isFinite(t) ? t : base.forecast.city_timeline[index]?.air_temperature_c;
      return { ...base.forecast.city_timeline[index], timestamp: new Date(`${time}:00`).toISOString(), air_temperature_c: valid, apparent_temperature_c: Number.isFinite(a) ? a : valid, surface_temperature_c: Number((valid + 4.0).toFixed(1)), shortwave_radiation_wm2: Number.isFinite(sw) ? sw : null, direct_radiation_wm2: Number.isFinite(direct) ? direct : null, diffuse_radiation_wm2: Number.isFinite(diffuse) ? diffuse : null, direct_normal_irradiance_wm2: Number.isFinite(dniH) ? dniH : null, terrestrial_radiation_wm2: Number.isFinite(terr) ? terr : null };
    });
    base.forecast.city_timeline = timeline;
  }
  if (Number.isFinite(Number(airCurrent.pm2_5)) || Number.isFinite(Number(airCurrent.us_aqi))) {
    const aqi = Number(airCurrent.us_aqi);
    base.air_quality = { pm25_ugm3: Number.isFinite(Number(airCurrent.pm2_5)) ? Number(airCurrent.pm2_5) : null, us_aqi: Number.isFinite(aqi) ? Math.round(aqi) : null, aqi_classification: classifyAqi(aqi) };
  }
  base.ok = true;
  base.data_status = "live_direct_sources";
  base.generated_at = now.toISOString();
  base.sources = [
    { id: "open_meteo_weather", name: "Open-Meteo Forecast API", status: weather ? "online" : "degraded", detail: "Modelo meteorológico e radiação" },
    { id: "openweather", name: "OpenWeather Current Weather", status: external.openWeather.status, detail: external.openWeather.status === "online" ? "Condições atuais, vento e chuva" : external.openWeather.message || "API key não configurada" },
    { id: "meteomatics", name: "Meteomatics · mix-obs", status: external.meteomatics.status, detail: external.meteomatics.status === "online" ? "Observação de estação mais próxima" : external.meteomatics.message || "Credenciais não configuradas" },
    { id: "open_meteo_air", name: "CAMS via Open-Meteo", status: air ? "online" : "degraded", detail: air ? "Qualidade do ar atualizada" : "Usando referência local" },
    { id: "supabase", name: "Modelo local", status: "online", detail: "Cálculo e apresentação local" },
  ];
  base.scientific_disclaimer = weather || air ? "Dados meteorológicos e de qualidade do ar obtidos diretamente de fontes públicas; indicadores urbanos são calculados pelo modelo do SIPIC-RP." : base.scientific_disclaimer;
  return base;
}

async function directSolarData() {
  const params = new URLSearchParams({
    latitude: String(RIBEIRAO_PRETO.latitude),
    longitude: String(RIBEIRAO_PRETO.longitude),
    timezone: RIBEIRAO_PRETO.timezone,
    current: "shortwave_radiation,direct_radiation,diffuse_radiation,direct_normal_irradiance,terrestrial_radiation",
    hourly: "shortwave_radiation,direct_radiation,diffuse_radiation,direct_normal_irradiance,terrestrial_radiation",
    forecast_days: "2",
  });
  const weather = await fetchJsonWithTimeout(`${OPEN_METEO_WEATHER_URL}?${params}`);
  const c = weather.current || {};
  const hourly = weather.hourly || {};
  const earth = {
    shortwave_radiation_wm2: Number.isFinite(Number(c.shortwave_radiation)) ? Number(c.shortwave_radiation) : null,
    direct_radiation_wm2: Number.isFinite(Number(c.direct_radiation)) ? Number(c.direct_radiation) : null,
    diffuse_radiation_wm2: Number.isFinite(Number(c.diffuse_radiation)) ? Number(c.diffuse_radiation) : null,
    direct_normal_irradiance_wm2: Number.isFinite(Number(c.direct_normal_irradiance)) ? Number(c.direct_normal_irradiance) : null,
    terrestrial_radiation_wm2: Number.isFinite(Number(c.terrestrial_radiation)) ? Number(c.terrestrial_radiation) : null,
    time: c.time || null,
  };
  const venusDistanceAu = 0.723332;
  const solarConstant = 1367.7;
  const venusIrradiance = solarConstant / (venusDistanceAu * venusDistanceAu);
  const timeline = (hourly.time || []).slice(0, 48).map((time, i) => ({
    time,
    shortwave_radiation_wm2: Number.isFinite(Number(hourly.shortwave_radiation?.[i])) ? Number(hourly.shortwave_radiation[i]) : null,
    direct_radiation_wm2: Number.isFinite(Number(hourly.direct_radiation?.[i])) ? Number(hourly.direct_radiation[i]) : null,
    diffuse_radiation_wm2: Number.isFinite(Number(hourly.diffuse_radiation?.[i])) ? Number(hourly.diffuse_radiation[i]) : null,
    direct_normal_irradiance_wm2: Number.isFinite(Number(hourly.direct_normal_irradiance?.[i])) ? Number(hourly.direct_normal_irradiance[i]) : null,
    terrestrial_radiation_wm2: Number.isFinite(Number(hourly.terrestrial_radiation?.[i])) ? Number(hourly.terrestrial_radiation[i]) : null,
  }));
  return { ok: true, stale: false, source: "Open-Meteo", generated_at: new Date().toISOString(), location: { ...RIBEIRAO_PRETO }, earth, venus: { distance_au: venusDistanceAu, solar_irradiance_wm2: Number(venusIrradiance.toFixed(1)), type: "calculated_from_mean_solar_distance", formula: "1367.7 / r²" }, timeline };
}

async function sendDirectScientificFallback(response, url, reason) {
  const endpoint = url.pathname.replace(/^\/api\/?/, "").split("/")[0];
  if (endpoint !== "dashboard" && endpoint !== "") return false;
  try {
    const payload = await directScientificDashboard();
    payload.fallback_reason = reason;
    sendJson(response, 200, payload, { "X-SIPIC-Mode": "DIRECT-SCIENTIFIC-SOURCES" });
    return true;
  } catch { return false; }
}


// Dados locais de referência: mantêm o painel utilizável quando o serviço remoto
// estiver temporariamente indisponível. Eles são identificados no payload como
// referência local e nunca são apresentados como medição em tempo real.
const LOCAL_SECTORS = [
  ["RP-CENTRO-04", "Centro / Quadrilátero Central", -21.1775, -47.8103, 3.35, .19],
  ["RP-NORTE-02", "Zona Norte / Jardim Paulista", -21.1508, -47.8082, 2.65, .28],
  ["RP-SUL-03", "Zona Sul / Ribeirânia", -21.2074, -47.8048, 2.25, .34],
  ["RP-LESTE-01", "Leste / Campos Elíseos", -21.1742, -47.7828, 2.85, .24],
  ["RP-OESTE-05", "Oeste / Ipiranga", -21.1789, -47.8394, 2.45, .31],
  ["RP-BONFIM-06", "Bonfim Paulista", -21.2470, -47.8030, 1.35, .48],
  ["RP-VILA-07", "Vila do Golf", -21.2215, -47.8185, 1.85, .39],
  ["RP-IND-08", "Distrito Industrial", -21.1650, -47.8540, 3.05, .16],
];

function localReferencePayload(endpoint) {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(now));
  const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const air = 22.8 + daylight * 7.2;
  const surface = air + 2.4 + daylight * 2.1;
  const humidity = Math.round(68 - daylight * 23);
  const sectors = LOCAL_SECTORS.map(([code, name, latitude, longitude, uhi, ndvi], index) => {
    const offset = (index - 3.5) * .18;
    const sectorAir = air + offset;
    const sectorSurface = surface + offset + uhi * .32;
    const score = Math.round(Math.min(96, Math.max(18, 32 + uhi * 13 + daylight * 22 + (0.45 - ndvi) * 18)));
    return {
      code, name, latitude, longitude,
      air_temperature_c: Number(sectorAir.toFixed(1)), surface_temperature_c: Number(sectorSurface.toFixed(1)),
      relative_humidity_pct: humidity, ndvi, urban_heat_island_c: uhi,
      risk_score: score, risk_level: score >= 75 ? "high" : score >= 55 ? "moderate" : "low",
      confidence_pct: 72,
      explanations: [
        { factor: "impermeabilização", contribution: Number((uhi * .42).toFixed(1)) },
        { factor: "vegetação/NDVI", contribution: Number((-(ndvi * .8)).toFixed(1)) },
        { factor: "ventilação", contribution: Number((-.25).toFixed(1)) },
      ],
    };
  });
  const timeline = Array.from({ length: 48 }, (_, i) => {
    const futureHour = (hour + i) % 24;
    const futureDaylight = Math.max(0, Math.sin(((futureHour - 6) / 12) * Math.PI));
    const forecastAir = 22.8 + futureDaylight * 7.2 + Math.sin(i / 8) * .7;
    return {
      timestamp: new Date(now.getTime() + i * 3600000).toISOString(),
      air_temperature_c: Number(forecastAir.toFixed(1)), apparent_temperature_c: Number((forecastAir + 1.2 + futureDaylight * 1.4).toFixed(1)),
      surface_temperature_c: Number((forecastAir + 2.4 + futureDaylight * 2.1).toFixed(1)),
      lower_c: Number((forecastAir - 1.8).toFixed(1)), upper_c: Number((forecastAir + 1.8).toFixed(1)), confidence_pct: 72,
    };
  });
  const sources = [
    { id: "open_meteo_weather", name: "Open-Meteo", status: "reference_only" },
    { id: "open_meteo_air", name: "Qualidade do ar", status: "reference_only" },
    { id: "supabase", name: "Persistência", status: "reference_only" },
  ];
  const stations = sectors.map((sector, index) => ({ code: `VIRTUAL-${String(index + 1).padStart(2, "0")}`, name: sector.name, status: "online", station_type: "virtual_grid", last_seen_at: now.toISOString() }));

  if (endpoint === "health") return { ok: true, service: "SIPIC-RP local reference gateway", api_version: "1.2.0", model_version: "sipic-hybrid-1.1.0", database: { status: "reference_only", sectors: sectors.length, stations: stations.length }, cache: [], generated_at: now.toISOString(), mode: "local_reference" };
  if (endpoint === "solar") return {
    ok: true, stale: true, source: "local_reference", generated_at: now.toISOString(),
    earth: { shortwave_radiation_wm2: null, terrestrial_radiation_wm2: null },
    venus: { distance_au: 0.723, solar_irradiance_wm2: 2610, type: "calculated_reference" },
    message: "Open-Meteo indisponível; sem valor solar terrestre em tempo real."
  };
  if (endpoint === "analytics") return { ok: true, count: 48, observations: timeline.map((row, i) => ({ observed_at: row.timestamp, air_temperature_c: row.air_temperature_c, surface_temperature_c: row.surface_temperature_c, urban_heat_island_c: Number((2.2 + Math.sin(i / 7) * .5).toFixed(1)) })), source: "local_reference" };
  if (endpoint === "dashboard" || endpoint === "") return {
    ok: true, data_status: "local_reference", generated_at: now.toISOString(), model_version: "sipic-hybrid-1.1.0",
    location: { city: "Ribeirão Preto", state: "SP", country: "Brasil", timezone: "America/Sao_Paulo" },
    current: { air_temperature_c: Number(air.toFixed(1)), surface_temperature_c: Number(surface.toFixed(1)), relative_humidity_pct: humidity, wind_speed_ms: 2.4, urban_heat_island_c: 2.7, ndvi: .30, apparent_temperature_c: Number((air + 1.4).toFixed(1)), risk_level: daylight > .72 ? "moderate" : "low", confidence_pct: 72 },
    air_quality: { pm25_ugm3: 12.4, us_aqi: 42, aqi_classification: { label: "Referência local" } },
    sectors, forecast: { horizon_hours: 48, city_timeline: timeline, by_sector: [] },
    network: { total: stations.length, online: stations.length, health_pct: 100, stations }, sources, alerts: [],
    scientific_disclaimer: "Modo de referência local ativo: os valores demonstram o funcionamento do modelo e não substituem observações meteorológicas oficiais.",
  };
  return { ok: true, source: "local_reference", generated_at: now.toISOString() };
}

function sendLocalReference(response, url, reason = "upstream_unavailable") {
  const endpoint = url.pathname.replace(/^\/api\/?/, "").split("/")[0];
  sendJson(response, 200, { ...localReferencePayload(endpoint), fallback_reason: reason }, { "X-SIPIC-Mode": "LOCAL-REFERENCE" });
}

function cacheKey(url) { return `${url.pathname}${url.search}`; }

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(extraHeaders)) response.setHeader(key, value);
  setSecurityHeaders(response);
  response.end(JSON.stringify(payload));
}

function safeStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const requested = decoded === "/" ? "/index.html" : decoded;
  const normalized = path.normalize(requested).replace(/^([/\\])*\.\.([/\\]|$)/g, "");
  const target = path.resolve(ROOT, `.${normalized.startsWith(path.sep) ? normalized : `${path.sep}${normalized}`}`);
  return target.startsWith(ROOT) ? target : null;
}

async function serveStatic(request, response, pathname) {
  let target = safeStaticPath(pathname);
  if (!target) return false;

  try {
    const info = await fs.stat(target);
    if (info.isDirectory()) target = path.join(target, "index.html");
  } catch {
    if (!path.extname(target)) target = `${target}.html`;
  }

  try {
    const data = await fs.readFile(target);
    const extension = path.extname(target).toLowerCase();
    response.statusCode = 200;
    response.setHeader("Content-Type", MIME[extension] || "application/octet-stream");
    response.setHeader("Cache-Control", extension === ".html" || extension === ".js" ? "no-cache" : "public, max-age=300");
    setSecurityHeaders(response);
    if (request.method === "HEAD") response.end();
    else response.end(data);
    return true;
  } catch {
    return false;
  }
}

async function readJsonBody(request, maxBytes = 16 * 1024) {
  return await new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBytes) {
        reject(new Error("Payload excede o limite permitido."));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("JSON inválido.")); }
    });
    request.on("error", reject);
  });
}

function maskApiKey(key) {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}


function getHeader(request, name) {
  const value = request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || "").trim();
}

function loadOpenWeatherKeyFromRequest(request) {
  const headerKey = getHeader(request, "x-sipic-openweather-key");
  if (headerKey && headerKey.length >= 20 && headerKey.length <= 256 && !/[\r\n]/.test(headerKey)) {
    runtimeOpenWeatherApiKey = headerKey;
  }
}

function setOpenWeatherPersistenceCookie(response, key) {
  // In Vercel, the serverless filesystem is ephemeral/read-only. The browser
  // sends the key back through the backend header on protected OpenWeather
  // requests, while local deployments keep the existing .openweather-key file.
  if (!IS_VERCEL) return;
  const value = encodeURIComponent(Buffer.from(String(key || ""), "utf8").toString("base64url"));
  response.setHeader("Set-Cookie", `sipic_ow=${value}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${process.env.VERCEL_ENV ? "; Secure" : ""}`);
}

async function proxyApi(request, response, url) {
  loadOpenWeatherKeyFromRequest(request);
  const relative = url.pathname.replace(/^\/api\/?/, "");

  // Configuração local da OpenWeather pelo painel. A chave fica apenas em
  // memória no processo do servidor e nunca é devolvida ao frontend em texto puro.
  if (relative === "settings/openweather") {
    if (request.method === "GET") {
      sendJson(response, 200, {
        ok: true,
        configured: Boolean(runtimeOpenWeatherApiKey),
        masked_key: maskApiKey(runtimeOpenWeatherApiKey),
        persistence: "arquivo_local_protegido + memoria_do_servidor + localStorage_do_navegador",
      });
      return;
    }
    if (request.method === "DELETE") {
      runtimeOpenWeatherApiKey = "";
      if (!IS_VERCEL) { try { await fs.rm(OPENWEATHER_KEY_FILE, { force: true }); } catch {} }
      if (IS_VERCEL) response.setHeader("Set-Cookie", "sipic_ow=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" + (process.env.VERCEL_ENV ? "; Secure" : ""));
      sendJson(response, 200, { ok: true, configured: false, message: IS_VERCEL ? "Chave removida da sessão do servidor e do navegador." : "Chave removida do servidor local." });
      return;
    }
    if (request.method === "POST") {
      try {
        const body = await readJsonBody(request);
        const apiKey = String(body?.apiKey || "").trim();
        if (!apiKey) {
          runtimeOpenWeatherApiKey = "";
          if (!IS_VERCEL) { try { await fs.rm(OPENWEATHER_KEY_FILE, { force: true }); } catch {} }
          sendJson(response, 200, { ok: true, configured: false, message: "Nenhuma chave informada; OpenWeather desativada." });
          return;
        }
        if (apiKey.length < 20 || apiKey.length > 256 || /[\r\n]/.test(apiKey)) {
          sendJson(response, 400, { ok: false, error: "invalid_api_key_format", message: "Formato de API Key inválido." });
          return;
        }

        // Testa a chave de verdade antes de confirmar a configuração.
        const previous = runtimeOpenWeatherApiKey;
        runtimeOpenWeatherApiKey = apiKey;
        let test;
        try { test = await fetchOpenWeatherCurrent(); }
        catch (error) {
          runtimeOpenWeatherApiKey = apiKey;
          if (!IS_VERCEL) await fs.writeFile(OPENWEATHER_KEY_FILE, apiKey, { encoding: "utf8", mode: 0o600 });
          setOpenWeatherPersistenceCookie(response, apiKey);
          sendJson(response, 200, { ok: true, configured: true, validated: false, verification: "connection_failed", masked_key: maskApiKey(apiKey), source_status: "unreachable", message: `${error.message} A chave foi salva e poderá ser testada novamente pelo console.` });
          return;
        }
        if (test.status !== "online") {
          if (test.error_code === "invalid_or_inactive_api_key" || test.error_code === "forbidden" || test.error_code === "rate_limit") {
            runtimeOpenWeatherApiKey = previous;
            const statusCode = Number(test.http_status) || 502;
            sendJson(response, statusCode === 401 ? 401 : 502, { ok: false, error: test.error_code, message: test.message || "A OpenWeather recusou a requisição.", http_status: statusCode, source: "OpenWeather" });
            return;
          }
          runtimeOpenWeatherApiKey = apiKey;
          if (!IS_VERCEL) await fs.writeFile(OPENWEATHER_KEY_FILE, apiKey, { encoding: "utf8", mode: 0o600 });
          setOpenWeatherPersistenceCookie(response, apiKey);
          sendJson(response, 200, { ok: true, configured: true, validated: false, verification: "api_error", masked_key: maskApiKey(apiKey), source_status: "error", message: test.message || "Chave salva, mas a OpenWeather retornou um erro." });
          return;
        }

        runtimeOpenWeatherApiKey = apiKey;
        if (!IS_VERCEL) await fs.writeFile(OPENWEATHER_KEY_FILE, apiKey, { encoding: "utf8", mode: 0o600 });
        setOpenWeatherPersistenceCookie(response, apiKey);
        sendJson(response, 200, { ok: true, configured: true, validated: true, masked_key: maskApiKey(runtimeOpenWeatherApiKey), source_status: "online", observed_at: test.observed_at, message: "Chave validada com sucesso pela OpenWeather e salva localmente." });
      } catch (error) {
        sendJson(response, 400, { ok: false, error: "invalid_request", message: error.message });
      }
      return;
    }
    sendJson(response, 405, { ok: false, error: "method_not_allowed", message: "Use GET, POST ou DELETE." }, { Allow: "GET, POST, DELETE, OPTIONS" });
    return;
  }

  if (relative === "settings/openweather/test") {
    if (!["GET", "POST"].includes(request.method || "GET")) {
      sendJson(response, 405, { ok: false, error: "method_not_allowed", message: "Use GET ou POST." }, { Allow: "GET, POST, OPTIONS" });
      return;
    }
    try {
      const result = await fetchOpenWeatherCurrent();
      const statusCode = result.status === "online" ? 200 : (Number(result.http_status) || 503);
      sendJson(response, statusCode, {
        ok: result.status === "online",
        source: "OpenWeather",
        configured: Boolean(runtimeOpenWeatherApiKey),
        ...result,
      });
    } catch (error) {
      sendJson(response, 502, { ok: false, source: "OpenWeather", status: "error", error: "connection_error", message: error.message });
    }
    return;
  }

  if (relative === "diagnostics/openweather") {
    if (request.method !== "GET") {
      sendJson(response, 405, { ok: false, error: "method_not_allowed", message: "Use GET." }, { Allow: "GET, OPTIONS" });
      return;
    }
    const result = await diagnoseOpenWeatherNetwork();
    sendJson(response, 200, result);
    return;
  }

  if (relative === "diagnostics") {
    if (request.method !== "GET") {
      sendJson(response, 405, { ok: false, error: "method_not_allowed", message: "Use GET." }, { Allow: "GET, OPTIONS" });
      return;
    }
    const started = Date.now();
    const checks = {};
    const run = async (name, fn) => {
      const t = Date.now();
      try {
        const result = await fn();
        checks[name] = { ok: result?.status === "online" || result?.ok === true || result?.status === "fresh", status: result?.status || "unknown", latency_ms: Date.now() - t, message: result?.message || null, http_status: result?.http_status || null };
      } catch (error) {
        checks[name] = { ok: false, status: "error", latency_ms: Date.now() - t, message: error?.message || String(error) };
        logRuntime("error", name, error?.message || String(error));
      }
    };
    await Promise.all([
      run("Open-Meteo", fetchOpenMeteoCurrent),
      run("OpenWeather", fetchOpenWeatherCurrent),
      run("Meteomatics", fetchMeteomaticsCurrent),
      run("CAMS", fetchCamsRadiation),
      run("Open-Meteo Solar", directSolarData),
      run("Supabase", async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DIRECT_SOURCE_TIMEOUT_MS);
        try {
          const r = await fetch(`${UPSTREAM_API}/health`, { headers: { Accept: "application/json" }, signal: controller.signal });
          const payload = await r.json().catch(() => ({}));
          return { ok: r.ok, status: r.ok ? "online" : "error", http_status: r.status, message: payload?.message || null };
        } finally { clearTimeout(timer); }
      }),
    ]);
    const okCount = Object.values(checks).filter((item) => item.ok).length;
    sendJson(response, 200, { ok: true, generated_at: new Date().toISOString(), latency_ms: Date.now() - started, summary: { online: okCount, total: Object.keys(checks).length }, checks, logs: runtimeLogs.slice(-100) });
    return;
  }

  if (relative === "logs") {
    if (request.method !== "GET") {
      sendJson(response, 405, { ok: false, error: "method_not_allowed", message: "Use GET." }, { Allow: "GET, OPTIONS" });
      return;
    }
    sendJson(response, 200, { ok: true, logs: runtimeLogs.slice(-100) });
    return;
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method || "GET")) {
    sendJson(response, 405, {
      ok: false,
      error: "method_not_allowed",
      message: "A API pública do painel aceita apenas GET, HEAD e OPTIONS.",
    }, { Allow: "GET, HEAD, OPTIONS" });
    return;
  }

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.end();
    return;
  }

  if (relative === "weather-comparison") {
    try {
      const result = await weatherComparison();
      // O endpoint permanece operacional mesmo quando uma fonte externa cai.
      // A indisponibilidade da fonte aparece explicitamente no resultado.
      sendJson(response, 200, { ...result, ok: true, status: result.sources?.open_meteo?.status === "online" && result.sources?.openweather?.status === "online" ? "online" : "degraded" }, { "X-SIPIC-Mode": "WEATHER-COMPARISON" });
    } catch (error) {
      sendJson(response, 503, { ok: false, status: "error", message: error.message, methodology: "Comparação indisponível." }, { "X-SIPIC-Mode": "WEATHER-COMPARISON" });
    }
    return;
  }
  if (relative === "cams-radiation") {
    try {
      const cams = await fetchCamsRadiation();
      sendJson(response, cams.status === "error" ? 502 : 200, cams, { "X-SIPIC-Mode": "CAMS-ISOLATED" });
    } catch (error) {
      sendJson(response, 502, { ok: false, status: "error", message: error.message }, { "X-SIPIC-Mode": "CAMS-ISOLATED" });
    }
    return;
  }
  if (relative === "solar") {
    try {
      const solar = await directSolarData();
      sendJson(response, 200, solar, { "X-SIPIC-Mode": "OPEN-METEO-SOLAR" });
    } catch (error) {
      sendLocalReference(response, url, `open_meteo_solar_${error.message}`);
    }
    return;
  }

  const upstreamUrl = new URL(`${UPSTREAM_API}/${relative}`);
  for (const [key, value] of url.searchParams.entries()) upstreamUrl.searchParams.append(key, value);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const key = cacheKey(url);
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: {
        Accept: request.headers.accept || "application/json",
        "User-Agent": "SIPIC-RP local gateway/1.2",
      },
      signal: controller.signal,
    });

    if (!upstream.ok) {
      if (request.method === "HEAD") { response.statusCode = 200; response.end(); return; }
      if (await sendDirectScientificFallback(response, url, `upstream_http_${upstream.status}`)) return;
      sendLocalReference(response, url, `upstream_http_${upstream.status}`);
      return;
    }

    if (request.method === "HEAD") {
      response.statusCode = upstream.status;
      response.setHeader("X-SIPIC-Upstream", "Supabase Edge Function");
      setSecurityHeaders(response);
      response.end();
      return;
    }

    let body = Buffer.from(await upstream.arrayBuffer());
    let contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";
    // Se a Edge Function respondeu mas marcou Open-Meteo/CAMS como erro, o gateway
    // tenta as fontes públicas diretamente antes de repassar o painel ao navegador.
    if ((relative === "dashboard" || relative === "") && /application\/json/i.test(contentType)) {
      try {
        const payload = JSON.parse(body.toString("utf8"));
        const sourceStatus = new Map((payload.sources || []).map((source) => [source.id, source.status]));
        const weatherBad = ["error", "offline"].includes(sourceStatus.get("open_meteo_weather"));
        const airBad = ["error", "offline"].includes(sourceStatus.get("open_meteo_air"));
        if (weatherBad || airBad) {
          const direct = await directScientificDashboard();
          // Mantém setores, alertas e demais cálculos da API científica quando disponíveis.
          direct.sectors = Array.isArray(payload.sectors) && payload.sectors.length ? payload.sectors : direct.sectors;
          direct.network = payload.network || direct.network;
          direct.alerts = payload.alerts || direct.alerts;
          direct.model_version = payload.model_version || direct.model_version;
          direct.fallback_reason = "upstream_source_recovery";
          body = Buffer.from(JSON.stringify(direct));
          contentType = "application/json; charset=utf-8";
        }
      } catch { /* resposta upstream não pôde ser normalizada; repasse original */ }
    }

    response.statusCode = upstream.status;
    response.setHeader("Content-Type", contentType);
    response.setHeader("X-SIPIC-Upstream", "Supabase Edge Function");
    response.setHeader("Access-Control-Allow-Origin", "*");
    setSecurityHeaders(response);
    if (upstream.ok && body.length) apiCache.set(key, { body, status: upstream.status, contentType, savedAt: Date.now() });
    response.end(body);
  } catch (error) {
    const key = cacheKey(url);
    const cached = apiCache.get(key);
    if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
      response.statusCode = 200;
      response.setHeader("Content-Type", cached.contentType);
      response.setHeader("X-SIPIC-Cache", "STALE-FALLBACK");
      response.setHeader("Cache-Control", "no-store");
      setSecurityHeaders(response);
      response.end(cached.body);
      return;
    }
    if (request.method === "HEAD") { response.statusCode = 200; response.end(); return; }
    // Antes da referência local, tenta as fontes científicas públicas diretamente.
    const reason = error?.name === "AbortError" ? "upstream_timeout" : "upstream_unavailable";
    if (await sendDirectScientificFallback(response, url, reason)) return;
    sendLocalReference(response, url, reason);
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleRequest(request, response) {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${PORT}`}`);

      if (url.pathname === "/local-health") {
        sendJson(response, 200, {
          ok: true,
          service: "SIPIC-RP local frontend gateway",
          api_proxy: "/api",
          upstream_configured: Boolean(UPSTREAM_API),
          generated_at: new Date().toISOString(),
        });
        return;
      }

      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        await proxyApi(request, response, url);
        return;
      }

      if (["GET", "HEAD"].includes(request.method || "GET") && await serveStatic(request, response, url.pathname)) {
        return;
      }

      sendJson(response, 404, {
        ok: false,
        error: "not_found",
        message: "Recurso não encontrado.",
      });
    } catch (error) {
      console.error("[SIPIC-RP]", error);
      if (!response.headersSent) {
        sendJson(response, 500, {
          ok: false,
          error: "internal_error",
          message: "Falha interna no servidor local.",
          detail: String(error?.message || error),
        });
      } else {
        response.end();
      }
    }
}

export function createServer() { return http.createServer(handleRequest); }

export async function startServer() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, resolve);
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : PORT;
  console.log(`SIPIC-RP disponível em http://${HOST}:${actualPort}`);
  console.log(`API local: http://${HOST}:${actualPort}/api/health`);
  console.log(`API científica upstream: ${UPSTREAM_API}`);
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await startServer();
