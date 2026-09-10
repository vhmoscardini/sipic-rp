const state = globalThis.__SIPIC_OPENWEATHER_STATE__ ||= { logs: [] };

const LOCATION = Object.freeze({ latitude: -21.1775, longitude: -47.8103 });

export function reply(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SIPIC-OpenWeather-Key");
  if (status === 204) return res.end();
  res.end(JSON.stringify(data));
}

export function addLog(level, message, error_code = null) {
  state.logs.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    level,
    source: "OpenWeather",
    message,
    ...(error_code ? { error_code } : {}),
  });
  if (state.logs.length > 100) state.logs.splice(0, state.logs.length - 100);
}

export function keyFromRequest(req) {
  const header = req?.headers?.["x-sipic-openweather-key"];
  const headerKey = String(Array.isArray(header) ? header[0] : (header || "")).trim();
  return headerKey || String(process.env.OPENWEATHER_API_KEY || "").trim();
}

export function keyStatus(req, explicitKey = "") {
  const key = explicitKey || keyFromRequest(req);
  return {
    configured: Boolean(key),
    masked_key: key ? (key.length <= 8 ? "••••••••" : `${key.slice(0, 4)}••••••••${key.slice(-4)}`) : null,
  };
}

export async function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

export async function validateKey(key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  const started = Date.now();
  try {
    const params = new URLSearchParams({ lat: String(LOCATION.latitude), lon: String(LOCATION.longitude), appid: key, units: "metric", lang: "pt_br" });
    const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?${params}`, { signal: controller.signal, headers: { Accept: "application/json" } });
    let data = null;
    try { data = await response.json(); } catch {}
    const latency_ms = Date.now() - started;
    if (!response.ok) {
      const error = new Error(data?.message || `OpenWeather respondeu HTTP ${response.status}.`);
      error.status = response.status;
      error.code = response.status === 401 ? "INVALID_API_KEY" : response.status === 429 ? "RATE_LIMIT" : `HTTP_${response.status}`;
      throw error;
    }
    return { http_status: response.status, latency_ms, data };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error("Timeout ao consultar OpenWeather após 12000 ms.");
      timeout.code = "HTTP_TIMEOUT";
      throw timeout;
    }
    throw error;
  } finally { clearTimeout(timer); }
}

export { state };
