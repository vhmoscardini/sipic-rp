import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";

const LOCATION = Object.freeze({ city: "Ribeirão Preto", state: "SP", latitude: -21.1775, longitude: -47.8103, timezone: "America/Sao_Paulo" });
const UPSTREAM_API = String(process.env.SIPIC_API_BASE_URL || "https://pzwtoksbbfvgsnwunzri.supabase.co/functions/v1/sipic-api").replace(/\/+$/, "");
const TIMEOUT_MS = Math.max(5000, Number(process.env.REQUEST_TIMEOUT_MS || 18000));
const OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
const OPENMETEO_URL = "https://api.open-meteo.com/v1/forecast";
const memory = globalThis.__SIPIC_VERCEL_STATE__ ||= { logs: [] };

function json(res, status, payload) {
  res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (status === 204) return res.end(); res.end(JSON.stringify(payload));
}
function log(level, source, message, error_code = null) { memory.logs.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, timestamp: new Date().toISOString(), level, source, message, ...(error_code ? {error_code} : {}) }); if (memory.logs.length > 150) memory.logs.splice(0, memory.logs.length - 150); }
function key() { return String(process.env.OPENWEATHER_API_KEY || "").trim(); }
function mask(v) { return v ? (v.length <= 8 ? "••••••••" : `${v.slice(0,4)}••••••••${v.slice(-4)}`) : null; }
async function fetchJson(url, options = {}, timeout = TIMEOUT_MS) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout); const started = Date.now();
  try { const r = await fetch(url, {...options, headers:{Accept:"application/json", ...(options.headers||{})}, signal:c.signal}); const text = await r.text(); let payload=null; try { payload=text?JSON.parse(text):null; } catch { payload={raw:text.slice(0,500)}; } return {response:r,payload,latency_ms:Date.now()-started}; }
  catch(e) { if(e?.name === "AbortError") { const x=new Error(`Timeout após ${timeout} ms.`); x.code="HTTP_TIMEOUT"; throw x; } throw e; } finally { clearTimeout(t); }
}
async function openWeather() {
  const k=key(); if(!k) return {ok:false,configured:false,status:"not_configured",source:"OpenWeather",message:"API Key não configurada."};
  const p=new URLSearchParams({lat:String(LOCATION.latitude),lon:String(LOCATION.longitude),appid:k,units:"metric",lang:"pt_br"});
  const {response,payload,latency_ms}=await fetchJson(`${OPENWEATHER_URL}?${p}`);
  if(!response.ok) { const e=new Error(payload?.message || `OpenWeather respondeu HTTP ${response.status}.`); e.status=response.status; e.code=response.status===401?"INVALID_API_KEY":response.status===429?"RATE_LIMIT":`HTTP_${response.status}`; throw e; }
  const w=payload?.main||{}; const wind=payload?.wind||{}; return {ok:true,configured:true,status:"online",source:"OpenWeather",http_status:response.status,latency_ms,observed_at:new Date((payload.dt||0)*1000).toISOString(),temperature_c:Number.isFinite(Number(w.temp))?Number(w.temp):null,apparent_temperature_c:Number.isFinite(Number(w.feels_like))?Number(w.feels_like):null,humidity_pct:Number.isFinite(Number(w.humidity))?Number(w.humidity):null,pressure_hpa:Number.isFinite(Number(w.pressure))?Number(w.pressure):null,wind_speed_ms:Number.isFinite(Number(wind.speed))?Number(wind.speed):null,precipitation_mm:null,cloud_cover_pct:Number.isFinite(Number(payload.clouds?.all))?Number(payload.clouds.all):null,raw:payload};
}
async function openMeteo() { const p=new URLSearchParams({latitude:LOCATION.latitude,longitude:LOCATION.longitude,current:"temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,wind_speed_10m,precipitation,cloud_cover",timezone:LOCATION.timezone}); const {response,payload,latency_ms}=await fetchJson(`${OPENMETEO_URL}?${p}`); if(!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`); const c=payload?.current||{}; return {ok:true,source:"Open-Meteo",latency_ms,observed_at:c.time||null,temperature_c:Number(c.temperature_2m),apparent_temperature_c:Number(c.apparent_temperature),humidity_pct:Number(c.relative_humidity_2m),pressure_hpa:Number(c.surface_pressure),wind_speed_ms:Number(c.wind_speed_10m),precipitation_mm:Number(c.precipitation),cloud_cover_pct:Number(c.cloud_cover)}; }
function localFallback() { return {ok:true,location:LOCATION,sectors:[],network:{stations:[]},generated_at:new Date().toISOString(),mode:"LOCAL-FALLBACK"}; }
async function diagnosticsOW() { const out={ok:false,source:"OpenWeather",hostname:"api.openweathermap.org",api_key_configured:Boolean(key()),phases:{}}; try { const a=await dns.lookup(out.hostname); out.phases.dns={ok:true,address:a.address}; } catch(e) { out.phases.dns={ok:false,message:e.message}; } try { out.phases.tcp=await new Promise(resolve=>{const s=net.createConnection({host:out.hostname,port:443}); const t=setTimeout(()=>{s.destroy();resolve({ok:false,message:"TCP timeout"})},5000); s.on("connect",()=>{clearTimeout(t);s.destroy();resolve({ok:true})}); s.on("error",e=>{clearTimeout(t);resolve({ok:false,message:e.message})});}); } catch(e){out.phases.tcp={ok:false,message:e.message};} try { out.phases.tls=await new Promise(resolve=>{const s=tls.connect({host:out.hostname,port:443,servername:out.hostname,rejectUnauthorized:true}); const t=setTimeout(()=>{s.destroy();resolve({ok:false,message:"TLS timeout"})},7000); s.on("secureConnect",()=>{clearTimeout(t);s.destroy();resolve({ok:true})}); s.on("error",e=>{clearTimeout(t);resolve({ok:false,message:e.message})});}); } catch(e){out.phases.tls={ok:false,message:e.message};} if(key()){try{out.phases.http=await openWeather();}catch(e){out.phases.http={ok:false,message:e.message,error_code:e.code||"OPENWEATHER_ERROR",http_status:e.status||null};}} else out.phases.http={ok:false,status:"not_configured",message:"OPENWEATHER_API_KEY não configurada."}; out.ok=Boolean(out.phases.dns?.ok&&out.phases.tcp?.ok&&out.phases.tls?.ok); return out; }
export default async function handler(req,res) {
  if(req.method==="OPTIONS") return json(res,204,{});
  const pathname=new URL(req.url||"/","http://localhost").pathname; const route="/"+pathname.replace(/^\/api\/?/,"").split("/").filter(Boolean).join("/");
  try {
    if(route==="/openweather"||route==="/openweather/current") return json(res,200,await openWeather());
    if(route==="/weather-comparison") { const [om,ow]=await Promise.allSettled([openMeteo(),openWeather()]); const a=om.status==="fulfilled"?om.value:null,b=ow.status==="fulfilled"?ow.value:null; const metrics=[['temperature_c','Temperatura','°C'],['apparent_temperature_c','Sensação térmica','°C'],['humidity_pct','Umidade','%'],['pressure_hpa','Pressão','hPa'],['wind_speed_ms','Vento','m/s'],['cloud_cover_pct','Nebulosidade','%']]; const comparison={}; for(const [k,l,u] of metrics){const x=Number(a?.[k]),y=Number(b?.[k]);comparison[k]={label:l,unit:u,open_meteo:Number.isFinite(x)?x:null,openweather:Number.isFinite(y)?y:null,absolute_difference:Number.isFinite(x)&&Number.isFinite(y)?Math.abs(x-y):null,relative_difference_pct:Number.isFinite(x)&&Number.isFinite(y)&&x!==0?Math.abs(x-y)/Math.abs(x)*100:null};} return json(res,200,{ok:Boolean(a||b),status:a&&b?"online":a?"degraded":"error",sources:{open_meteo:a,openweather:b},comparison,generated_at:new Date().toISOString()}); }
    if(route==="/diagnostics/openweather") return json(res,200,await diagnosticsOW());
    if(route==="/logs") return json(res,200,{ok:true,logs:memory.logs.slice(-100)});
    if(route==="/diagnostics") { let ow={configured:Boolean(key()),status:key()?"unknown":"not_configured"}; try{if(key()){const w=await openWeather();ow={configured:true,status:"online",http_status:w.http_status,latency_ms:w.latency_ms};}}catch(e){ow={configured:true,status:"error",message:e.message,error_code:e.code||"OPENWEATHER_ERROR"};log("error","OpenWeather",e.message,e.code);} return json(res,200,{ok:true,checks:{OpenWeather:ow,Gateway:{ok:true,status:"online"}},generated_at:new Date().toISOString()}); }
    if(route==="/settings/openweather") return json(res,200,{ok:true,configured:Boolean(key()),masked_key:mask(key()),source:"environment"});
    if(route==="/cams-radiation") { const p=new URLSearchParams({latitude:LOCATION.latitude,longitude:LOCATION.longitude,hourly:"shortwave_radiation,direct_radiation,diffuse_radiation,direct_normal_irradiance",timezone:LOCATION.timezone,forecast_days:2}); const r=await fetchJson(`https://api.open-meteo.com/v1/forecast?${p}`); return json(res,200,{ok:r.response.ok,status:"fallback",source:"Open-Meteo Solar",message:"Contingência operacional para CAMS.",data:r.payload}); }
    const upstreamRoutes=new Set(["/dashboard","/analytics","/solar","/air-quality","/sectors","/sensors","/report","/openapi","/weather","/health"]);
    if(upstreamRoutes.has(route)){ const u=await fetchJson(`${UPSTREAM_API}${route}`,{method:req.method||"GET"}); if(u.response.ok) return json(res,u.response.status,u.payload); return json(res,502,{ok:false,error_code:"UPSTREAM_UNAVAILABLE",message:u.payload?.detail||u.payload?.error||`Supabase indisponível para ${route}.`}); }
    return json(res,404,{ok:false,error_code:"NOT_FOUND",message:`Endpoint não encontrado: ${req.method} ${route}`});
  } catch(e) { log("error","Gateway",e.message,e.code||"GATEWAY_ERROR"); return json(res,e.status||502,{ok:false,error_code:e.code||"GATEWAY_ERROR",message:e.message}); }
}
