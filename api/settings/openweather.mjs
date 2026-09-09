const mask = (key) => key ? `${key.slice(0,4)}••••••••${key.slice(-4)}` : null;
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ ok:false, error_code:"METHOD_NOT_ALLOWED", message:"A OpenWeather é configurada exclusivamente por variável de ambiente. Use GET apenas para consultar o status." });
  }
  const key = String(process.env.OPENWEATHER_API_KEY || "").trim();
  return res.status(200).json({
    ok:true,
    configured:Boolean(key),
    masked_key:mask(key),
    source:"environment",
    message:key ? "OPENWEATHER_API_KEY configurada no ambiente do servidor." : "OPENWEATHER_API_KEY não configurada no ambiente do servidor."
  });
}
