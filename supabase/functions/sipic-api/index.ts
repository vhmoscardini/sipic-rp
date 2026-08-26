// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const API_VERSION = "1.0.1";
const MODEL_VERSION = "sipic-hybrid-1.0.0";
const LAT = -21.1775;
const LON = -47.8103;
const TZ = "America/Sao_Paulo";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const num = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const round = (value, digits = 1) => {
  const parsed = num(value);
  if (parsed === null) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, num(value, min)));
const reply = (payload, status = 200, headers = {}) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...CORS, "Cache-Control": "public, max-age=90, s-maxage=180", ...headers },
});
const fail = (message, status = 500, detail = null) => reply({ ok: false, error: message, detail }, status, { "Cache-Control": "no-store" });
const isoLocal = (value) => /Z$|[+-]\d\d:\d\d$/.test(String(value)) ? String(value) : `${value}:00-03:00`;
const weatherLabel = (code) => ({
  0: "Céu limpo", 1: "Predominantemente limpo", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Nevoeiro", 48: "Nevoeiro com geada", 51: "Garoa leve", 53: "Garoa moderada", 55: "Garoa intensa",
  61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva intensa", 80: "Pancadas leves", 81: "Pancadas moderadas",
  82: "Pancadas intensas", 95: "Trovoada", 96: "Trovoada com granizo", 99: "Trovoada severa com granizo",
}[Number(code)] ?? `Código meteorológico WMO ${code ?? "N/D"}`);

function riskFrom(apparent, uhi, imperviousness, ndvi) {
  const score = clamp((apparent - 25) * 5.2 + uhi * 4.8 + imperviousness * 14 - ndvi * 8, 0, 100);
  const level = score >= 82 ? "critical" : score >= 64 ? "high" : score >= 38 ? "moderate" : "low";
  return { score: round(score, 1), level, label: { low: "Baixo", moderate: "Moderado", high: "Alto", critical: "Crítico" }[level] };
}

function weatherUrl() {
  const p = new URLSearchParams({
    latitude: String(LAT), longitude: String(LON), timezone: TZ, wind_speed_unit: "ms",
    forecast_days: "3",
    current: ["temperature_2m", "relative_humidity_2m", "apparent_temperature", "precipitation", "weather_code", "cloud_cover", "surface_pressure", "wind_speed_10m", "wind_direction_10m", "shortwave_radiation", "soil_temperature_0cm"].join(","),
    hourly: ["temperature_2m", "relative_humidity_2m", "apparent_temperature", "precipitation_probability", "precipitation", "weather_code", "cloud_cover", "surface_pressure", "wind_speed_10m", "wind_direction_10m", "shortwave_radiation", "soil_temperature_0cm"].join(","),
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

function airUrl() {
  const p = new URLSearchParams({
    latitude: String(LAT), longitude: String(LON), timezone: TZ, forecast_days: "3",
    current: ["pm10", "pm2_5", "carbon_monoxide", "nitrogen_dioxide", "sulphur_dioxide", "ozone", "us_aqi", "uv_index"].join(","),
    hourly: ["pm10", "pm2_5", "us_aqi", "uv_index"].join(","),
  });
  return `https://air-quality-api.open-meteo.com/v1/air-quality?${p}`;
}

function powerUrl() {
  const end = new Date();
  const start = new Date(Date.now() - 8 * 86400000);
  const stamp = (date) => `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  const p = new URLSearchParams({
    parameters: "ALLSKY_SFC_SW_DWN,T2M,RH2M,WS2M,PRECTOTCORR",
    community: "RE", longitude: String(LON), latitude: String(LAT), start: stamp(start), end: stamp(end), format: "JSON",
  });
  return `https://power.larc.nasa.gov/api/temporal/daily/point?${p}`;
}

async function cached(key, source, ttlSeconds, url, force = false) {
  const { data: row } = await db.from("sipic_api_cache").select("*").eq("cache_key", key).maybeSingle();
  const fetchedAgeMs = row?.fetched_at ? Date.now() - Date.parse(row.fetched_at) : Number.POSITIVE_INFINITY;
  const forceIsThrottled = force && fetchedAgeMs < 60_000;
  if (row?.payload && ((!force && Date.parse(row.expires_at) > Date.now()) || forceIsThrottled)) {
    return {
      data: row.payload,
      fetched_at: row.fetched_at,
      expires_at: row.expires_at,
      cache_hit: true,
      stale: false,
      refresh_throttled: forceIsThrottled,
    };
  }
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "SIPIC-RP academic dashboard" } });
    if (!response.ok) throw new Error(`${source} respondeu HTTP ${response.status}`);
    const payload = await response.json();
    const fetchedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    await db.from("sipic_api_cache").upsert({ cache_key: key, source, payload, fetched_at: fetchedAt, expires_at: expiresAt, status: "fresh", error_message: null });
    return { data: payload, fetched_at: fetchedAt, expires_at: expiresAt, cache_hit: false, stale: false };
  } catch (error) {
    if (row?.payload) {
      await db.from("sipic_api_cache").update({ status: "stale", error_message: String(error?.message ?? error) }).eq("cache_key", key);
      return { data: row.payload, fetched_at: row.fetched_at, expires_at: row.expires_at, cache_hit: true, stale: true, warning: String(error?.message ?? error) };
    }
    throw error;
  }
}

function normalizeWeather(raw) {
  const c = raw.current ?? {};
  const h = raw.hourly ?? {};
  const current = {
    time: c.time,
    temperature_c: num(c.temperature_2m), apparent_temperature_c: num(c.apparent_temperature),
    relative_humidity_pct: num(c.relative_humidity_2m), precipitation_mm: num(c.precipitation),
    weather_code: num(c.weather_code), cloud_cover_pct: num(c.cloud_cover),
    surface_pressure_hpa: num(c.surface_pressure), wind_speed_ms: num(c.wind_speed_10m),
    wind_direction_deg: num(c.wind_direction_10m), shortwave_radiation_wm2: num(c.shortwave_radiation),
    soil_temperature_c: num(c.soil_temperature_0cm),
  };
  const length = h.time?.length ?? 0;
  const hourly = Array.from({ length }, (_, i) => ({
    time: h.time[i], temperature_c: num(h.temperature_2m?.[i]), apparent_temperature_c: num(h.apparent_temperature?.[i]),
    relative_humidity_pct: num(h.relative_humidity_2m?.[i]), precipitation_probability_pct: num(h.precipitation_probability?.[i]),
    precipitation_mm: num(h.precipitation?.[i]), weather_code: num(h.weather_code?.[i]), cloud_cover_pct: num(h.cloud_cover?.[i]),
    surface_pressure_hpa: num(h.surface_pressure?.[i]), wind_speed_ms: num(h.wind_speed_10m?.[i]),
    wind_direction_deg: num(h.wind_direction_10m?.[i]), shortwave_radiation_wm2: num(h.shortwave_radiation?.[i]),
    soil_temperature_c: num(h.soil_temperature_0cm?.[i]),
  }));
  return { current, hourly, units: raw.current_units ?? {}, source_payload: raw };
}

function normalizeAir(raw) {
  const c = raw.current ?? {};
  return {
    current: {
      time: c.time, pm25_ugm3: num(c.pm2_5), pm10_ugm3: num(c.pm10), us_aqi: num(c.us_aqi),
      ozone_ugm3: num(c.ozone), nitrogen_dioxide_ugm3: num(c.nitrogen_dioxide),
      sulphur_dioxide_ugm3: num(c.sulphur_dioxide), carbon_monoxide_ugm3: num(c.carbon_monoxide), uv_index: num(c.uv_index),
    },
    source_payload: raw,
  };
}

function sectorPoint(sector, weather, horizon = 0) {
  const parsedHour = Number(String(weather.time ?? "T12:00").slice(11, 13));
  const hour = Number.isFinite(parsedHour) ? parsedHour : 12;
  const sun = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const impervious = num(sector.imperviousness, 0.5);
  const ndvi = num(sector.ndvi, 0.3);
  const ventilation = num(sector.ventilation_factor, 0.5);
  const offset = num(sector.heat_offset_c, 0);
  const wind = num(weather.wind_speed_ms, 1.5);
  const morphology = offset * (0.65 + sun * 0.35) - wind * (ventilation - 0.5) * 0.22;
  const air = num(weather.temperature_c, 30) + morphology;
  const apparent = num(weather.apparent_temperature_c, air) + morphology * 0.7;
  const surface = air + 2.4 + sun * (5.5 + impervious * 5.4 - ndvi * 2.8) + Math.max(0, num(weather.soil_temperature_c, air) - air) * 0.25;
  const humidity = clamp(num(weather.relative_humidity_pct, 45) + ndvi * 7 - impervious * 4, 8, 100);
  const confidence = clamp(93 - horizon * 0.28 - Math.abs(offset) * 0.6, 70, 94);
  const uncertainty = 0.7 + horizon * 0.025 + Math.abs(offset) * 0.08;
  return {
    id: sector.id, code: sector.code, name: sector.name, zone: sector.zone,
    latitude: sector.latitude, longitude: sector.longitude, horizon_hours: horizon,
    imperviousness: impervious, ndvi, sky_view_factor: num(sector.sky_view_factor, 0.6),
    building_density: num(sector.building_density, 0.5), ventilation_factor: ventilation,
    time: weather.time, air_temperature_c: round(air, 2), apparent_temperature_c: round(apparent, 2),
    surface_temperature_c: round(surface, 2), relative_humidity_pct: round(humidity, 1),
    wind_speed_ms: round(wind, 2), wind_direction_deg: weather.wind_direction_deg,
    shortwave_radiation_wm2: weather.shortwave_radiation_wm2, weather_code: weather.weather_code,
    urban_heat_island_c: 0, confidence_pct: round(confidence, 1),
    lower_bound_c: round(air - uncertainty, 2), upper_bound_c: round(air + uncertainty, 2),
    explanations: [
      { factor: "impermeabilização", contribution: round(impervious * offset, 2) },
      { factor: "vegetação/NDVI", contribution: round(-ndvi * 1.4, 2) },
      { factor: "ventilação", contribution: round(-wind * ventilation * 0.12, 2) },
      { factor: "radiação solar", contribution: round(sun * 1.2, 2) },
    ],
    data_class: "calculated", model_version: MODEL_VERSION,
  };
}

function applyUhi(rows) {
  const reference = rows.find((row) => row.code === "RP-REF-01") ?? rows.at(-1);
  const ref = num(reference?.air_temperature_c, 0);
  return rows.map((row) => {
    const uhi = Math.max(0, num(row.air_temperature_c, ref) - ref);
    const risk = riskFrom(num(row.apparent_temperature_c, row.air_temperature_c), uhi, num(row.imperviousness, 0.6), num(row.ndvi, 0.3));
    return { ...row, urban_heat_island_c: round(uhi, 2), risk_score: risk.score, risk_level: risk.level, risk_label: risk.label };
  });
}

async function catalog() {
  const [sectorResult, stationResult] = await Promise.all([
    db.from("sipic_sectors").select("*").eq("active", true).order("code"),
    db.from("sipic_stations").select("*").eq("active", true).order("code"),
  ]);
  if (sectorResult.error) throw sectorResult.error;
  if (stationResult.error) throw stationResult.error;
  return { sectors: sectorResult.data ?? [], stations: stationResult.data ?? [] };
}

async function persistSnapshot(sectors, stations, current, frames, alerts, weather, air) {
  const stationByCode = new Map(stations.map((station) => [station.code, station]));
  const observedAt = isoLocal(weather.current.time);
  const observations = current.map((row) => ({
    station_id: stationByCode.get(row.code)?.id, observed_at: observedAt, source: "SIPIC-RP hybrid model", data_class: "calculated",
    air_temperature_c: row.air_temperature_c, apparent_temperature_c: row.apparent_temperature_c, surface_temperature_c: row.surface_temperature_c,
    relative_humidity_pct: row.relative_humidity_pct, wind_speed_ms: row.wind_speed_ms, wind_direction_deg: row.wind_direction_deg,
    shortwave_radiation_wm2: row.shortwave_radiation_wm2, weather_code: row.weather_code, ndvi: row.ndvi,
    urban_heat_island_c: row.urban_heat_island_c, risk_score: row.risk_score, quality_score: row.confidence_pct,
    raw_payload: { explanations: row.explanations, model_version: MODEL_VERSION },
  })).filter((row) => row.station_id);
  const weatherStation = stationByCode.get("RP-OPENMETEO");
  if (weatherStation) observations.push({
    station_id: weatherStation.id, observed_at: observedAt, source: "Open-Meteo", data_class: "modeled",
    air_temperature_c: weather.current.temperature_c, apparent_temperature_c: weather.current.apparent_temperature_c,
    relative_humidity_pct: weather.current.relative_humidity_pct, surface_pressure_hpa: weather.current.surface_pressure_hpa,
    wind_speed_ms: weather.current.wind_speed_ms, wind_direction_deg: weather.current.wind_direction_deg,
    shortwave_radiation_wm2: weather.current.shortwave_radiation_wm2, precipitation_mm: weather.current.precipitation_mm,
    weather_code: weather.current.weather_code, quality_score: 92, raw_payload: weather.current,
  });
  const airStation = stationByCode.get("RP-AIR-CAMS");
  if (airStation) observations.push({
    station_id: airStation.id, observed_at: isoLocal(air.current.time ?? weather.current.time), source: "CAMS via Open-Meteo", data_class: "modeled",
    pm25_ugm3: air.current.pm25_ugm3, pm10_ugm3: air.current.pm10_ugm3, us_aqi: air.current.us_aqi,
    ozone_ugm3: air.current.ozone_ugm3, nitrogen_dioxide_ugm3: air.current.nitrogen_dioxide_ugm3,
    sulphur_dioxide_ugm3: air.current.sulphur_dioxide_ugm3, carbon_monoxide_ugm3: air.current.carbon_monoxide_ugm3,
    uv_index: air.current.uv_index, quality_score: 82, raw_payload: air.current,
  });
  if (observations.length) await db.from("sipic_observations").upsert(observations, { onConflict: "station_id,observed_at,source" });
  const generatedAt = observedAt;
  const predictionRows = [];
  for (const frame of frames) for (const row of frame.sectors) predictionRows.push({
    sector_id: row.id, generated_at: generatedAt, valid_at: isoLocal(row.time), horizon_hours: row.horizon_hours,
    model_version: MODEL_VERSION, source: "Open-Meteo + morphology", air_temperature_c: row.air_temperature_c,
    surface_temperature_c: row.surface_temperature_c, apparent_temperature_c: row.apparent_temperature_c,
    urban_heat_island_c: row.urban_heat_island_c, lower_bound_c: row.lower_bound_c, upper_bound_c: row.upper_bound_c,
    risk_score: row.risk_score, risk_level: row.risk_level, confidence_pct: row.confidence_pct,
    explanations: row.explanations, raw_payload: { weather_code: row.weather_code },
  });
  if (predictionRows.length) await db.from("sipic_predictions").upsert(predictionRows, { onConflict: "sector_id,generated_at,valid_at,model_version" });
  for (const alert of alerts) {
    const sector = sectors.find((item) => item.code === alert.sector_code);
    if (!sector) continue;
    const fingerprint = `${alert.sector_code}:${String(alert.valid_from).slice(0, 13)}:${alert.level}`;
    await db.from("sipic_alerts").upsert({
      sector_id: sector.id, fingerprint, generated_at: generatedAt, valid_from: alert.valid_from, valid_until: alert.valid_until,
      alert_type: "thermal_risk", level: alert.level, title: alert.title, message: alert.message, active: true,
      metadata: { risk_score: alert.risk_score, confidence_pct: alert.confidence_pct, model_version: MODEL_VERSION },
    }, { onConflict: "fingerprint" });
  }
  const ids = observations.map((row) => row.station_id).filter(Boolean);
  if (ids.length) await db.from("sipic_stations").update({ last_seen_at: observedAt, status: "online" }).in("id", ids);
}

async function dashboard(force = false) {
  const [weatherCache, airCache, { sectors, stations }] = await Promise.all([
    cached("rp_weather", "Open-Meteo Forecast", 600, weatherUrl(), force),
    cached("rp_air", "Open-Meteo Air Quality / CAMS", 1200, airUrl(), force),
    catalog(),
  ]);
  const weather = normalizeWeather(weatherCache.data);
  const air = normalizeAir(airCache.data);
  let start = weather.hourly.findIndex((row) => String(row.time) >= String(weather.current.time));
  if (start < 0) start = 0;
  const weatherFrames = weather.hourly.slice(start, start + 49);
  const current = applyUhi(sectors.map((sector) => sectorPoint(sector, weather.current, 0)));
  const frames = weatherFrames.map((point, horizon) => ({ time: point.time, horizon_hours: horizon, sectors: applyUhi(sectors.map((sector) => sectorPoint(sector, point, horizon))) }));
  const bySector = sectors.map((sector) => ({ code: sector.code, name: sector.name, timeline: frames.map((frame) => frame.sectors.find((row) => row.code === sector.code)) }));
  const cityTimeline = frames.map((frame) => {
    const centre = frame.sectors.find((row) => row.code === "RP-CENTRO-04") ?? frame.sectors[0];
    const hottest = [...frame.sectors].filter((row) => row.code !== "RP-REF-01").sort((a, b) => b.surface_temperature_c - a.surface_temperature_c)[0];
    return {
      time: frame.time, horizon_hours: frame.horizon_hours, air_temperature_c: centre.air_temperature_c,
      surface_temperature_c: centre.surface_temperature_c, apparent_temperature_c: centre.apparent_temperature_c,
      urban_heat_island_c: centre.urban_heat_island_c, lower_bound_c: centre.lower_bound_c, upper_bound_c: centre.upper_bound_c,
      confidence_pct: centre.confidence_pct, risk_level: centre.risk_level,
      hottest_sector: hottest ? { code: hottest.code, name: hottest.name, surface_temperature_c: hottest.surface_temperature_c, risk_level: hottest.risk_level } : null,
    };
  });
  const alerts = [];
  for (const item of bySector) {
    const peak = [...item.timeline.slice(0, 25)].sort((a, b) => b.risk_score - a.risk_score)[0];
    if (!peak || !["high", "critical"].includes(peak.risk_level)) continue;
    alerts.push({
      sector_code: item.code, sector_name: item.name, valid_from: isoLocal(peak.time),
      valid_until: new Date(Date.parse(isoLocal(peak.time)) + 3 * 3600000).toISOString(),
      level: peak.risk_level === "critical" ? "critical" : "warning",
      title: peak.risk_level === "critical" ? "Risco térmico crítico" : "Risco térmico elevado",
      message: `${item.name} pode atingir temperatura aparente de ${round(peak.apparent_temperature_c, 1)} °C e superfície estimada de ${round(peak.surface_temperature_c, 1)} °C.`,
      risk_score: peak.risk_score, confidence_pct: peak.confidence_pct,
    });
  }
  const centre = current.find((row) => row.code === "RP-CENTRO-04") ?? current[0];
  const reference = current.find((row) => row.code === "RP-REF-01") ?? current.at(-1);
  const hottest = [...current].filter((row) => row.code !== "RP-REF-01").sort((a, b) => b.surface_temperature_c - a.surface_temperature_c)[0];
  await persistSnapshot(sectors, stations, current, frames, alerts, weather, air).catch((error) => console.error("persist", error));
  const refreshedCatalog = await catalog();
  const online = refreshedCatalog.stations.filter((station) => station.status === "online").length;
  return {
    ok: true, api_version: API_VERSION, model_version: MODEL_VERSION, generated_at: new Date().toISOString(),
    data_status: weatherCache.stale || airCache.stale ? "live_with_stale_cache" : "live_and_calculated",
    location: { city: "Ribeirão Preto", state: "SP", country: "Brasil", latitude: LAT, longitude: LON, timezone: TZ },
    current: {
      time: weather.current.time, air_temperature_c: round(centre.air_temperature_c), apparent_temperature_c: round(centre.apparent_temperature_c),
      surface_temperature_c: round(centre.surface_temperature_c), relative_humidity_pct: round(centre.relative_humidity_pct, 0),
      wind_speed_ms: round(centre.wind_speed_ms), wind_direction_deg: round(centre.wind_direction_deg, 0),
      surface_pressure_hpa: round(weather.current.surface_pressure_hpa), shortwave_radiation_wm2: round(centre.shortwave_radiation_wm2, 0),
      precipitation_mm: round(weather.current.precipitation_mm), weather_code: weather.current.weather_code,
      weather_description: weatherLabel(weather.current.weather_code),
      urban_heat_island_c: round(centre.urban_heat_island_c), ndvi: centre.ndvi, risk_score: centre.risk_score,
      risk_level: centre.risk_level, risk_label: centre.risk_label, confidence_pct: centre.confidence_pct,
      reference_air_temperature_c: reference.air_temperature_c,
    },
    air_quality: { ...air.current, aqi_classification: { label: num(air.current.us_aqi, 0) <= 50 ? "Bom" : num(air.current.us_aqi, 0) <= 100 ? "Moderado" : "Elevado" } },
    hottest_sector: hottest, sectors: current,
    forecast: { generated_at: new Date().toISOString(), city_timeline: cityTimeline, by_sector: bySector, horizon_hours: Math.max(0, cityTimeline.length - 1), methodology: "Open-Meteo corrigido por parâmetros morfológicos experimentais de cada setor." },
    alerts,
    network: { total: refreshedCatalog.stations.length, online, warning: refreshedCatalog.stations.filter((s) => s.status === "warning").length, offline: refreshedCatalog.stations.filter((s) => s.status === "offline").length, health_pct: round((online / Math.max(1, refreshedCatalog.stations.length)) * 100), stations: refreshedCatalog.stations },
    atmospheric_composition: { nitrogen_pct: 78.08, oxygen_pct: 20.95, carbon_dioxide_pct: 0.042, argon_and_other_pct: 0.928, note: "Composição atmosférica global de referência." },
    venus: { surface_temperature_c: 464, surface_pressure_bar: 92, co2_percent: 96.5, role: "analogia científica controlada" },
    sources: [
      { id: "open_meteo_weather", name: "Open-Meteo Forecast API", status: weatherCache.stale ? "stale" : "online", cache_hit: weatherCache.cache_hit, fetched_at: weatherCache.fetched_at, expires_at: weatherCache.expires_at, attribution: "Open-Meteo, CC BY 4.0" },
      { id: "open_meteo_air", name: "Open-Meteo Air Quality / CAMS", status: airCache.stale ? "stale" : "online", cache_hit: airCache.cache_hit, fetched_at: airCache.fetched_at, expires_at: airCache.expires_at, attribution: "Open-Meteo/CAMS" },
      { id: "supabase", name: "Supabase PostgreSQL", status: "online", attribution: "Persistência do projeto" },
      { id: "inmet", name: "INMET", status: "reference_only", attribution: "Referência para validação futura" },
    ],
    scientific_disclaimer: "Sistema acadêmico experimental. As estimativas urbanas são calculadas por modelo e não substituem alertas meteorológicos oficiais nem medições locais calibradas.",
  };
}

async function analytics(hours = 72) {
  const safe = clamp(Math.round(hours), 6, 720);
  const since = new Date(Date.now() - safe * 3600000).toISOString();
  const { data, error } = await db.from("sipic_observations").select("observed_at,source,data_class,air_temperature_c,apparent_temperature_c,surface_temperature_c,relative_humidity_pct,wind_speed_ms,shortwave_radiation_wm2,pm25_ugm3,pm10_ugm3,us_aqi,ndvi,urban_heat_island_c,risk_score,sipic_stations!inner(code,name,sector_id)").gte("observed_at", since).order("observed_at").limit(10000);
  if (error) throw error;
  return { ok: true, generated_at: new Date().toISOString(), requested_hours: safe, since, count: data?.length ?? 0, observations: data ?? [] };
}

async function health() {
  const started = Date.now();
  const [sectors, stations, cache] = await Promise.all([
    db.from("sipic_sectors").select("id", { count: "exact", head: true }),
    db.from("sipic_stations").select("id", { count: "exact", head: true }),
    db.from("sipic_api_cache").select("cache_key,source,fetched_at,expires_at,status,error_message").order("updated_at", { ascending: false }),
  ]);
  const errors = [sectors.error, stations.error, cache.error].filter(Boolean);
  return { ok: !errors.length, service: "SIPIC-RP API", api_version: API_VERSION, model_version: MODEL_VERSION, generated_at: new Date().toISOString(), latency_ms: Date.now() - started, database: { status: errors.length ? "degraded" : "online", sectors: sectors.count, stations: stations.count, error: errors.map((e) => e.message).join(" | ") || null }, cache: cache.data ?? [], external_sources: { open_meteo_weather: "configured", open_meteo_air_quality: "configured", nasa_power: "configured", inmet: "reference_only" } };
}

function index(url) {
  const base = `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  return { ok: true, name: "SIPIC-RP API", version: API_VERSION, base_url: base, endpoints: ["/health", "/dashboard", "/weather", "/air-quality", "/solar", "/sectors", "/sensors", "/analytics", "/report", "/openapi"] };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "GET") return fail("Método não permitido. A API pública aceita apenas GET.", 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return fail("Configuração do Supabase indisponível.", 503);
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const at = parts.lastIndexOf("sipic-api");
  const route = `/${parts.slice(at + 1).join("/")}`.replace(/\/$/, "") || "/";
  const force = ["1", "true", "yes"].includes((url.searchParams.get("refresh") ?? "").toLowerCase());
  try {
    if (route === "/") return reply(index(url));
    if (route === "/health") return reply(await health(), 200, { "Cache-Control": "no-store" });
    if (route === "/dashboard") return reply(await dashboard(force), 200, force ? { "Cache-Control": "no-store" } : {});
    if (route === "/weather") { const result = await cached("rp_weather", "Open-Meteo Forecast", 600, weatherUrl(), force); return reply({ ok: true, ...result, data: normalizeWeather(result.data) }); }
    if (route === "/air-quality") { const result = await cached("rp_air", "Open-Meteo Air Quality / CAMS", 1200, airUrl(), force); return reply({ ok: true, ...result, data: normalizeAir(result.data) }); }
    if (route === "/solar") { const result = await cached("rp_nasa_power", "NASA POWER", 21600, powerUrl(), force); return reply({ ok: true, ...result }); }
    if (route === "/sectors") { const { sectors } = await catalog(); return reply({ ok: true, generated_at: new Date().toISOString(), sectors }); }
    if (route === "/sensors") { const { stations } = await catalog(); return reply({ ok: true, generated_at: new Date().toISOString(), network: { total: stations.length, online: stations.filter((s) => s.status === "online").length, warning: stations.filter((s) => s.status === "warning").length, offline: stations.filter((s) => s.status === "offline").length, stations } }); }
    if (route === "/analytics") return reply(await analytics(Number(url.searchParams.get("hours") ?? 72)));
    if (route === "/report") { const data = await dashboard(false); const report = { project: data.location, generated_at: data.generated_at, data_status: data.data_status, model_version: data.model_version, current: data.current, air_quality: data.air_quality, hottest_sector: data.hottest_sector, alerts: data.alerts, sectors: data.sectors, sources: data.sources, scientific_disclaimer: data.scientific_disclaimer }; await db.from("sipic_reports").insert({ report_type: "operational_snapshot", status: "ready", payload: report, metadata: { model_version: MODEL_VERSION } }); return reply({ ok: true, report }); }
    if (route === "/openapi") return reply({ openapi: "3.1.0", info: { title: "SIPIC-RP API", version: API_VERSION }, servers: [{ url: index(url).base_url.replace(/\/openapi$/, "") }], paths: Object.fromEntries(["/health", "/dashboard", "/weather", "/air-quality", "/solar", "/sectors", "/sensors", "/analytics", "/report"].map((path) => [path, { get: { summary: path.slice(1), responses: { "200": { description: "OK" } } } }])) });
    return fail(`Rota não encontrada: ${route}`, 404);
  } catch (error) {
    console.error("sipic-api", route, error);
    return fail("Falha ao processar a solicitação da API.", 502, String(error?.message ?? error));
  }
});
