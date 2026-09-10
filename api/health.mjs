const UPSTREAM_API = String(
  process.env.SIPIC_API_BASE_URL ||
  "https://pzwtoksbbfvgsnwunzri.supabase.co/functions/v1/sipic-api"
).replace(/\/+$/, "");

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    return res.end();
  }
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ ok: false, error_code: "METHOD_NOT_ALLOWED", message: "Use GET." }));
  }

  const started = Date.now();
  let upstream = { ok: false, status: "unknown" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${UPSTREAM_API}/health`, { headers: { Accept: "application/json" }, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    upstream = {
      ok: response.ok && payload?.ok !== false,
      status: response.ok ? (payload?.database?.status || "online") : "error",
      http_status: response.status,
      service: payload?.service || "SIPIC-RP API",
      database: payload?.database || null,
      cache: payload?.cache || [],
      api_version: payload?.api_version || null,
      model_version: payload?.model_version || null,
    };
  } catch (error) {
    upstream = { ok: false, status: "error", message: error?.name === "AbortError" ? "Timeout ao validar o Supabase." : (error?.message || String(error)) };
  } finally {
    clearTimeout(timer);
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({
    ok: true,
    service: "SIPIC-RP Vercel Gateway",
    generated_at: new Date().toISOString(),
    latency_ms: Date.now() - started,
    api_version: upstream.api_version || null,
    model_version: upstream.model_version || null,
    database: upstream.database || { status: upstream.ok ? "online" : "degraded", sectors: null, stations: null },
    cache: upstream.cache || [],
    upstream,
  }));
}
