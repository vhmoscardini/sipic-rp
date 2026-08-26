import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function finite(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateRange(
  field: string,
  value: unknown,
  min: number,
  max: number,
  errors: string[],
) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = finite(value);
  if (parsed === null || parsed < min || parsed > max) {
    errors.push(`${field} deve estar entre ${min} e ${max}.`);
    return null;
  }
  return parsed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ ok: false, error: "Configuração do Supabase indisponível." }, 503);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return json({ ok: false, error: "Autenticação obrigatória." }, 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) {
    return json({ ok: false, error: "Sessão inválida ou expirada." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Corpo JSON inválido." }, 400);
  }

  const stationCode = String(body.station_code ?? "").trim().toUpperCase();
  const observedAt = String(body.observed_at ?? new Date().toISOString());
  const measurements = (body.measurements ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!/^[A-Z0-9_-]{3,64}$/.test(stationCode)) {
    errors.push("station_code é obrigatório e deve conter apenas letras, números, _ ou -. ");
  }
  if (Number.isNaN(Date.parse(observedAt))) errors.push("observed_at deve ser uma data ISO 8601 válida.");

  const normalized = {
    air_temperature_c: validateRange("air_temperature_c", measurements.air_temperature_c, -50, 80, errors),
    apparent_temperature_c: validateRange(
      "apparent_temperature_c",
      measurements.apparent_temperature_c,
      -70,
      100,
      errors,
    ),
    surface_temperature_c: validateRange(
      "surface_temperature_c",
      measurements.surface_temperature_c,
      -80,
      120,
      errors,
    ),
    relative_humidity_pct: validateRange(
      "relative_humidity_pct",
      measurements.relative_humidity_pct,
      0,
      100,
      errors,
    ),
    surface_pressure_hpa: validateRange(
      "surface_pressure_hpa",
      measurements.surface_pressure_hpa,
      700,
      1100,
      errors,
    ),
    wind_speed_ms: validateRange("wind_speed_ms", measurements.wind_speed_ms, 0, 100, errors),
    wind_direction_deg: validateRange(
      "wind_direction_deg",
      measurements.wind_direction_deg,
      0,
      360,
      errors,
    ),
    shortwave_radiation_wm2: validateRange(
      "shortwave_radiation_wm2",
      measurements.shortwave_radiation_wm2,
      0,
      1600,
      errors,
    ),
    precipitation_mm: validateRange(
      "precipitation_mm",
      measurements.precipitation_mm,
      0,
      1000,
      errors,
    ),
    pm25_ugm3: validateRange("pm25_ugm3", measurements.pm25_ugm3, 0, 2000, errors),
    pm10_ugm3: validateRange("pm10_ugm3", measurements.pm10_ugm3, 0, 3000, errors),
    us_aqi: validateRange("us_aqi", measurements.us_aqi, 0, 500, errors),
    ozone_ugm3: validateRange("ozone_ugm3", measurements.ozone_ugm3, 0, 2000, errors),
    nitrogen_dioxide_ugm3: validateRange(
      "nitrogen_dioxide_ugm3",
      measurements.nitrogen_dioxide_ugm3,
      0,
      3000,
      errors,
    ),
    sulphur_dioxide_ugm3: validateRange(
      "sulphur_dioxide_ugm3",
      measurements.sulphur_dioxide_ugm3,
      0,
      3000,
      errors,
    ),
    carbon_monoxide_ugm3: validateRange(
      "carbon_monoxide_ugm3",
      measurements.carbon_monoxide_ugm3,
      0,
      100000,
      errors,
    ),
    uv_index: validateRange("uv_index", measurements.uv_index, 0, 30, errors),
    ndvi: validateRange("ndvi", measurements.ndvi, -1, 1, errors),
  };

  if (!Object.values(normalized).some((value) => value !== null)) {
    errors.push("Informe pelo menos uma medição válida.");
  }
  if (errors.length) return json({ ok: false, error: "Falha de validação.", fields: errors }, 422);

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: station, error: stationError } = await db
    .from("sipic_stations")
    .select("id,code,name,status,active")
    .eq("code", stationCode)
    .eq("active", true)
    .maybeSingle();
  if (stationError) return json({ ok: false, error: stationError.message }, 500);
  if (!station) return json({ ok: false, error: "Estação não cadastrada ou inativa." }, 404);

  const source = String(body.source ?? "authenticated_sensor").slice(0, 120);
  const qualityScore = validateRange("quality_score", body.quality_score ?? 95, 0, 100, errors) ?? 95;
  const rawPayload = {
    measurements,
    metadata: body.metadata ?? {},
    submitted_by: authData.user.id,
    submitted_at: new Date().toISOString(),
  };

  const { data: observation, error: insertError } = await db
    .from("sipic_observations")
    .upsert(
      {
        station_id: station.id,
        observed_at: new Date(observedAt).toISOString(),
        source,
        data_class: "observed",
        ...normalized,
        quality_score: qualityScore,
        raw_payload: rawPayload,
      },
      { onConflict: "station_id,observed_at,source" },
    )
    .select("id,observed_at,source,quality_score")
    .single();
  if (insertError) return json({ ok: false, error: insertError.message }, 500);

  await db
    .from("sipic_stations")
    .update({ status: "online", last_seen_at: new Date(observedAt).toISOString() })
    .eq("id", station.id);

  return json(
    {
      ok: true,
      message: "Observação recebida e persistida.",
      station: { code: station.code, name: station.name },
      observation,
    },
    201,
  );
});
