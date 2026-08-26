import { readFile, stat } from "node:fs/promises";

const required = [
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
  "server.mjs",
  "supabase/migrations/20260825230000_sipic_core.sql",
  "supabase/functions/sipic-api/index.ts",
  "supabase/functions/sipic-ingest/index.ts",
];

let failed = false;
for (const file of required) {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size === 0) throw new Error("arquivo vazio");
    console.log(`✓ ${file}`);
  } catch (error) {
    failed = true;
    console.error(`✗ ${file}: ${error.message}`);
  }
}

const html = await readFile("index.html", "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicates.length) {
  failed = true;
  console.error(`✗ IDs duplicados: ${duplicates.join(", ")}`);
} else {
  console.log(`✓ ${ids.length} IDs HTML sem duplicação`);
}

const config = await readFile("config.js", "utf8");
if (/service[_-]?role|SUPABASE_SERVICE_ROLE_KEY/i.test(config)) {
  failed = true;
  console.error("✗ config.js contém referência a chave de serviço");
} else {
  console.log("✓ config.js não expõe chave de serviço");
}
if (!/apiBaseUrl:\s*["']\/api["']/.test(config)) {
  failed = true;
  console.error("✗ config.js não aponta para o gateway local /api");
} else {
  console.log("✓ frontend usa o gateway local /api");
}

const server = await readFile("server.mjs", "utf8");
for (const marker of ["SIPIC_API_BASE_URL", "proxyApi", "local-health"]) {
  if (!server.includes(marker)) {
    failed = true;
    console.error(`✗ marcador ausente no servidor local: ${marker}`);
  }
}

const api = await readFile("supabase/functions/sipic-api/index.ts", "utf8");
for (const marker of ["sipic_api_cache", "sipic_predictions", "scientific_disclaimer"]) {
  if (!api.includes(marker)) {
    failed = true;
    console.error(`✗ marcador ausente na API: ${marker}`);
  }
}

if (failed) process.exitCode = 1;
