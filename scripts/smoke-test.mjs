const base = process.env.SIPIC_API_BASE_URL ||
  "https://pzwtoksbbfvgsnwunzri.supabase.co/functions/v1/sipic-api";

const checks = [
  ["/health", (d) => d.ok && d.database?.status === "online"],
  ["/dashboard", (d) => d.ok && Array.isArray(d.sectors) && d.sectors.length >= 1],
  ["/weather", (d) => d.ok && Array.isArray(d.data?.hourly)],
  ["/air-quality", (d) => d.ok && d.data?.current],
  ["/sectors", (d) => d.ok && Array.isArray(d.sectors)],
  ["/sensors", (d) => d.ok && Array.isArray(d.network?.stations)],
  ["/analytics?hours=24", (d) => d.ok && Array.isArray(d.observations)],
  ["/openapi", (d) => d.openapi === "3.1.0"],
  ["/diagnostics", (d) => d.ok && d.checks && typeof d.checks === "object"],
  ["/weather-comparison", (d) => d.ok && d.sources && d.comparison],
];

let failed = false;
for (const [path, validate] of checks) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${base}${path}`, { signal: controller.signal });
    const data = await response.json();
    const ok = response.ok && validate(data);
    console.log(`${ok ? "✓" : "✗"} ${path} — HTTP ${response.status}`);
    if (!ok) failed = true;
  } catch (error) {
    failed = true;
    console.error(`✗ ${path} — ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

if (failed) process.exitCode = 1;
