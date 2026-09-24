(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const COLORS = {
    blue: "#248bd0",
    blueBright: "#42b9ff",
    cyan: "#31d3e8",
    orange: "#ff7315",
    amber: "#ffad1f",
    yellow: "#ffd86a",
    green: "#56d07b",
    red: "#ff5a4f",
    magenta: "#dd64ff",
    gray: "#71879a",
    panel: "#07111a",
  };

  const CONFIG = Object.freeze({
    apiBaseUrl: window.SIPIC_CONFIG?.apiBaseUrl || "",
    requestTimeoutMs: window.SIPIC_CONFIG?.requestTimeoutMs || 18000,
    automaticRefreshMs: window.SIPIC_CONFIG?.automaticRefreshMs || 600000,
    analyticsHours: window.SIPIC_CONFIG?.analyticsHours || 168,
  });

  const state = {
    currentPage: "overview",
    mapLayer: "surface",
    mapHour: 15,
    selectedSectorId: "centro",
    sessionStartedAt: Date.now(),
    dashboard: {
      air: 34.6,
      surface: 49.2,
      humidity: 31,
      wind: 1.8,
      uhi: 5.7,
      ndvi: 0.34,
      utci: 39.4,
    },
    api: {
      status: "connecting",
      dashboard: null,
      health: null,
      analytics: null,
      solar: null,
      cams: null,
      weatherComparison: null,
      latencyMs: null,
      lastLoadedAt: null,
      error: null,
    },
  };

  let sectors = [
    {
      id: "centro",
      code: "RP-CENTRO-04",
      name: "Centro / Quadrilátero Central",
      shortName: "Centro",
      x: 566,
      y: 338,
      surface: 51.8,
      air: 36.1,
      humidity: 25,
      ndvi: 0.19,
      uhi: 6.4,
      risk: "high",
      score: 94,
      drivers: ["Alta impermeabilização", "Baixa cobertura arbórea", "Ventilação urbana reduzida"],
    },
    {
      id: "leste",
      code: "RP-LESTE-02",
      name: "Zona Leste / Distrito Industrial",
      shortName: "Zona Leste",
      x: 818,
      y: 352,
      surface: 54.3,
      air: 36.8,
      humidity: 23,
      ndvi: 0.16,
      uhi: 6.7,
      risk: "high",
      score: 97,
      drivers: ["Grandes superfícies industriais", "Telhados de alta absorção", "Baixa evapotranspiração"],
    },
    {
      id: "campos",
      code: "RP-NORTE-07",
      name: "Campos Elíseos",
      shortName: "Campos Elíseos",
      x: 603,
      y: 224,
      surface: 49.9,
      air: 35.6,
      humidity: 27,
      ndvi: 0.24,
      uhi: 5.8,
      risk: "high",
      score: 88,
      drivers: ["Densidade edificada elevada", "Sombreamento vegetal irregular", "Armazenamento térmico noturno"],
    },
    {
      id: "oeste",
      code: "RP-OESTE-03",
      name: "Zona Oeste / Ipiranga",
      shortName: "Zona Oeste",
      x: 362,
      y: 352,
      surface: 47.4,
      air: 34.9,
      humidity: 30,
      ndvi: 0.29,
      uhi: 4.9,
      risk: "moderate",
      score: 73,
      drivers: ["Impermeabilização intermediária", "Ventilação variável", "Cobertura arbórea fragmentada"],
    },
    {
      id: "sul",
      code: "RP-SUL-05",
      name: "Zona Sul / Jardim Botânico",
      shortName: "Zona Sul",
      x: 620,
      y: 502,
      surface: 41.2,
      air: 32.8,
      humidity: 38,
      ndvi: 0.48,
      uhi: 3.1,
      risk: "moderate",
      score: 54,
      drivers: ["Maior cobertura vegetal", "Edificações espaçadas", "Melhor circulação local"],
    },
    {
      id: "norte",
      code: "RP-NORTE-01",
      name: "Zona Norte / Quintino Facci",
      shortName: "Zona Norte",
      x: 495,
      y: 142,
      surface: 46.8,
      air: 34.4,
      humidity: 29,
      ndvi: 0.27,
      uhi: 4.6,
      risk: "moderate",
      score: 69,
      drivers: ["Expansão urbana recente", "Solo exposto em trechos", "Vegetação descontínua"],
    },
    {
      id: "campus",
      code: "RP-OESTE-09",
      name: "Campus USP / Monte Alegre",
      shortName: "Campus USP",
      x: 292,
      y: 276,
      surface: 36.9,
      air: 31.2,
      humidity: 45,
      ndvi: 0.62,
      uhi: 1.7,
      risk: "low",
      score: 31,
      drivers: ["Cobertura vegetal elevada", "Sombreamento contínuo", "Maior umidade local"],
    },
    {
      id: "periurbano",
      code: "RP-REF-01",
      name: "Referência periurbana",
      shortName: "Periurbano",
      x: 932,
      y: 202,
      surface: 34.7,
      air: 29.9,
      humidity: 48,
      ndvi: 0.68,
      uhi: 0,
      risk: "low",
      score: 22,
      drivers: ["Baixa densidade construída", "Solo vegetado", "Boa circulação atmosférica"],
    },
  ];

  let sensorInventory = [
    ["RP-CENTRO-04", "Centro", "online", "há 3 s"],
    ["RP-LESTE-02", "Distrito Industrial", "online", "há 5 s"],
    ["RP-NORTE-07", "Campos Elíseos", "online", "há 4 s"],
    ["RP-OESTE-03", "Ipiranga", "online", "há 7 s"],
    ["RP-SUL-05", "Jardim Botânico", "online", "há 6 s"],
    ["RP-NORTE-01", "Quintino Facci", "warning", "há 38 s"],
    ["RP-OESTE-09", "Campus USP", "online", "há 4 s"],
    ["RP-REF-01", "Referência periurbana", "online", "há 8 s"],
    ["RP-LIDAR-03", "Corredor Sudeste", "offline", "há 17 min"],
    ["RP-RAD-06", "Zona Norte", "warning", "há 1 min"],
  ];

  function seededRandom(seed = 1) {
    let value = seed % 2147483647;
    if (value <= 0) value += 2147483646;
    return () => {
      value = (value * 16807) % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function pt(value, digits = 1) {
    return Number(value).toLocaleString("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showToast(title, message, type = "success") {
    const host = $("#toastContainer");
    if (!host) return;
    const readableMessage = message && typeof message === "object"
      ? (message.message || message.detail || message.error?.message || message.error || JSON.stringify(message))
      : String(message ?? "");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<i>${type === "success" ? "✓" : type === "warning" ? "!" : "i"}</i><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(readableMessage)}</span></div>`;
    host.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(12px)";
      setTimeout(() => toast.remove(), 220);
    }, 3600);
  }


  function setText(selector, value) {
    const element = $(selector);
    if (element && value !== undefined && value !== null) element.textContent = String(value);
  }

  function setAllText(selector, value) {
    if (value === undefined || value === null) return;
    $$(selector).forEach((element) => { element.textContent = String(value); });
  }

  function setBar(selector, percent) {
    const element = $(selector);
    if (element) element.style.setProperty("--w", `${clamp(Number(percent) || 0, 0, 100)}%`);
  }

  function formatAge(value) {
    if (!value) return "sem atualização";
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return "horário desconhecido";
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 10) return "agora";
    if (seconds < 60) return `há ${seconds} s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `há ${hours} h`;
    return `há ${Math.round(hours / 24)} d`;
  }

  function formatForecastTime(value, includeDate = true) {
    if (!value) return "horário indisponível";
    const normalized = /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}:00-03:00`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      ...(includeDate ? { weekday: "short", day: "2-digit", month: "2-digit" } : {}),
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function apiEndpoint(path = "") {
    const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    const suffix = path ? `/${String(path).replace(/^\//, "")}` : "";
    return `${base}${suffix}`;
  }

  async function apiFetch(path, options = {}) {
    if (!CONFIG.apiBaseUrl) throw new Error("A URL da API não foi configurada.");
    let lastError;
    const method = String(options.method || "GET").toUpperCase();
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    if (options.body !== undefined && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    for (let attempt = 0; attempt < (options.retry === false ? 1 : 2); attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
      try {
        const response = await fetch(apiEndpoint(path), { method, headers, body: options.body, cache: "no-store", signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok === false) {
          const detail = payload?.message
            || payload?.detail
            || payload?.error?.message
            || (typeof payload?.error === "string" ? payload.error : "")
            || (payload && typeof payload === "object" ? JSON.stringify(payload) : "")
            || `A API respondeu com HTTP ${response.status}.`;
          const error = new Error(String(detail));
          error.status = response.status;
          error.code = payload?.error_code || (typeof payload?.error === "string" ? payload.error : "") || "api_error";
          error.payload = payload;
          throw error;
        }
        return payload;
      } catch (error) {
        lastError = error?.name === "AbortError" ? new Error("A API excedeu o tempo limite de resposta.") : error;
        if (attempt === 0 && options.retry !== false) await new Promise((resolve) => setTimeout(resolve, 700));
      } finally { clearTimeout(timeout); }
    }
    throw lastError;
  }

  function statusLabel(status) {
    const labels = {
      online: "ONLINE",
      fresh: "ONLINE",
      stale: "CACHE",
      degraded: "DEGRADADO",
      reference_only: "REFERÊNCIA",
      configured: "CONFIGURADO",
      fallback: "CONTINGÊNCIA",
      not_configured: "NÃO CONFIGURADO",
      offline: "OFFLINE",
      error: "ERRO",
    };
    return labels[status] || String(status || "--").toUpperCase();
  }

  function setSourceBadge(selector, status) {
    const element = $(selector);
    if (!element) return;
    element.classList.remove("live", "online", "stale", "degraded", "offline", "error");
    const normalized = status === "fresh" ? "online" : ["reference_only", "fallback", "not_configured"].includes(status) ? "degraded" : status;
    if (["online", "stale", "degraded", "offline", "error"].includes(normalized)) {
      element.classList.add(normalized);
    }
    element.textContent = statusLabel(status);
  }

  function explanationToDriver(item) {
    const labels = {
      impermeabilização: "Impermeabilização intensifica o armazenamento de calor",
      "vegetação/NDVI": "Vegetação e NDVI produzem arrefecimento",
      ventilação: "Ventilação altera a dissipação térmica",
      "radiação solar": "Radiação solar aumenta o ganho térmico superficial",
    };
    const factor = item?.factor || "morfologia urbana";
    const contribution = Number(item?.contribution);
    const suffix = Number.isFinite(contribution)
      ? ` (${contribution > 0 ? "+" : ""}${pt(contribution, 1)} °C no índice do modelo)`
      : "";
    return `${labels[factor] || factor}${suffix}`;
  }

  function syncSectorsFromApi(rows = []) {
    if (!Array.isArray(rows) || !rows.length) return;
    sectors = sectors.map((sector) => {
      const live = rows.find((item) => item.code === sector.code);
      if (!live) return sector;
      const rawRisk = String(live.risk_level || "low");
      return {
        ...sector,
        name: live.name || sector.name,
        shortName: live.name?.split(" /")[0] || sector.shortName,
        latitude: Number(live.latitude),
        longitude: Number(live.longitude),
        surface: Number(live.surface_temperature_c ?? sector.surface),
        air: Number(live.air_temperature_c ?? sector.air),
        humidity: Number(live.relative_humidity_pct ?? sector.humidity),
        ndvi: Number(live.ndvi ?? sector.ndvi),
        uhi: Number(live.urban_heat_island_c ?? sector.uhi),
        risk: rawRisk === "critical" ? "high" : rawRisk,
        rawRisk,
        score: Math.round(Number(live.risk_score ?? sector.score)),
        confidence: Number(live.confidence_pct ?? 0),
        drivers: Array.isArray(live.explanations) && live.explanations.length
          ? live.explanations.map(explanationToDriver)
          : sector.drivers,
      };
    });
  }

  function syncSensorsFromApi(stations = []) {
    if (!Array.isArray(stations) || !stations.length) return;
    sensorInventory = stations.map((station) => [
      station.code,
      station.name,
      station.status || "offline",
      formatAge(station.last_seen_at),
    ]);
  }

  function peakForecast(timeline = []) {
    if (!Array.isArray(timeline) || !timeline.length) return null;
    return [...timeline].sort(
      (a, b) => Number(b.apparent_temperature_c ?? b.air_temperature_c ?? -999) - Number(a.apparent_temperature_c ?? a.air_temperature_c ?? -999),
    )[0];
  }

  function renderOperationalEnhancements() {
    const data = state.api.dashboard;
    const current = data?.current;
    if (!current) return;
    const risk = String(current.risk_level || "monitoring").toLowerCase();
    const labels = { critical: "ALERTA CRÍTICO", high: "ALERTA", moderate: "ATENÇÃO", low: "MONITORANDO", monitoring: "MONITORANDO" };
    const alertCard = $("#operationalAlertCard");
    alertCard?.classList.remove("risk-critical", "risk-high", "risk-moderate", "risk-low");
    alertCard?.classList.add(`risk-${risk}`);
    setText("#operationalAlertLevel", labels[risk] || "MONITORANDO");
    setText("#operationalAlertTitle", data.alerts?.[0]?.title || current.risk_label || "Monitoramento ativo");
    setText("#operationalAlertText", data.alerts?.[0]?.message || "O sistema continua acompanhando temperatura, umidade, vento e condições dos setores.");
    setText("#operationalFreshness", data.generated_at ? formatAge(data.generated_at) : "--");
    setText("#operationalFreshnessDetail", data.generated_at ? `Ciclo gerado em ${formatForecastTime(data.generated_at, false)}` : "Ciclo ainda não carregado");
    const sourceTotal = data.sources?.length || 0;
    const sourceOnline = (data.sources || []).filter(x => !["offline", "error", "degraded"].includes(x.status)).length;
    const db = data.sources?.find(x => x.id === "supabase");
    const health = Number(data.network?.health_pct ?? 0);
    setText("#operationalSystemHealth", health ? `${pt(health, 0)}% operacional` : `${sourceOnline}/${sourceTotal} fontes`);
    setText("#operationalSystemDetail", `${sourceOnline}/${sourceTotal} fontes · banco ${db?.status === "online" ? "online" : statusLabel(db?.status)}`);
    setText("#healthApiCard", state.api.status === "online" ? "ONLINE" : "CONTINGÊNCIA");
    setText("#healthApiDetail", state.api.latencyMs !== null ? `${Math.round(state.api.latencyMs)} ms` : "aguardando resposta");
    setText("#healthDbCard", db?.status === "online" ? "ONLINE" : statusLabel(db?.status));
    setText("#healthDbDetail", `${data.network?.total ?? 0} estações catalogadas`);
    setText("#healthSourcesCard", `${sourceOnline}/${sourceTotal}`);
    setText("#healthSourcesDetail", sourceTotal ? "fontes operacionais" : "aguardando ciclo");
    setText("#healthModelCard", data.model_version || "SIPIC-Hybrid");
    setText("#healthModelDetail", data.forecast ? `${data.forecast.horizon_hours ?? 48} h de horizonte` : "aguardando previsão");
    const badge = $("#systemHealthBadge");
    if (badge) { badge.className = "system-health-badge"; badge.classList.add(sourceOnline === sourceTotal ? "good" : "partial"); badge.textContent = sourceOnline === sourceTotal ? "OPERACIONAL" : "ATENÇÃO"; }

    const timeline = data.forecast?.city_timeline || [];
    const six = timeline.slice(0, 6);
    const host = $("#sixHourForecast");
    if (host && six.length) host.innerHTML = six.map((row, i) => `<div><span>${formatForecastTime(row.time, false) || `+${i}h`}</span><strong>${pt(row.air_temperature_c ?? row.apparent_temperature_c, 1)}°</strong><small>${statusLabel(row.risk_level || "moderate")}</small></div>`).join("");

    setText("#driverTemp", `${pt(current.air_temperature_c, 1)} °C`);
    setText("#driverHumidity", `${pt(current.relative_humidity_pct, 0)}%`);
    setText("#driverWind", `${pt(current.wind_speed_ms, 1)} m/s`);
    setText("#driverVegetation", `${pt(current.ndvi, 2)} NDVI`);
    const vegetationText = Number(current.ndvi) < 0.3 ? "baixa cobertura vegetal" : "cobertura vegetal moderada";
    setText("#driverExplanation", `Temperatura de ${pt(current.air_temperature_c, 1)} °C, umidade de ${pt(current.relative_humidity_pct, 0)}% e vento de ${pt(current.wind_speed_ms, 1)} m/s compõem o contexto atual; o setor apresenta ${vegetationText}.`);
  }

  const demoState = {
    timer: null,
    steps: [],
    currentIndex: -1,
    speed: 1,
    hasSimulated: false,
  };

  function toLocalInputValue(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function demoDefaultRange() {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 5 * 60 * 60 * 1000);
    return { start, end };
  }

  function readDemoDate(id) {
    const value = $(id)?.value;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getDemoSpeed() {
    const selected = $('input[name="demoSpeed"]:checked');
    const speed = Number(selected?.value || 1);
    return [0.5, 1, 2, 5].includes(speed) ? speed : 1;
  }

  function demoStatus(value) {
    if (value >= 38) return { label: "ALERTA", cls: "alert" };
    if (value >= 35) return { label: "ATENÇÃO", cls: "attention" };
    return { label: "NORMAL", cls: "normal" };
  }

  function buildDemoSteps(start, end) {
    const hours = Math.max(1, Math.round((end - start) / 3600000));
    const count = Math.min(hours + 1, 169);
    const effectiveHours = Math.max(1, count - 1);
    return Array.from({ length: count }, (_, i) => {
      const progress = effectiveHours ? i / effectiveHours : 0;
      const wave = Math.sin(progress * Math.PI);
      const temperature = 30.8 + progress * 5.8 + wave * 2.8;
      const humidity = Math.max(24, Math.round(52 - progress * 17));
      const wind = Math.max(0.8, 2.9 - progress * 1.2);
      const heatIndex = temperature + Math.max(0, (45 - humidity) * 0.045);
      const time = new Date(start.getTime() + Math.round((end - start) * progress));
      return { time, temperature, humidity, wind, heatIndex, risk: demoStatus(temperature) };
    });
  }

  function formatDemoDate(date) {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function validateDemoRange() {
    const start = readDemoDate("#demoStart");
    const end = readDemoDate("#demoEnd");
    const validation = $("#demoValidation");
    if (!start || !end) {
      if (validation) validation.textContent = "Selecione a data e o horário de início e fim.";
      return null;
    }
    if (end <= start) {
      if (validation) validation.textContent = "O horário final precisa ser posterior ao horário inicial.";
      return null;
    }
    const hours = (end - start) / 3600000;
    if (hours > 168) {
      if (validation) validation.textContent = "Escolha um intervalo de até 7 dias para a demonstração.";
      return null;
    }
    if (validation) validation.textContent = "";
    return { start, end, hours };
  }

  function renderDemoSequence(steps, reveal = demoState.hasSimulated) {
    const host = $("#demoSequence");
    if (!host) return;
    const visible = steps.length <= 12 ? steps : steps.filter((_, i) => i === 0 || i === steps.length - 1 || i % Math.ceil(steps.length / 10) === 0).slice(0, 12);
    if (!reveal) {
      const count = Math.max(1, Math.min(12, steps.length || 6));
      host.innerHTML = Array.from({ length: count }, (_, i) => `<div class="demo-step demo-step-placeholder"><span>--:--</span><strong>0,0°C</strong><b><i style="--w:0%"></i></b><small>AGUARDANDO</small></div>`).join("");
      return;
    }
    host.innerHTML = visible.map((row) => {
      const width = Math.min(100, Math.max(10, ((row.temperature - 28) / 16) * 100));
      return `<div class="demo-step" data-demo-time="${row.time.getTime()}"><span>${row.time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span><strong>${row.temperature.toFixed(1).replace(".", ",")}°C</strong><b><i style="--w:${width}%"></i></b><small>${row.risk.label}</small></div>`;
    }).join("");
  }

  function updateDemoSummary(range) {
    const summary = $("#demoRangeSummary");
    if (!summary || !range) return;
    const duration = range.hours < 24 ? `${Math.round(range.hours)} h` : `${(range.hours / 24).toFixed(1).replace(".", ",")} dias`;
    summary.innerHTML = `<strong>Intervalo selecionado:</strong> ${formatDemoDate(range.start)} → ${formatDemoDate(range.end)} <span>·</span> <strong>Duração:</strong> ${duration} <span>·</span> <strong>Passo:</strong> 1 h`;
  }

  function setDemoActiveStep(index) {
    demoState.currentIndex = index;
    const steps = demoState.steps;
    const progress = $("#demoProgressBar");
    const status = $("#demoLiveStatus");
    const visualSteps = $$(".demo-step");
    visualSteps.forEach((el) => el.classList.remove("is-active"));
    if (!demoState.hasSimulated) {
      if (progress) progress.style.width = "0%";
      if (status) status.textContent = "Aguardando simulação. Os indicadores permanecerão em 0 até clicar em Simular onda de calor.";
      return;
    }
    const row = steps[index];
    if (!row) {
      if (progress) progress.style.width = "0%";
      if (status) status.textContent = "Cenário carregado. Clique em Iniciar simulação para reproduzir a sequência.";
      return;
    }
    const match = visualSteps.find((el) => Number(el.dataset.demoTime) === row.time.getTime());
    if (match) match.classList.add("is-active");
    const pct = steps.length > 1 ? (index / (steps.length - 1)) * 100 : 100;
    if (progress) progress.style.width = `${pct}%`;
    if (status) status.innerHTML = `<strong>${formatDemoDate(row.time)}</strong> · ${row.temperature.toFixed(1).replace(".", ",")} °C · umidade ${row.humidity}% · vento ${row.wind.toFixed(1).replace(".", ",")} m/s · índice de calor ${row.heatIndex.toFixed(1).replace(".", ",")} °C · <b>${row.risk.label}</b>`;
  }

  function stopDemoTimer() {
    if (demoState.timer) {
      clearInterval(demoState.timer);
      demoState.timer = null;
    }
  }

  function prepareDemo() {
    const range = validateDemoRange();
    if (!range) return false;
    stopDemoTimer();
    demoState.speed = getDemoSpeed();
    demoState.steps = buildDemoSteps(range.start, range.end);
    renderDemoSequence(demoState.steps, demoState.hasSimulated);
    updateDemoSummary(range);
    setDemoActiveStep(-1);
    const button = $("#playDemoButton");
    if (button) button.innerHTML = '<svg class="icon"><use href="#i-play"></use></svg>Iniciar simulação';
    return true;
  }

  function openDemoModal() {
    const modal = $("#demoModal");
    if (!modal) return;
    const defaults = demoDefaultRange();
    const startInput = $("#demoStart");
    const endInput = $("#demoEnd");
    if (startInput && !startInput.value) startInput.value = toLocalInputValue(defaults.start);
    if (endInput && !endInput.value) endInput.value = toLocalInputValue(defaults.end);
    demoState.hasSimulated = false;
    $("#demoValidation") && ($("#demoValidation").textContent = "");
    prepareDemo();
    const status = $("#demoLiveStatus");
    if (status) status.textContent = "Aguardando simulação. Os indicadores permanecerão em 0 até clicar em Simular onda de calor.";
    modal.hidden = false;
    document.body.classList.add("demo-open");
  }

  function closeDemoModal() {
    const modal = $("#demoModal");
    stopDemoTimer();
    if (modal) modal.hidden = true;
    document.body.classList.remove("demo-open");
  }

  function playDemoSequence() {
    const range = validateDemoRange();
    if (!range) return;
    demoState.hasSimulated = true;
    if (!demoState.steps.length || demoState.currentIndex < 0 || demoState.currentIndex >= demoState.steps.length - 1) {
      demoState.speed = getDemoSpeed();
      demoState.steps = buildDemoSteps(range.start, range.end);
      renderDemoSequence(demoState.steps);
      updateDemoSummary(range);
      demoState.currentIndex = -1;
    }
    const button = $("#playDemoButton");
    if (demoState.timer) return;
    if (button) button.innerHTML = '<svg class="icon"><use href="#i-pause"></use></svg>Pausar simulação';
    let index = Math.max(0, demoState.currentIndex + 1);
    setDemoActiveStep(index);
    const delay = Math.max(220, Math.round(900 / demoState.speed));
    demoState.timer = setInterval(() => {
      index += 1;
      if (index >= demoState.steps.length) {
        stopDemoTimer();
        setDemoActiveStep(demoState.steps.length - 1);
        if (button) button.innerHTML = '<svg class="icon"><use href="#i-refresh"></use></svg>Reproduzir novamente';
        return;
      }
      setDemoActiveStep(index);
    }, delay);
  }

  function resetDemoSequence() {
    stopDemoTimer();
    prepareDemo();
  }

  function simulateHeatwaveRange() {
    const defaults = demoDefaultRange();
    const end = new Date(defaults.start.getTime() + 8 * 60 * 60 * 1000);
    const startInput = $("#demoStart");
    const endInput = $("#demoEnd");
    if (startInput) startInput.value = toLocalInputValue(defaults.start);
    if (endInput) endInput.value = toLocalInputValue(end);
    demoState.hasSimulated = true;
    prepareDemo();
    const status = $("#demoLiveStatus");
    if (status) status.textContent = "Cenário de onda de calor carregado. Os indicadores foram liberados. Clique em Iniciar simulação para reproduzir a sequência.";
  }

  function renderApiStatus() {
    const data = state.api.dashboard;
    const health = state.api.health;
    const badge = $("#dataModeBadge");
    if (badge) {
      badge.classList.remove("live", "stale", "error");
      if (state.api.status === "online") {
        const localReference = data?.data_status === "local_reference";
        badge.classList.add((data?.data_status === "live_with_stale_cache" || localReference) ? "stale" : "live");
        badge.innerHTML = `<i></i>${localReference ? "REFERÊNCIA LOCAL · API REMOTA INDISPONÍVEL" : data?.data_status === "live_with_stale_cache" ? "DADOS EM CACHE" : data?.data_status === "live_direct_sources" ? "DADOS AO VIVO · FONTES DIRETAS" : "DADOS AO VIVO + CALCULADOS"}`;
      } else if (state.api.status === "error") {
        badge.classList.add("error");
        badge.innerHTML = "<i></i>MODO DE CONTINGÊNCIA";
      } else {
        badge.innerHTML = "<i></i>CONECTANDO À API";
      }
    }

    setText("#apiBaseUrl", CONFIG.apiBaseUrl || "não configurada");
    setText("#apiHealthStatus", health?.ok ? "ONLINE" : state.api.status === "error" ? "ERRO" : "CONECTANDO");
    setText("#apiHealthLatency", state.api.latencyMs !== null ? `${Math.round(state.api.latencyMs)} ms no navegador` : "--");
    setText("#apiDatabaseStatus", health?.database?.status ? statusLabel(health.database.status) : "--");
    setText("#apiDatabaseCounts", health?.database ? `${health.database.sectors ?? 0} setores · ${health.database.stations ?? 0} estações` : "--");
    setText("#apiCacheStatus", Array.isArray(health?.cache) ? `${health.cache.length} entradas` : "--");
    const newestCache = Array.isArray(health?.cache) ? health.cache[0] : null;
    setText("#apiCacheDetails", newestCache ? `${statusLabel(newestCache.status)} · ${formatAge(newestCache.fetched_at)}` : "aguardando primeiro ciclo");
    setText("#apiModelStatus", data?.model_version || health?.model_version || "--");
    setText("#apiModelDetails", data?.forecast ? `${data.forecast.horizon_hours} h · modelo híbrido` : "--");

    const sourceById = new Map((data?.sources || []).map((source) => [source.id, source]));
    setSourceBadge("#sourceWeatherStatus", sourceById.get("open_meteo_weather")?.status || (state.api.status === "error" ? "error" : "configured"));
    setSourceBadge("#sourceOpenWeatherStatus", sourceById.get("openweather")?.status || "configured");
    setSourceBadge("#sourceMeteomaticsStatus", sourceById.get("meteomatics")?.status || "configured");
    setSourceBadge("#sourceAirStatus", sourceById.get("open_meteo_air")?.status || (state.api.status === "error" ? "error" : "configured"));
    setSourceBadge("#sourceDatabaseStatus", sourceById.get("supabase")?.status || (health?.database?.status || "configured"));
    setSourceBadge("#sourceNasaStatus", state.api.solar?.ok ? (state.api.solar.stale ? "stale" : "online") : "configured");
    setSourceBadge("#sourceCamsStatus", state.api.cams?.status || "configured");

    const sourceCount = data?.sources?.length || 0;
    const sourceOnline = (data?.sources || []).filter((source) => ["online", "reference_only"].includes(source.status)).length;
    setText("#sidebarSourcesOnline", sourceCount ? `${sourceOnline} / ${sourceCount}` : "--");
    const preferred = data?.weather_observations?.preferred || "Open-Meteo";
    setText("#telemetryWeatherSource", preferred);
    setText("#sidebarApiLatency", state.api.latencyMs !== null ? `${Math.round(state.api.latencyMs)} ms` : "--");
    setText("#sidebarLastCycle", data?.generated_at ? formatAge(data.generated_at) : "--");
    setText("#telemetryFreshness", data?.generated_at ? formatAge(data.generated_at) : "--");
  }

  function renderLiveDashboard() {
    const data = state.api.dashboard;
    if (!data?.current) return;
    const current = data.current;
    state.dashboard.air = Number(current.air_temperature_c ?? state.dashboard.air);
    state.dashboard.surface = Number(current.surface_temperature_c ?? state.dashboard.surface);
    state.dashboard.humidity = Math.round(Number(current.relative_humidity_pct ?? state.dashboard.humidity));
    state.dashboard.wind = Number(current.wind_speed_ms ?? state.dashboard.wind);
    state.dashboard.uhi = Number(current.urban_heat_island_c ?? state.dashboard.uhi);
    state.dashboard.ndvi = Number(current.ndvi ?? state.dashboard.ndvi);
    state.dashboard.utci = Number(current.apparent_temperature_c ?? state.dashboard.utci);

    syncSectorsFromApi(data.sectors);
    syncSensorsFromApi(data.network?.stations);
    updateDashboardValues();
    renderHeatMap();
    renderHotspotList();
    selectSector(state.selectedSectorId);
    renderPredictionLists();
    renderForecastEvents();
    renderFeatureImportance();
    renderAnalyticsKpis();
    renderSensorNetwork();
    renderSensorInventory();

    const confidence = Number(current.confidence_pct ?? 0);
    const healthPct = Number(data.network?.health_pct ?? 0);
    setText("#sidebarDataIntegrity", confidence ? `${pt(confidence, 1)}%` : "--");
    setText(".health-gauge-ring span", healthPct ? `${pt(healthPct, 1)}%` : "--");
    setAllText(".sensor-online-count-value", `${data.network?.online ?? 0} / ${data.network?.total ?? 0}`);
    setText("#utciValue", `${pt(current.apparent_temperature_c, 1)} °C`);
    setText("#heatRiskLabel", current.risk_label || current.risk_level || "--");
    setText("#pm25Value", data.air_quality?.pm25_ugm3 === null || data.air_quality?.pm25_ugm3 === undefined ? "N/D" : `${pt(data.air_quality.pm25_ugm3, 1)} µg/m³`);
    setText("#pm25Label", data.air_quality?.aqi_classification?.label || "modelo regional");
    setText("#aqiValue", data.air_quality?.us_aqi ?? "N/D");
    setText("#aqiLabel", data.air_quality?.aqi_classification?.label || "não disponível");
    setText("#solarRadiationValue", current.shortwave_radiation_wm2 === null || current.shortwave_radiation_wm2 === undefined ? "N/D" : `${pt(current.shortwave_radiation_wm2, 0)} W/m²`);
    setText("#solarRadiationLabel", "Open-Meteo · radiação solar de onda curta");
    setText("#predictionConfidence", confidence ? `${pt(confidence, 1)}%` : "--%");
    setText("#modelConfidenceScore", confidence ? `${pt(confidence, 1)}%` : "--%");
    setText("#modelHorizon", `${data.forecast?.horizon_hours ?? 48} h`);
    setText("#modelSectorCount", data.sectors?.length ?? sectors.length);
    setText("#modelVersionLabel", data.model_version || "SIPIC-Hybrid v1.0");
    setText("#modelValidationStatus", "Aguardando sensores");

    const peak = peakForecast(data.forecast?.city_timeline);
    if (peak) {
      setText("#predictionPeak", `${pt(peak.apparent_temperature_c ?? peak.air_temperature_c, 1)} °C · ${formatForecastTime(peak.time)}`);
      const peakBadge = $("#riskPeakBadge");
      if (peakBadge) {
        const level = peak.risk_level || "moderate";
        peakBadge.className = `risk-badge ${level === "critical" ? "high" : level}`;
        peakBadge.textContent = `${statusLabel(level)} · ${formatForecastTime(peak.time, false)}`;
      }
    }

    const alert = data.alerts?.[0];
    if (alert) {
      setText("#alertLevelLabel", alert.level === "critical" ? "ALERTA CRÍTICO" : "NÍVEL DE ATENÇÃO");
      setText("#alertTitle", alert.title);
      setText("#alertMessage", alert.message);
    } else {
      setText("#alertLevelLabel", "MONITORAMENTO ATIVO");
      setText("#alertTitle", "Nenhum alerta térmico elevado nas próximas horas");
      setText("#alertMessage", "O sistema continua a acompanhar a previsão e os parâmetros morfológicos dos setores.");
    }

    const totalSources = data.sources?.length || 0;
    const healthySources = (data.sources || []).filter((source) => !["degraded", "offline", "error"].includes(source.status)).length;
    const sourcePct = totalSources ? (healthySources / totalSources) * 100 : 0;
    const stationPct = Number(data.network?.health_pct ?? 0);
    setText("#qualitySources", totalSources ? `${healthySources} / ${totalSources}` : "--");
    setBar("#qualitySourcesBar", sourcePct);
    setText("#qualityStations", `${data.network?.online ?? 0} / ${data.network?.total ?? 0}`);
    setBar("#qualityStationsBar", stationPct);
    setText("#qualityLatency", state.api.latencyMs !== null ? `${Math.round(state.api.latencyMs)} ms` : "--");
    setBar("#qualityLatencyBar", state.api.latencyMs === null ? 0 : clamp(100 - state.api.latencyMs / 25, 10, 100));
    const dbSource = data.sources?.find((source) => source.id === "supabase");
    setText("#qualityDatabase", dbSource?.status === "online" ? "Operacional" : statusLabel(dbSource?.status));
    setBar("#qualityDatabaseBar", dbSource?.status === "online" ? 100 : 55);

    const sourceMap = new Map((data.sources || []).map((source) => [source.id, source.status]));
    const weatherOnline = ["online", "stale"].includes(sourceMap.get("open_meteo_weather"));
    const airOnline = ["online", "stale"].includes(sourceMap.get("open_meteo_air"));
    setText("#sensorBarWeatherValue", weatherOnline ? "1 / 1" : "0 / 1");
    setBar("#sensorBarWeather", weatherOnline ? 100 : 0);
    setText("#sensorBarAirValue", airOnline ? "1 / 1" : "0 / 1");
    setBar("#sensorBarAir", airOnline ? 100 : 0);
    setText("#sensorBarSectorsValue", `${data.sectors?.length ?? 0} / 8`);
    setBar("#sensorBarSectors", ((data.sectors?.length ?? 0) / 8) * 100);
    setText("#sensorBarDatabaseValue", dbSource?.status === "online" ? "1 / 1" : "0 / 1");
    setBar("#sensorBarDatabase", dbSource?.status === "online" ? 100 : 0);
    const physicalStations = (data.network?.stations || []).filter((station) => station.station_type === "physical_sensor");
    const physicalOnline = physicalStations.filter((station) => station.status === "online").length;
    setText("#sensorBarPhysicalValue", physicalStations.length ? `${physicalOnline} / ${physicalStations.length}` : "API pronta");
    setBar("#sensorBarPhysical", physicalStations.length ? (physicalOnline / physicalStations.length) * 100 : 20);

    renderOperationalEnhancements();
    renderApiStatus();
    renderVisibleCharts();
  }

  async function testApiHealth(showFeedback = false) {
    const started = performance.now();
    try {
      const health = await apiFetch("/health", { noCache: true });
      state.api.health = health;
      if (state.api.latencyMs === null) state.api.latencyMs = performance.now() - started;
      renderApiStatus();
      if (showFeedback) showToast("API operacional", `Banco e API responderam em ${Math.round(performance.now() - started)} ms.`);
      return health;
    } catch (error) {
      renderApiStatus();
      if (showFeedback) showToast("Falha no teste da API", error.message, "warning");
      return null;
    }
  }

  async function loadAnalyticsData() {
    try {
      state.api.analytics = await apiFetch(`/analytics?hours=${CONFIG.analyticsHours}`);
      renderAnalyticsKpis();
      if (state.currentPage === "analytics") renderAnalyticsCharts();
    } catch (error) {
      console.warn("analytics unavailable", error);
    }
  }

  async function loadSolarData() {
    try {
      state.api.solar = await apiFetch("/solar");
      renderSolarData();
    } catch (error) {
      console.warn("Open-Meteo solar unavailable", error);
    } finally {
      renderApiStatus();
    }
  }

  async function loadCamsData() {
    try {
      state.api.cams = await apiFetch("/cams-radiation");
      renderCamsData();
    } catch (error) {
      state.api.cams = { ok: false, status: "error", message: error.message };
      console.warn("CAMS radiation unavailable", error);
    } finally {
      renderApiStatus();
    }
  }


  function renderWeatherComparison() {
    const data = state.api.weatherComparison;
    if (!data) return;
    setText("#comparisonMetricCount", String(data.summary?.comparable_metrics ?? 0));
    setText("#comparisonMeanDiff", data.summary?.mean_relative_difference_pct != null ? `${pt(data.summary.mean_relative_difference_pct, 2)} %` : "--");
    setText("#comparisonInterpretation", data.summary?.interpretation || "--");
    setText("#comparisonMethodology", `Metodologia: ${data.methodology || "comparação entre fontes independentes"}`);
    const body = $("#weatherComparisonBody");
    if (!body) return;
    const rows = Object.values(data.comparison || {});
    body.innerHTML = rows.length ? rows.map((m) => {
      const fmt = (v) => v == null ? "N/D" : `${pt(v, 2)} ${m.unit || ""}`;
      const diff = m.absolute_difference == null ? "N/D" : `${pt(m.absolute_difference, 2)} ${m.unit || ""}`;
      const rel = m.relative_difference_pct == null ? "N/D" : `${pt(m.relative_difference_pct, 2)} %`;
      return `<tr><td>${m.label}</td><td>${fmt(m.open_meteo)}</td><td>${fmt(m.openweather)}</td><td>${diff}</td><td>${rel}</td></tr>`;
    }).join("") : '<tr><td colspan="5">Nenhuma variável pôde ser comparada.</td></tr>';
  }

  async function loadWeatherComparison(showFeedback = false) {
    try {
      const comparison = await apiFetch("/weather-comparison", { noCache: true });
      state.api.weatherComparison = comparison;
      renderWeatherComparison();
      if (showFeedback) {
        const bothOnline = comparison.sources?.open_meteo?.status === "online" && comparison.sources?.openweather?.status === "online";
        showToast(bothOnline ? "Comparação atualizada" : "Comparação em modo degradado", bothOnline ? `${comparison.summary?.comparable_metrics ?? 0} métricas comparáveis entre as duas fontes.` : "Uma ou mais fontes externas não responderam; o console mostra o motivo.", bothOnline ? "info" : "warning");
      }
      return comparison;
    } catch (error) {
      state.api.weatherComparison = null;
      const body = $("#weatherComparisonBody");
      if (body) body.innerHTML = `<tr><td colspan="5">Falha na comparação: ${String(error.message).replace(/[<>]/g, "")}</td></tr>`;
      if (showFeedback) showToast("Comparação indisponível", error.message, "warning");
      throw error;
    }
  }

  async function loadOpenWeatherKeyStatus() {
    try {
      const result = await apiFetch("/settings/openweather", { retry: false, noCache: true });
      setSourceBadge("#sourceOpenWeatherStatus", result?.configured ? "online" : "not_configured");
    } catch (error) {
      console.warn("OpenWeather key status unavailable", error);
    }
  }

  async function loadDashboardData(force = false, announce = false) {
    if (state.api.loading) return state.api.loading;
    const task = (async () => {
      const started = performance.now();
      state.api.status = "connecting";
      state.api.error = null;
      renderApiStatus();
      $("#refreshDashboardButton")?.classList.add("is-loading");
      $("#runPredictionButton")?.classList.add("is-loading");
      try {
        const dashboard = await apiFetch(`/dashboard${force ? "?refresh=1" : ""}`, { noCache: force });
        state.api.dashboard = dashboard;
        state.api.status = "online";
        state.api.latencyMs = performance.now() - started;
        state.api.lastLoadedAt = new Date().toISOString();
        renderLiveDashboard();
        void testApiHealth(false);
        void loadAnalyticsData();
        void loadSolarData();
        void loadCamsData();
        void loadWeatherComparison(false).catch(() => {});
        if (announce) {
          const localReference = dashboard?.data_status === "local_reference";
          showToast(
            localReference ? "Referência local ativa" : (force ? "Ciclo atualizado" : "API conectada"),
            localReference ? "A API remota está indisponível; o painel continua funcional em modo de referência científica local." : (force ? "As fontes externas, o modelo e o banco foram atualizados." : "O painel passou a utilizar dados ao vivo e valores calculados."),
            localReference ? "info" : undefined,
          );
        }
        return dashboard;
      } catch (error) {
        state.api.status = "error";
        state.api.error = error.message;
        renderApiStatus();
        updateDashboardValues();
        if (announce || force) showToast("Não foi possível atualizar", `${error.message} Os valores de contingência foram mantidos.`, "warning");
        throw error;
      } finally {
        state.api.loading = null;
        $("#refreshDashboardButton")?.classList.remove("is-loading");
        $("#runPredictionButton")?.classList.remove("is-loading");
      }
    })();
    state.api.loading = task;
    return task;
  }

  function setPage(pageId, updateHash = true) {
    const page = $(`#page-${pageId}`);
    if (!page) return;

    $$(".app-page").forEach((item) => item.classList.toggle("active", item === page));
    $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === pageId));
    $$(".mobile-nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === pageId));
    state.currentPage = pageId;

    if (updateHash) history.replaceState(null, "", `#${pageId}`);
    $("#mainContent")?.scrollTo({ top: 0, behavior: "smooth" });
    closeMobileSidebar();

    const title = page.dataset.title || "SIPIC-RP";
    document.title = `${title} — SIPIC-RP`;
    requestAnimationFrame(renderVisibleCharts);
  }

  function openMobileSidebar() {
    const sidebar = $("#sidebar");
    const backdrop = $("#sidebarBackdrop");
    const button = $("#mobileMenuButton");
    if (!sidebar || !backdrop || !button) return;
    sidebar.classList.add("open");
    backdrop.hidden = false;
    button.setAttribute("aria-expanded", "true");
  }

  function closeMobileSidebar() {
    const sidebar = $("#sidebar");
    const backdrop = $("#sidebarBackdrop");
    const button = $("#mobileMenuButton");
    if (!sidebar || !backdrop || !button) return;
    sidebar.classList.remove("open");
    backdrop.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function updateClocks() {
    const elapsed = Math.floor((Date.now() - state.sessionStartedAt) / 1000);
    const hours = String(Math.floor(elapsed / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
    const seconds = String(elapsed % 60).padStart(2, "0");
    const mission = $("#missionTime");
    if (mission) mission.textContent = `${hours}:${minutes}:${seconds}`;

    const local = $("#localTime");
    if (local) {
      local.textContent = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date());
    }
  }

  function pathFromData(data, width, height, padding, minValue, maxValue) {
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    return data
      .map((value, index) => {
        const x = padding.left + (index / Math.max(1, data.length - 1)) * innerWidth;
        const y = padding.top + (1 - (value - minValue) / Math.max(0.0001, maxValue - minValue)) * innerHeight;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }

  function areaPathFromData(data, width, height, padding, minValue, maxValue) {
    const line = pathFromData(data, width, height, padding, minValue, maxValue);
    const innerWidth = width - padding.left - padding.right;
    const baseline = height - padding.bottom;
    const lastX = padding.left + innerWidth;
    return `${line} L${lastX},${baseline} L${padding.left},${baseline} Z`;
  }

  function renderLineChart(target, options) {
    const host = typeof target === "string" ? $(target) : target;
    if (!host || host.offsetParent === null) return;

    const width = options.width || 860;
    const height = options.height || 300;
    const padding = options.padding || { top: 24, right: 20, bottom: 34, left: 46 };
    const allValues = options.datasets.flatMap((d) => d.data);
    const rawMin = options.min ?? Math.min(...allValues);
    const rawMax = options.max ?? Math.max(...allValues);
    const range = rawMax - rawMin || 1;
    const min = options.min ?? rawMin - range * 0.08;
    const max = options.max ?? rawMax + range * 0.08;
    const yTicks = options.yTicks || 5;
    const xLabels = options.xLabels || options.datasets[0].data.map((_, i) => i);
    const xTickCount = options.xTicks || Math.min(6, xLabels.length);

    const defs = [];
    const areas = [];
    const lines = [];
    const legends = [];

    options.datasets.forEach((dataset, index) => {
      const id = `${host.id || "chart"}-gradient-${index}`;
      if (dataset.fill) {
        defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${dataset.color}" stop-opacity="0.34"/><stop offset="100%" stop-color="${dataset.color}" stop-opacity="0"/></linearGradient>`);
        areas.push(`<path class="chart-area" d="${areaPathFromData(dataset.data, width, height, padding, min, max)}" fill="url(#${id})"/>`);
      }
      const dash = dataset.dashed ? `stroke-dasharray="6 5"` : "";
      lines.push(`<path class="chart-line" d="${pathFromData(dataset.data, width, height, padding, min, max)}" stroke="${dataset.color}" ${dash}/>`);
      if (options.showPoints) {
        const innerWidth = width - padding.left - padding.right;
        const innerHeight = height - padding.top - padding.bottom;
        dataset.data.forEach((value, pointIndex) => {
          if (pointIndex % Math.max(1, Math.ceil(dataset.data.length / 16)) !== 0 && pointIndex !== dataset.data.length - 1) return;
          const x = padding.left + (pointIndex / Math.max(1, dataset.data.length - 1)) * innerWidth;
          const y = padding.top + (1 - (value - min) / Math.max(0.0001, max - min)) * innerHeight;
          lines.push(`<circle class="chart-point" cx="${x}" cy="${y}" r="2.6" stroke="${dataset.color}"/>`);
        });
      }
      if (options.legend !== false) {
        const lx = padding.left + index * 142;
        legends.push(`<line x1="${lx}" y1="10" x2="${lx + 20}" y2="10" stroke="${dataset.color}" stroke-width="2" ${dash}/><text class="chart-legend-text" x="${lx + 26}" y="13">${escapeHtml(dataset.name || `Série ${index + 1}`)}</text>`);
      }
    });

    const grid = [];
    for (let i = 0; i <= yTicks; i += 1) {
      const y = padding.top + ((height - padding.top - padding.bottom) * i) / yTicks;
      const value = max - ((max - min) * i) / yTicks;
      grid.push(`<line class="chart-grid-line" x1="${padding.left}" x2="${width - padding.right}" y1="${y}" y2="${y}"/>`);
      grid.push(`<text x="${padding.left - 8}" y="${y + 3}" text-anchor="end">${pt(value, options.yDigits ?? 0)}${options.ySuffix || ""}</text>`);
    }

    const xAxis = [];
    const step = Math.max(1, Math.floor((xLabels.length - 1) / Math.max(1, xTickCount - 1)));
    for (let i = 0; i < xLabels.length; i += step) {
      const x = padding.left + (i / Math.max(1, xLabels.length - 1)) * (width - padding.left - padding.right);
      xAxis.push(`<line class="chart-grid-line" x1="${x}" x2="${x}" y1="${padding.top}" y2="${height - padding.bottom}"/>`);
      xAxis.push(`<text x="${x}" y="${height - 11}" text-anchor="middle">${escapeHtml(xLabels[i])}</text>`);
    }
    if ((xLabels.length - 1) % step !== 0) {
      const i = xLabels.length - 1;
      const x = width - padding.right;
      xAxis.push(`<text x="${x}" y="${height - 11}" text-anchor="end">${escapeHtml(xLabels[i])}</text>`);
    }

    host.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(options.ariaLabel || "Gráfico de linhas")}">
        <defs>${defs.join("")}</defs>
        ${grid.join("")}
        ${xAxis.join("")}
        <line class="chart-axis-line" x1="${padding.left}" x2="${width - padding.right}" y1="${height - padding.bottom}" y2="${height - padding.bottom}"/>
        ${areas.join("")}
        ${lines.join("")}
        ${legends.join("")}
      </svg>`;
  }

  function renderSparkline(target, data, color = COLORS.orange) {
    const host = typeof target === "string" ? $(target) : target;
    if (!host) return;
    const width = 600;
    const height = 32;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const path = pathFromData(data, width, height, { top: 3, right: 0, bottom: 3, left: 0 }, min, max);
    host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="16" x2="600" y2="16" stroke="rgba(70,120,146,.18)"/><path d="${path}" fill="none" stroke="${color}" stroke-width="1.4"/></svg>`;
  }

  function createWaveData(seed, points = 140, volatility = 0.28) {
    const random = seededRandom(seed);
    const values = [];
    let current = 0.5;
    for (let i = 0; i < points; i += 1) {
      current += (random() - 0.5) * volatility;
      current += (0.5 - current) * 0.08;
      values.push(clamp(current + Math.sin(i / 6) * 0.06, 0.05, 0.95));
    }
    return values;
  }

  function isoPoint(x, y, z, originX, originY, sx, sy) {
    return {
      x: originX + (x - y) * sx,
      y: originY + (x + y) * sy - z,
    };
  }

  function polygon(points) {
    return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  }

  function renderCityScene() {
    const svg = $("#cityVisual");
    if (!svg) return;
    const random = seededRandom(8291);
    const originX = 378;
    const originY = 70;
    const sx = 24;
    const sy = 11.5;
    const cols = 13;
    const rows = 9;
    const buildingData = [];

    for (let x = 0; x < cols; x += 1) {
      for (let y = 0; y < rows; y += 1) {
        if (x === 6 || y === 4 || (x === 2 && y > 1) || (y === 7 && x > 7)) continue;
        const central = 1 - Math.min(1, Math.hypot(x - 6, y - 4) / 7);
        const width = 0.58 + random() * 0.22;
        const depth = 0.56 + random() * 0.24;
        const height = 18 + random() * 48 + central * 68;
        buildingData.push({ x: x + 0.12, y: y + 0.12, width, depth, height, heat: 0.45 + central * 0.55 + random() * 0.15 });
      }
    }
    buildingData.sort((a, b) => a.x + a.y - (b.x + b.y));

    const groundLines = [];
    for (let i = 0; i <= cols; i += 1) {
      const a = isoPoint(i, 0, 0, originX, originY, sx, sy);
      const b = isoPoint(i, rows, 0, originX, originY, sx, sy);
      groundLines.push(`<line class="city-ground-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    }
    for (let i = 0; i <= rows; i += 1) {
      const a = isoPoint(0, i, 0, originX, originY, sx, sy);
      const b = isoPoint(cols, i, 0, originX, originY, sx, sy);
      groundLines.push(`<line class="city-ground-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    }

    const roads = [];
    [6.5].forEach((x) => {
      const a = isoPoint(x, 0, 0, originX, originY, sx, sy);
      const b = isoPoint(x, rows, 0, originX, originY, sx, sy);
      roads.push(`<line class="city-road" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    });
    [4.5].forEach((y) => {
      const a = isoPoint(0, y, 0, originX, originY, sx, sy);
      const b = isoPoint(cols, y, 0, originX, originY, sx, sy);
      roads.push(`<line class="city-road" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    });

    const buildings = buildingData.map((building, index) => {
      const x0 = building.x;
      const y0 = building.y;
      const x1 = x0 + building.width;
      const y1 = y0 + building.depth;
      const h = building.height;
      const p000 = isoPoint(x0, y0, 0, originX, originY, sx, sy);
      const p100 = isoPoint(x1, y0, 0, originX, originY, sx, sy);
      const p010 = isoPoint(x0, y1, 0, originX, originY, sx, sy);
      const p110 = isoPoint(x1, y1, 0, originX, originY, sx, sy);
      const p001 = isoPoint(x0, y0, h, originX, originY, sx, sy);
      const p101 = isoPoint(x1, y0, h, originX, originY, sx, sy);
      const p011 = isoPoint(x0, y1, h, originX, originY, sx, sy);
      const p111 = isoPoint(x1, y1, h, originX, originY, sx, sy);
      const opacity = clamp(0.58 + building.heat * 0.32, 0.58, 0.96);
      const windows = [];
      if (h > 40 && index % 2 === 0) {
        const floors = Math.min(5, Math.floor(h / 18));
        for (let floor = 1; floor <= floors; floor += 1) {
          const t = floor / (floors + 1);
          const a = { x: p010.x + (p011.x - p010.x) * t, y: p010.y + (p011.y - p010.y) * t };
          const b = { x: p110.x + (p111.x - p110.x) * t, y: p110.y + (p111.y - p110.y) * t };
          windows.push(`<line class="city-window" x1="${a.x + 2}" y1="${a.y}" x2="${b.x - 2}" y2="${b.y}" stroke-width="1"/>`);
        }
      }
      return `
        <g opacity="${opacity}">
          <ellipse class="city-heat-halo" cx="${p110.x}" cy="${p110.y + 3}" rx="${14 + building.heat * 8}" ry="${7 + building.heat * 5}"/>
          <polygon class="city-building-left" points="${polygon([p010, p110, p111, p011])}"/>
          <polygon class="city-building-right" points="${polygon([p100, p110, p111, p101])}"/>
          <polygon class="city-building-top" points="${polygon([p001, p101, p111, p011])}"/>
          ${windows.join("")}
        </g>`;
    });

    svg.innerHTML = `
      <defs>
        <linearGradient id="citySky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#140703"/><stop offset="100%" stop-color="#05090c"/></linearGradient>
        <radialGradient id="cityHeat" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ff7a17" stop-opacity=".42"/><stop offset="100%" stop-color="#ff5210" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="760" height="390" fill="url(#citySky)"/>
      <ellipse cx="390" cy="300" rx="310" ry="88" fill="url(#cityHeat)"/>
      <g>${groundLines.join("")}</g>
      <g>${roads.join("")}</g>
      <g>${buildings.join("")}</g>
      <text x="22" y="31" fill="#8f4b27" font-family="monospace" font-size="11">IR-LST / CÂNION URBANO</text>
    `;
  }

  function renderMiniCity() {
    const svg = $("#miniCityModel");
    if (!svg) return;
    const random = seededRandom(2740);
    const originX = 356;
    const originY = 38;
    const sx = 21;
    const sy = 9.5;
    const cols = 16;
    const rows = 10;
    const buildings = [];

    for (let x = 0; x < cols; x += 1) {
      for (let y = 0; y < rows; y += 1) {
        if (x === 8 || y === 5 || random() < 0.08) continue;
        const h = 8 + random() * 48 + Math.max(0, 42 - Math.hypot(x - 8, y - 5) * 6);
        buildings.push({ x: x + 0.12, y: y + 0.12, width: 0.62, depth: 0.62, height: h });
      }
    }
    buildings.sort((a, b) => a.x + a.y - (b.x + b.y));

    const shapes = buildings.map((building) => {
      const x0 = building.x;
      const y0 = building.y;
      const x1 = x0 + building.width;
      const y1 = y0 + building.depth;
      const h = building.height;
      const p010 = isoPoint(x0, y1, 0, originX, originY, sx, sy);
      const p100 = isoPoint(x1, y0, 0, originX, originY, sx, sy);
      const p110 = isoPoint(x1, y1, 0, originX, originY, sx, sy);
      const p001 = isoPoint(x0, y0, h, originX, originY, sx, sy);
      const p101 = isoPoint(x1, y0, h, originX, originY, sx, sy);
      const p011 = isoPoint(x0, y1, h, originX, originY, sx, sy);
      const p111 = isoPoint(x1, y1, h, originX, originY, sx, sy);
      return `<g><polygon points="${polygon([p010, p110, p111, p011])}" fill="#233845"/><polygon points="${polygon([p100, p110, p111, p101])}" fill="#172934"/><polygon points="${polygon([p001, p101, p111, p011])}" fill="#5a6870"/></g>`;
    });

    const markerPositions = [
      [268, 162, "H1"],
      [412, 120, "H2"],
      [528, 184, "H3"],
      [352, 221, "H4"],
    ];
    const markers = markerPositions.map(([x, y, label]) => `
      <g transform="translate(${x} ${y})">
        <line y1="0" y2="-35" stroke="#ff8a24" stroke-width="1" stroke-dasharray="3 3"/>
        <circle cy="-38" r="9" fill="#2c1206" stroke="#ff8a24" stroke-width="2"/>
        <text y="-35" text-anchor="middle" fill="#ffc070" font-family="monospace" font-size="7">${label}</text>
      </g>`).join("");

    svg.innerHTML = `
      <defs><linearGradient id="miniGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1720"/><stop offset="1" stop-color="#050a0e"/></linearGradient></defs>
      <rect width="820" height="280" fill="url(#miniGround)"/>
      <g opacity=".86">${shapes.join("")}</g>
      ${markers}
    `;
  }

  function renderCamsData() {
    const cams = state.api.cams;
    if (!cams) return;
    const rows = Array.isArray(cams.rows) ? cams.rows : [];
    const latest = rows.length ? rows[rows.length - 1] : null;
    setText("#camsDateValue", cams.date || "N/D");
    setText("#camsGhiValue", Number.isFinite(Number(latest?.ghi_wm2)) ? `${pt(latest.ghi_wm2, 0)} W/m²` : "N/D");
    setText("#camsDniValue", Number.isFinite(Number(latest?.dni_wm2)) ? `${pt(latest.dni_wm2, 0)} W/m²` : "N/D");
    setText("#camsDhiValue", Number.isFinite(Number(latest?.dhi_wm2)) ? `${pt(latest.dhi_wm2, 0)} W/m²` : "N/D");
  }

  function renderSolarData() {
    const solar = state.api.solar;
    if (!solar?.ok) return;
    const earth = solar.earth || {};
    const venus = solar.venus || {};
    setText("#venusSolarFlux", Number.isFinite(Number(venus.solar_irradiance_wm2)) ? `≈ ${pt(venus.solar_irradiance_wm2, 0)} W/m²` : "N/D");
    setText("#venusSolarDistance", Number.isFinite(Number(venus.distance_au)) ? `${pt(venus.distance_au, 3)} AU` : "N/D");
    setText("#solarRadiationValue", Number.isFinite(Number(earth.shortwave_radiation_wm2)) ? `${pt(earth.shortwave_radiation_wm2, 0)} W/m²` : "N/D");
    setText("#solarRadiationLabel", "Open-Meteo · radiação solar de onda curta");
    const label = $("#venusSolarFlux")?.closest("dl")?.querySelector("div:last-child");
    return earth;
  }

  function createRadiativeData() {
    const x = Array.from({ length: 90 }, (_, i) => i);
    const venusTotal = x.map((i) => 0.4 + Math.sin(i / 8) * 0.22 + Math.exp(-((i - 70) ** 2) / 220) * 1.5 + Math.sin(i * 0.8) * 0.05);
    const venusAbs = x.map((i) => 0.2 + Math.sin(i / 7 + 1) * 0.12 + Math.exp(-((i - 68) ** 2) / 190) * 1.15);
    const cloud = x.map((i) => 0.14 + Math.sin(i / 11 + 2) * 0.09 + Math.exp(-((i - 76) ** 2) / 170) * 0.8);
    const thermal = x.map((i) => 0.07 + Math.sin(i / 10 + 0.4) * 0.05 + Math.exp(-((i - 75) ** 2) / 120) * 0.46);

    const urbanTotal = x.map((i) => 0.45 + Math.sin(i / 6) * 0.2 + Math.exp(-((i - 66) ** 2) / 180) * 1.1 + Math.sin(i * 0.55) * 0.1);
    const building = x.map((i) => 0.25 + Math.sin(i / 7 + 0.5) * 0.1 + Math.exp(-((i - 63) ** 2) / 180) * 0.82);
    const reflection = x.map((i) => 0.17 + Math.sin(i / 8 + 2) * 0.08 + Math.exp(-((i - 70) ** 2) / 170) * 0.62);
    const atmosphere = x.map((i) => 0.11 + Math.sin(i / 10 + 4) * 0.05 + Math.exp(-((i - 74) ** 2) / 140) * 0.42);

    return { venusTotal, venusAbs, cloud, thermal, urbanTotal, building, reflection, atmosphere };
  }

  const radiativeData = createRadiativeData();

  function makeTemperatureSeries(hours, base = 31, amplitude = 6, phase = 0) {
    return Array.from({ length: hours }, (_, i) => {
      const dayHour = (i + phase) % 24;
      const daily = Math.sin(((dayHour - 8) / 24) * Math.PI * 2);
      const secondary = Math.sin(i / 3.4) * 0.5;
      return base + Math.max(-0.6, daily) * amplitude + secondary;
    });
  }

  function renderOverviewCharts() {
    const solarTimeline = state.api.solar?.timeline;
    const liveSolar = Array.isArray(solarTimeline) ? solarTimeline.map(r => Number(r.shortwave_radiation_wm2)).filter(Number.isFinite) : [];
    const venusReference = Array.from({ length: Math.max(2, liveSolar.length || 48) }, () => Number(state.api.solar?.venus?.solar_irradiance_wm2 || 2610));
    renderLineChart("#venusRadiativeChart", {
      datasets: liveSolar.length >= 2
        ? [
            { name: "Terra · Open-Meteo", data: liveSolar, color: COLORS.cyan },
            { name: "Vênus · referência calculada", data: venusReference.slice(0, liveSolar.length), color: COLORS.orange },
          ]
        : [
            { name: "Vênus · referência calculada", data: venusReference, color: COLORS.orange },
          ],
      min: 0,
      yDigits: 0,
      xLabels: liveSolar.length >= 2 ? liveSolar.map((_, i) => i % 12 === 0 ? `${i}h` : "") : ["", "", "", "", ""],
      xTicks: 4,
      ySuffix: " W/m²",
      ariaLabel: "Comparação de radiação solar: Terra via Open-Meteo e Vênus por irradiância calculada",
    });

    renderLineChart("#urbanRadiativeChart", {
      datasets: [
        { name: "Total", data: radiativeData.urbanTotal, color: COLORS.orange },
        { name: "Edificações", data: radiativeData.building, color: COLORS.amber },
        { name: "Reflexões", data: radiativeData.reflection, color: COLORS.blueBright },
        { name: "Atmosfera", data: radiativeData.atmosphere, color: COLORS.blue },
      ],
      min: 0,
      yDigits: 1,
      xLabels: ["1", ...Array(88).fill(""), "100 μm"],
      xTicks: 4,
      ariaLabel: "Curvas conceituais de transferência radiativa em cânion urbano",
    });

    const liveRows = state.api.dashboard?.forecast?.city_timeline;
    const liveForecast = Array.isArray(liveRows)
      ? liveRows.map((row) => Number(row.air_temperature_c)).filter(Number.isFinite)
      : [];
    const forecast = liveForecast.length >= 2
      ? liveForecast
      : makeTemperatureSeries(49, 31.8, 5.5, 7).map((value, index) => value + Math.sin(index / 5) * 0.4);
    const labels = liveForecast.length >= 2
      ? liveRows.map((row, index) => (index % 12 === 0 || index === liveRows.length - 1 ? formatForecastTime(row.time, false) : ""))
      : forecast.map((_, index) => (index % 12 === 0 ? `${index}h` : ""));
    const minValue = Math.floor(Math.min(...forecast) - 2);
    const maxValue = Math.ceil(Math.max(...forecast) + 2);

    renderLineChart("#predictionMiniChart", {
      datasets: [{ name: "Temperatura", data: forecast, color: COLORS.cyan, fill: true }],
      min: minValue,
      max: maxValue,
      yTicks: 2,
      xLabels: labels,
      xTicks: 5,
      padding: { top: 18, right: 12, bottom: 25, left: 33 },
      ySuffix: "°",
      legend: false,
      showPoints: true,
      ariaLabel: liveForecast.length >= 2
        ? "Predição operacional de temperatura para as próximas 48 horas"
        : "Predição de contingência para 48 horas",
    });
  }

  function renderAnalyticsCharts() {
    const observations = Array.isArray(state.api.analytics?.observations)
      ? state.api.analytics.observations
      : [];
    const stationCode = (row) => row?.sipic_stations?.code || row?.station_code || "";
    const byTime = (rows) => [...rows].sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
    const liveUrbanRows = byTime(observations.filter((row) => stationCode(row) === "RP-CENTRO-04"));
    const liveReferenceRows = byTime(observations.filter((row) => stationCode(row) === "RP-REF-01"));
    const canUseLive = liveUrbanRows.length >= 2;

    let labels;
    let urban;
    let peri;
    let humidity;
    let windNormalized;
    let uhi;

    if (canUseLive) {
      const limited = liveUrbanRows.slice(-96);
      const referenceByTime = new Map(liveReferenceRows.map((row) => [row.observed_at, row]));
      labels = limited.map((row, index) => (
        index % Math.max(1, Math.floor(limited.length / 6)) === 0 || index === limited.length - 1
          ? formatForecastTime(row.observed_at, false)
          : ""
      ));
      urban = limited.map((row) => Number(row.air_temperature_c)).filter(Number.isFinite);
      peri = limited.map((row, index) => {
        const reference = referenceByTime.get(row.observed_at);
        const value = Number(reference?.air_temperature_c);
        if (Number.isFinite(value)) return value;
        const heatIsland = Number(row.urban_heat_island_c);
        return Number.isFinite(heatIsland) ? urban[index] - heatIsland : urban[index] - 2.5;
      });
      humidity = limited.map((row) => Number(row.relative_humidity_pct));
      windNormalized = limited.map((row) => Number(row.wind_speed_ms) * 10);
      uhi = limited.map((row, index) => {
        const value = Number(row.urban_heat_island_c);
        return Number.isFinite(value) ? value : Math.max(0, urban[index] - peri[index]);
      });
    } else {
      labels = Array.from({ length: 72 }, (_, i) => (i % 12 === 0 ? `${String((i + 6) % 24).padStart(2, "0")}h` : ""));
      urban = makeTemperatureSeries(72, 31.8, 6.2, 6).map((value, index) => value + Math.sin(index / 9) * 0.8);
      peri = makeTemperatureSeries(72, 28.8, 4.8, 6).map((value, index) => value + Math.sin(index / 10) * 0.5);
      humidity = Array.from({ length: 48 }, (_, i) => 46 - Math.sin(((i - 7) / 24) * Math.PI * 2) * 19 + Math.sin(i / 4) * 2);
      windNormalized = Array.from({ length: 48 }, (_, i) => 26 + Math.sin(i / 3.7) * 12 + Math.cos(i / 8) * 5);
      uhi = urban.slice(0, 48).map((value, index) => Math.max(0.6, value - peri[index] + Math.sin(index / 4) * 0.4));
    }

    const temperatureValues = [...urban, ...peri].filter(Number.isFinite);
    renderLineChart("#airTemperatureChart", {
      datasets: [
        { name: "Setor Centro", data: urban, color: COLORS.cyan, fill: true },
        { name: "Referência periurbana", data: peri, color: COLORS.blueBright },
      ],
      min: Math.floor(Math.min(...temperatureValues) - 2),
      max: Math.ceil(Math.max(...temperatureValues) + 2),
      yTicks: 5,
      xLabels: labels,
      xTicks: 7,
      ySuffix: "°",
      showPoints: false,
      ariaLabel: canUseLive
        ? "Temperatura persistida do setor central e da referência periurbana"
        : "Série de contingência de temperatura urbana e periurbana",
    });

    const humiditySafe = humidity.map((value) => Number.isFinite(value) ? value : 0);
    const windSafe = windNormalized.map((value) => Number.isFinite(value) ? value : 0);
    renderLineChart("#humidityWindChart", {
      datasets: [
        { name: "Umidade (%)", data: humiditySafe, color: COLORS.blueBright, fill: true },
        { name: "Vento (escala ×10)", data: windSafe, color: COLORS.green },
      ],
      min: 0,
      max: Math.max(70, Math.ceil(Math.max(...humiditySafe, ...windSafe) + 5)),
      yTicks: 4,
      xLabels: canUseLive ? labels : Array.from({ length: 48 }, (_, i) => (i % 8 === 0 ? `${i}h` : "")),
      xTicks: 7,
      ySuffix: "",
      ariaLabel: "Variação da umidade relativa e velocidade do vento",
    });

    const uhiSafe = uhi.map((value) => Number.isFinite(value) ? value : 0);
    renderLineChart("#uhiChart", {
      datasets: [{ name: "Intensidade UHI", data: uhiSafe, color: COLORS.orange, fill: true }],
      min: 0,
      max: Math.max(8, Math.ceil(Math.max(...uhiSafe) + 1)),
      yTicks: 4,
      xLabels: canUseLive ? labels : Array.from({ length: 48 }, (_, i) => (i % 8 === 0 ? `${i}h` : "")),
      xTicks: 7,
      ySuffix: "°",
      showPoints: true,
      ariaLabel: "Intensidade da ilha de calor urbana ao longo do tempo",
    });
  }

  function renderSpectralChart() {
    const length = 100;
    const venus = Array.from({ length }, (_, i) => 0.25 + Math.exp(-((i - 68) ** 2) / 380) * 1.45 + Math.sin(i / 7) * 0.12);
    const urban = Array.from({ length }, (_, i) => 0.2 + Math.exp(-((i - 57) ** 2) / 250) * 1.05 + Math.sin(i / 6 + 1.5) * 0.1);
    const atmosphere = Array.from({ length }, (_, i) => 0.18 + Math.exp(-((i - 76) ** 2) / 190) * 0.72 + Math.sin(i / 8 + 3) * 0.08);
    renderLineChart("#spectralComparisonChart", {
      datasets: [
        { name: "Vênus normalizado", data: venus, color: COLORS.orange, fill: true },
        { name: "Cânion urbano", data: urban, color: COLORS.cyan },
        { name: "Atmosfera terrestre", data: atmosphere, color: COLORS.blueBright, dashed: true },
      ],
      min: 0,
      max: 2,
      yTicks: 5,
      xLabels: Array.from({ length }, (_, i) => (i % 20 === 0 ? `${1 + i} μm` : "")),
      xTicks: 6,
      yDigits: 1,
      ariaLabel: "Comparação didática de janelas espectrais",
    });
  }

  function renderPredictionFullChart() {
    const host = $("#predictionFullChart");
    if (!host || host.offsetParent === null) return;
    const width = 900;
    const height = 380;
    const padding = { top: 28, right: 22, bottom: 38, left: 48 };
    const liveRows = state.api.dashboard?.forecast?.city_timeline;
    const isLive = Array.isArray(liveRows) && liveRows.length >= 2;
    const rows = isLive
      ? liveRows
      : makeTemperatureSeries(49, 31.8, 5.8, 7).map((value, index) => ({
        time: null,
        horizon_hours: index,
        air_temperature_c: value + Math.sin(index / 5) * 0.5,
        lower_bound_c: value - 1.2,
        upper_bound_c: value + 1.3,
      }));
    const prediction = rows.map((row) => Number(row.air_temperature_c));
    const lower = rows.map((row, index) => {
      const value = Number(row.lower_bound_c);
      return Number.isFinite(value) ? value : prediction[index] - 1.2;
    });
    const upper = rows.map((row, index) => {
      const value = Number(row.upper_bound_c);
      return Number.isFinite(value) ? value : prediction[index] + 1.3;
    });
    const allValues = [...prediction, ...lower, ...upper].filter(Number.isFinite);
    const min = Math.floor(Math.min(...allValues) - 2);
    const max = Math.ceil(Math.max(...allValues) + 2);
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const point = (value, index) => ({
      x: padding.left + (index / Math.max(1, prediction.length - 1)) * innerWidth,
      y: padding.top + (1 - (value - min) / Math.max(0.0001, max - min)) * innerHeight,
    });
    const upperPoints = upper.map(point);
    const lowerPoints = lower.map(point).reverse();
    const bandPath = `M${upperPoints.map((p) => `${p.x},${p.y}`).join(" L")} L${lowerPoints.map((p) => `${p.x},${p.y}`).join(" L")} Z`;
    const predPath = pathFromData(prediction, width, height, padding, min, max);

    const grid = [];
    for (let i = 0; i <= 5; i += 1) {
      const y = padding.top + (innerHeight * i) / 5;
      const value = max - ((max - min) * i) / 5;
      grid.push(`<line class="chart-grid-line" x1="${padding.left}" x2="${width - padding.right}" y1="${y}" y2="${y}"/><text x="${padding.left - 8}" y="${y + 3}" text-anchor="end">${value.toFixed(0)}°</text>`);
    }
    const horizon = Number(rows.at(-1)?.horizon_hours ?? prediction.length - 1);
    const step = horizon <= 24 ? 3 : 6;
    for (let hour = 0; hour <= horizon; hour += step) {
      const index = Math.min(prediction.length - 1, Math.round((hour / Math.max(1, horizon)) * (prediction.length - 1)));
      const x = point(prediction[index], index).x;
      grid.push(`<line class="chart-grid-line" x1="${x}" x2="${x}" y1="${padding.top}" y2="${height - padding.bottom}"/><text x="${x}" y="${height - 12}" text-anchor="middle">${hour}h</text>`);
    }
    const nowPoint = point(prediction[0], 0);

    host.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Predição de temperatura com faixa de incerteza">
        <defs>
          <linearGradient id="predictionArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${COLORS.cyan}" stop-opacity=".28"/><stop offset="100%" stop-color="${COLORS.cyan}" stop-opacity="0"/></linearGradient>
          <linearGradient id="predictionBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${COLORS.blueBright}" stop-opacity=".18"/><stop offset="100%" stop-color="${COLORS.blueBright}" stop-opacity=".04"/></linearGradient>
        </defs>
        ${grid.join("")}
        <path d="${bandPath}" fill="url(#predictionBand)" stroke="none"/>
        <path d="${areaPathFromData(prediction, width, height, padding, min, max)}" fill="url(#predictionArea)"/>
        <path class="chart-line" d="${predPath}" stroke="${COLORS.cyan}"/>
        <circle class="chart-point" cx="${nowPoint.x}" cy="${nowPoint.y}" r="4" stroke="${COLORS.green}"/>
        <line x1="${nowPoint.x}" x2="${nowPoint.x}" y1="${padding.top}" y2="${height - padding.bottom}" stroke="${COLORS.amber}" stroke-dasharray="5 5"/>
        <text x="${nowPoint.x + 6}" y="${padding.top + 11}" fill="${COLORS.amber}">AGORA</text>
        <circle cx="${padding.left + 5}" cy="12" r="3.5" fill="none" stroke="${COLORS.green}" stroke-width="2"/><text class="chart-legend-text" x="${padding.left + 16}" y="15">Estado atual</text>
        <line x1="${padding.left + 118}" y1="12" x2="${padding.left + 138}" y2="12" stroke="${COLORS.cyan}" stroke-width="2"/><text class="chart-legend-text" x="${padding.left + 144}" y="15">Predito</text>
        <rect x="${padding.left + 226}" y="7" width="20" height="9" fill="${COLORS.blueBright}" opacity=".18"/><text class="chart-legend-text" x="${padding.left + 252}" y="15">Intervalo estimado</text>
      </svg>`;
  }

  function renderPredictionLists() {
    const riskHost = $("#riskSectorList");
    if (riskHost) {
      const forecasts = state.api.dashboard?.forecast?.by_sector || [];
      const forecastByCode = new Map(forecasts.map((item) => [item.code, item]));
      const ranked = sectors
        .filter((sector) => sector.id !== "periurbano")
        .map((sector) => {
          const timeline = forecastByCode.get(sector.code)?.timeline || [];
          const peak = [...timeline.slice(0, 25)].filter(Boolean).sort((a, b) => Number(b.risk_score ?? 0) - Number(a.risk_score ?? 0))[0];
          return {
            ...sector,
            peakScore: Math.round(Number(peak?.risk_score ?? sector.score)),
            peakTemperature: Number(peak?.apparent_temperature_c ?? sector.air),
          };
        })
        .sort((a, b) => b.peakScore - a.peakScore)
        .slice(0, 5);
      riskHost.innerHTML = ranked.map((sector) => `
        <div class="risk-sector-item">
          <span>${escapeHtml(sector.code)}</span>
          <strong>${escapeHtml(sector.shortName)}</strong>
          <b><i style="--w:${clamp(sector.peakScore, 0, 100)}%"></i></b>
          <small><span>${sector.peakScore}/100</span><span>${pt(sector.peakTemperature, 1)} °C</span></small>
        </div>`).join("");
    }

    const timelineHost = $("#alertTimeline");
    if (timelineHost) {
      const liveTimeline = state.api.dashboard?.forecast?.city_timeline;
      let items;
      if (Array.isArray(liveTimeline) && liveTimeline.length) {
        const selected = liveTimeline.filter((_, index) => index % 6 === 0).slice(0, 9);
        const levelConfig = {
          low: ["Baixo", COLORS.green],
          moderate: ["Moderado", COLORS.amber],
          high: ["Alto", COLORS.orange],
          critical: ["Crítico", COLORS.red],
        };
        items = selected.map((row) => {
          const [label, color] = levelConfig[row.risk_level] || levelConfig.moderate;
          return [
            formatForecastTime(row.time),
            label,
            color,
            `${pt(row.apparent_temperature_c ?? row.air_temperature_c, 1)} °C · UHI +${pt(row.urban_heat_island_c ?? 0, 1)}°`,
          ];
        });
      } else {
        items = [
          ["Hoje 18h", "Moderado", COLORS.amber, "Aparente 34°"],
          ["Hoje 21h", "Moderado", COLORS.amber, "UHI +5,6°"],
          ["Amanhã 06h", "Baixo", COLORS.green, "Aparente 24°"],
          ["Amanhã 09h", "Atenção", COLORS.amber, "Aparente 31°"],
          ["Amanhã 12h", "Alto", COLORS.orange, "Aparente 38°"],
          ["Amanhã 15h", "Muito alto", COLORS.red, "Aparente 42°"],
        ];
      }
      timelineHost.innerHTML = items.map(([time, level, color, detail]) => `
        <div class="alert-time-item" style="--level-color:${color}">
          <span>${escapeHtml(time)}</span><strong>${escapeHtml(detail)}</strong><i></i><small>${escapeHtml(level)}</small>
        </div>`).join("");
    }
  }

  function renderAnalyticsKpis() {
    const dashboard = state.api.dashboard;
    const bySector = dashboard?.forecast?.by_sector;
    const city = dashboard?.forecast?.city_timeline;
    if (!Array.isArray(bySector) || !bySector.length || !Array.isArray(city) || !city.length) return;

    const allPoints = bySector.flatMap((item) => (item.timeline || []).filter(Boolean).map((point) => ({ ...point, sector_code: item.code, sector_name: item.name })));
    const maxAir = [...allPoints].sort((a, b) => Number(b.air_temperature_c ?? -999) - Number(a.air_temperature_c ?? -999))[0];
    const maxSurface = [...allPoints].sort((a, b) => Number(b.surface_temperature_c ?? -999) - Number(a.surface_temperature_c ?? -999))[0];
    const nightPoints = allPoints.filter((point) => {
      const hour = Number(String(point.time || "").slice(11, 13));
      return hour >= 18 || hour <= 6;
    });
    const maxNightUhi = [...nightPoints].sort((a, b) => Number(b.urban_heat_island_c ?? -999) - Number(a.urban_heat_island_c ?? -999))[0];
    const minHumidity = [...allPoints].filter((point) => Number.isFinite(Number(point.relative_humidity_pct))).sort((a, b) => Number(a.relative_humidity_pct) - Number(b.relative_humidity_pct))[0];
    const riskHours = city.filter((point) => ["high", "critical"].includes(point.risk_level)).length;
    const confidenceValues = city.map((point) => Number(point.confidence_pct)).filter(Number.isFinite);
    const confidence = confidenceValues.length ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length : null;

    if (maxAir) {
      setText("#analyticsMaxAir", `${pt(maxAir.air_temperature_c, 1)} °C`);
      setText("#analyticsMaxAirNote", `${maxAir.sector_code} · ${formatForecastTime(maxAir.time)}`);
    }
    if (maxSurface) {
      setText("#analyticsMaxSurface", `${pt(maxSurface.surface_temperature_c, 1)} °C`);
      setText("#analyticsMaxSurfaceNote", `${maxSurface.sector_code} · ${formatForecastTime(maxSurface.time)}`);
    }
    if (maxNightUhi) {
      setText("#analyticsNightUhi", `+${pt(maxNightUhi.urban_heat_island_c, 1)} °C`);
      setText("#analyticsNightUhiNote", `${maxNightUhi.sector_code} · ${formatForecastTime(maxNightUhi.time)}`);
    }
    if (minHumidity) {
      setText("#analyticsMinHumidity", `${pt(minHumidity.relative_humidity_pct, 0)}%`);
      setText("#analyticsMinHumidityNote", `${minHumidity.sector_code} · ${formatForecastTime(minHumidity.time)}`);
    }
    setText("#analyticsRiskHours", `${riskHours} h`);
    setText("#analyticsRiskHoursNote", riskHours ? "nível alto ou crítico no setor Centro" : "nenhuma hora alta/crítica no setor Centro");
    if (confidence !== null) setText("#analyticsConfidence", `${pt(confidence, 1)}%`);

    const centre = dashboard.sectors?.find((sector) => sector.code === "RP-CENTRO-04");
    if (centre) {
      const metrics = [
        ["#morphImpervious", "#morphImperviousBar", Number(centre.imperviousness)],
        ["#morphDensity", "#morphDensityBar", Number(centre.building_density)],
        ["#morphNdvi", "#morphNdviBar", 1 - Number(centre.ndvi)],
        ["#morphVentilation", "#morphVentilationBar", 1 - Number(centre.ventilation_factor)],
        ["#morphSky", "#morphSkyBar", 1 - Number(centre.sky_view_factor)],
      ];
      metrics.forEach(([valueSelector, barSelector, value]) => {
        if (!Number.isFinite(value)) return;
        setText(valueSelector, pt(value, 2));
        setBar(barSelector, value * 100);
      });
    }
    setText("#analyticsSeriesStatus", state.api.analytics?.count >= 2
      ? `Histórico persistido · ${state.api.analytics.count} observações retornadas · °C`
      : "Aguardando múltiplos ciclos horários; gráfico de contingência exibido · °C");
  }

  function renderForecastEvents() {
    const host = $("#forecastEventsBody");
    if (!host) return;
    const forecasts = state.api.dashboard?.forecast?.by_sector;
    if (!Array.isArray(forecasts) || !forecasts.length) {
      host.innerHTML = `<tr><td colspan="6">Aguardando dados preditivos da API...</td></tr>`;
      return;
    }
    const rows = forecasts
      .filter((item) => item.code !== "RP-REF-01")
      .map((item) => {
        const peak = [...(item.timeline || [])].filter(Boolean).sort((a, b) => Number(b.apparent_temperature_c ?? 0) - Number(a.apparent_temperature_c ?? 0))[0];
        return peak ? { ...item, peak } : null;
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.peak.apparent_temperature_c ?? 0) - Number(a.peak.apparent_temperature_c ?? 0))
      .slice(0, 5);
    const labels = { low: ["low", "Baixo"], moderate: ["moderate", "Moderado"], high: ["high", "Alto"], critical: ["critical", "Crítico"] };
    host.innerHTML = rows.map(({ name, peak }) => {
      const [cssClass, label] = labels[peak.risk_level] || labels.moderate;
      return `<tr>
        <td>${escapeHtml(formatForecastTime(peak.time))}</td>
        <td>≈ 3 h</td>
        <td>${escapeHtml(name)}</td>
        <td>${pt(peak.apparent_temperature_c ?? peak.air_temperature_c, 1)} °C</td>
        <td>+${pt(peak.urban_heat_island_c ?? 0, 1)} °C</td>
        <td><span class="table-badge ${cssClass}">${label}</span></td>
      </tr>`;
    }).join("");
  }

  function renderFeatureImportance() {
    const host = $("#featureImportance");
    if (!host) return;
    const centre = state.api.dashboard?.sectors?.find((sector) => sector.code === "RP-CENTRO-04");
    const explanations = Array.isArray(centre?.explanations) ? centre.explanations : [];
    if (!explanations.length) return;
    const labelMap = {
      impermeabilização: "Impermeabilização urbana",
      "vegetação/NDVI": "Vegetação e NDVI",
      ventilação: "Ventilação local",
      "radiação solar": "Radiação solar",
    };
    const total = explanations.reduce((sum, item) => sum + Math.abs(Number(item.contribution) || 0), 0) || 1;
    host.innerHTML = explanations
      .map((item) => ({ ...item, share: (Math.abs(Number(item.contribution) || 0) / total) * 100 }))
      .sort((a, b) => b.share - a.share)
      .map((item) => `<div>
        <span>${escapeHtml(labelMap[item.factor] || item.factor)}</span>
        <b><i style="--w:${clamp(item.share, 0, 100)}%"></i></b>
        <strong>${pt(item.share, 1)}%</strong>
      </div>`).join("");
  }

  function layerValue(sector, layer) {
    const hourEffect = Math.sin(((state.mapHour - 8) / 24) * Math.PI * 2);
    const surfaceHour = Math.max(-0.55, hourEffect) * 4.6;
    const airHour = Math.max(-0.5, hourEffect) * 2.4;
    switch (layer) {
      case "air": return sector.air + airHour - 2.2;
      case "humidity": return clamp(sector.humidity - hourEffect * 7, 15, 74);
      case "ndvi": return sector.ndvi;
      default: return sector.surface + surfaceHour - 4.4;
    }
  }

  function layerColor(value, layer) {
    if (layer === "humidity") {
      const t = clamp((value - 18) / 45, 0, 1);
      return interpolateColor("#8f321f", "#25b5d5", t);
    }
    if (layer === "ndvi") {
      const t = clamp((value - 0.1) / 0.6, 0, 1);
      return interpolateColor("#8a5a22", "#3fc56f", t);
    }
    const min = layer === "air" ? 29 : 30;
    const max = layer === "air" ? 40 : 58;
    const t = clamp((value - min) / (max - min), 0, 1);
    if (t < 0.5) return interpolateColor("#1b6e99", "#f1c93d", t * 2);
    return interpolateColor("#f1c93d", "#e53c27", (t - 0.5) * 2);
  }

  function interpolateColor(a, b, t) {
    const parse = (hex) => hex.match(/[a-f\d]{2}/gi).map((v) => parseInt(v, 16));
    const aa = parse(a);
    const bb = parse(b);
    const result = aa.map((value, index) => Math.round(value + (bb[index] - value) * t));
    return `#${result.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  function renderHeatMap() {
    const svg = $("#heatMapSvg");
    if (!svg) return;
    const layer = state.mapLayer;
    const boundary = "M190,182 C260,95 402,70 521,112 C642,54 802,74 903,154 C1043,207 1045,348 973,425 C940,543 799,612 671,590 C554,655 400,603 338,521 C213,510 141,410 171,313 C128,257 143,211 190,182 Z";

    // Em navegadores móveis, filtros SVG com blur + gradientes duplicados podem
    // sofrer composição incorreta pela GPU e deixar o mapa com cores lavadas/invertidas.
    // Cada gradiente recebe um ID único e, em telas pequenas, o blur é desativado.
    const isMobileMap = typeof window !== "undefined" && window.matchMedia?.("(max-width: 600px)").matches;
    const heatBlobs = sectors.map((sector, index) => {
      const value = layerValue(sector, layer);
      const color = layerColor(value, layer);
      const radius = layer === "ndvi" ? 78 : 105 + sector.score * 0.32;
      const opacity = isMobileMap ? ".72" : ".85";
      const midOpacity = isMobileMap ? ".34" : ".42";
      return `<radialGradient id="heatBlob${index}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="48%" stop-color="${color}" stop-opacity="${midOpacity}"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></radialGradient><circle cx="${sector.x}" cy="${sector.y}" r="${radius}" fill="url(#heatBlob${index})"/>`;
    }).join("");

    const roads = [
      "M185 356 C340 310 470 320 602 342 C760 368 908 343 1002 300",
      "M348 96 C408 212 438 315 452 573",
      "M682 84 C650 204 646 324 671 601",
      "M206 233 C346 248 486 224 606 198 C756 167 885 190 987 243",
      "M254 478 C371 429 510 423 630 452 C754 486 870 476 958 433",
      "M526 100 C574 184 590 257 566 338 C541 427 530 506 565 606",
    ];
    const minorRoads = [
      "M240 176 L886 510", "M296 112 L831 579", "M193 412 L946 153", "M269 546 L945 261",
      "M371 97 L358 568", "M785 111 L774 559", "M211 291 L1001 385", "M223 383 L949 329",
    ];

    // Quadras e manchas urbanas: tornam a base cartográfica mais próxima de uma leitura territorial real.
    const random = seededRandom(217 + state.mapHour + layer.length * 19);
    const blocks = Array.from({ length: 190 }, () => {
      const x = 175 + random() * 820; const y = 95 + random() * 500;
      const w = 9 + random() * 28; const h = 7 + random() * 22; const rot = -18 + random() * 36;
      return `<rect class="urban-block" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }).join("");

    const labels = [
      [550, 322, "Centro"],
      [814, 332, "Zona Leste"],
      [592, 202, "Campos Elíseos"],
      [332, 332, "Zona Oeste"],
      [611, 535, "Zona Sul"],
      [454, 121, "Zona Norte"],
      [250, 257, "Campus USP"],
    ];

    const markers = sectors.map((sector) => {
      const value = layerValue(sector, layer);
      const color = layerColor(value, layer);
      const unit = layer === "ndvi" ? "" : layer === "humidity" ? "%" : "°C";
      const formatted = layer === "ndvi" ? pt(value, 2) : pt(value, 1);
      return `
        <g class="sensor-marker" data-sector-id="${sector.id}" style="--marker-color:${color}" transform="translate(${sector.x} ${sector.y})" tabindex="0" role="button" aria-label="${escapeHtml(sector.name)} ${formatted}${unit}">
          <circle class="pulse" r="13"/>
          <circle class="core" r="7"/>
          <text x="11" y="4">${formatted}${unit}</text>
        </g>`;
    }).join("");

    svg.innerHTML = `
      <defs>
        <clipPath id="cityClip"><path d="${boundary}"/></clipPath>
        <pattern id="mapGrid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0V36" fill="none" stroke="rgba(63,123,153,.09)" stroke-width="1"/></pattern>
        <filter id="softGlow"><feGaussianBlur stdDeviation="14"/></filter>
      </defs>
      <rect width="1200" height="720" fill="#040b10"/>
      <path class="city-boundary" d="${boundary}"/>
      <g clip-path="url(#cityClip)">
        <rect x="130" y="60" width="940" height="580" fill="url(#mapGrid)"/>
        ${isMobileMap ? `<g opacity=".92">${heatBlobs}</g>` : `<g filter="url(#softGlow)">${heatBlobs}</g><g opacity=".85">${heatBlobs}</g>`}
        <g class="urban-blocks">${blocks}</g>
        ${minorRoads.map((d) => `<path class="map-road" d="${d}"/>`).join("")}
        ${roads.map((d) => `<path class="map-road major" d="${d}"/>`).join("")}
      </g>
      <path d="${boundary}" fill="none" stroke="rgba(89,159,194,.6)" stroke-width="2"/>
      ${labels.map(([x, y, label]) => `<text class="map-label" x="${x}" y="${y}">${label}</text>`).join("")}
      <text class="map-sub-label" x="920" y="645">RIBEIRÃO PRETO · SP</text>
      ${markers}
    `;

    bindMapMarkers();
    updateMapLegend();
  }

  function updateMapLegend() {
    const legend = $("#mapLegend");
    if (!legend) return;
    const config = {
      surface: ["Temperatura de superfície", "24 °C", "40 °C", "56 °C", "linear-gradient(90deg,#123b63,#2d9cb1,#f4d64c,#f7831e,#e32f28)"],
      air: ["Temperatura do ar", "27 °C", "34 °C", "41 °C", "linear-gradient(90deg,#173d65,#2da4b8,#f1cb41,#f77b1d,#dc3928)"],
      humidity: ["Umidade relativa", "18%", "42%", "70%", "linear-gradient(90deg,#8f321f,#d88b30,#36a3b1,#25b5d5)"],
      ndvi: ["Índice de vegetação NDVI", "0,10", "0,40", "0,70", "linear-gradient(90deg,#8a5a22,#b0a238,#5fb85b,#2cbd71)"],
    }[state.mapLayer];
    const title = $("strong", legend);
    const gradient = $(".legend-gradient", legend);
    const labels = $$(':scope > div:last-child span', legend);
    title.textContent = config[0];
    gradient.style.background = config[4];
    labels.forEach((label, i) => { label.textContent = config[i + 1]; });
  }

  function bindMapMarkers() {
    $$(".sensor-marker").forEach((marker) => {
      const id = marker.dataset.sectorId;
      const sector = sectors.find((item) => item.id === id);
      if (!sector) return;
      const show = (event) => showMapTooltip(event, sector);
      marker.addEventListener("mouseenter", show);
      marker.addEventListener("mousemove", show);
      marker.addEventListener("mouseleave", hideMapTooltip);
      marker.addEventListener("focus", show);
      marker.addEventListener("blur", hideMapTooltip);
      marker.addEventListener("click", () => selectSector(id));
      marker.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectSector(id);
        }
      });
    });
  }

  function showMapTooltip(event, sector) {
    const tooltip = $("#mapTooltip");
    const wrapper = $(".heatmap-canvas-wrap");
    if (!tooltip || !wrapper) return;
    const value = layerValue(sector, state.mapLayer);
    const unit = state.mapLayer === "ndvi" ? "" : state.mapLayer === "humidity" ? "%" : " °C";
    const formatted = state.mapLayer === "ndvi" ? pt(value, 2) : pt(value, 1);
    tooltip.innerHTML = `<strong>${escapeHtml(sector.name)}</strong><span>${formatted}${unit}</span>`;
    tooltip.hidden = false;
    const rect = wrapper.getBoundingClientRect();
    const clientX = event.clientX || rect.left + (sector.x / 1200) * rect.width;
    const clientY = event.clientY || rect.top + (sector.y / 720) * rect.height;
    tooltip.style.left = `${clamp(clientX - rect.left + 14, 8, rect.width - 175)}px`;
    tooltip.style.top = `${clamp(clientY - rect.top - 18, 8, rect.height - 72)}px`;
  }

  function hideMapTooltip() {
    const tooltip = $("#mapTooltip");
    if (tooltip) tooltip.hidden = true;
  }

  function selectSector(id) {
    const sector = sectors.find((item) => item.id === id);
    if (!sector) return;
    state.selectedSectorId = id;
    const code = $("#selectedSectorCode");
    const name = $("#selectedSectorName");
    const surface = $("#sectorSurface");
    const air = $("#sectorAir");
    const uhi = $("#sectorUhi");
    const ndvi = $("#sectorNdvi");
    const drivers = $("#sectorDrivers");
    const badge = $(".selected-sector-card .risk-badge");
    if (code) code.textContent = sector.code;
    if (name) name.textContent = sector.name;
    if (surface) surface.textContent = `${pt(layerValue(sector, "surface"), 1)} °C`;
    if (air) air.textContent = `${pt(layerValue(sector, "air"), 1)} °C`;
    if (uhi) uhi.textContent = `+${pt(sector.uhi, 1)} °C`;
    if (ndvi) ndvi.textContent = pt(sector.ndvi, 2);
    if (drivers) drivers.innerHTML = sector.drivers.map((driver) => `<li>${escapeHtml(driver)}</li>`).join("");
    if (badge) {
      badge.className = `risk-badge ${sector.risk}`;
      badge.textContent = sector.rawRisk === "critical"
        ? "CRÍTICO"
        : sector.risk === "high"
          ? "ALTO"
          : sector.risk === "moderate"
            ? "MODERADO"
            : "BAIXO";
    }
    $$(".hotspot-row").forEach((row) => row.classList.toggle("active", row.dataset.sectorId === id));
  }

  function renderHotspotList() {
    const host = $("#hotspotList");
    if (!host) return;
    const ranked = [...sectors].filter((s) => s.id !== "periurbano").sort((a, b) => b.score - a.score).slice(0, 5);
    host.innerHTML = ranked.map((sector, index) => `
      <button class="hotspot-row ${sector.id === state.selectedSectorId ? "active" : ""}" data-sector-id="${sector.id}">
        <span class="hotspot-rank">${String(index + 1).padStart(2, "0")}</span>
        <span><strong>${escapeHtml(sector.shortName)}</strong><small>${escapeHtml(sector.code)}</small></span>
        <span>${pt(sector.surface, 1)}°</span>
      </button>`).join("");
    $$(".hotspot-row", host).forEach((button) => button.addEventListener("click", () => selectSector(button.dataset.sectorId)));
  }

  function renderSensorNetwork() {
    const svg = $("#sensorNetworkSvg");
    if (!svg) return;
    const hub = { x: 500, y: 310 };
    const stationStatus = new Map((state.api.dashboard?.network?.stations || []).map((station) => [station.code, station.status]));
    const nodes = sectors.map((sector) => ({
      ...sector,
      x: 160 + (sector.x / 1200) * 700,
      y: 75 + (sector.y / 720) * 470,
      status: stationStatus.get(sector.code) || "online",
    }));
    const links = nodes.map((node) => `<line class="network-link ${node.status === "online" ? "active" : ""}" x1="${hub.x}" y1="${hub.y}" x2="${node.x}" y2="${node.y}"/>`).join("");
    const nodeGroups = nodes.map((node) => {
      const color = node.status === "online" ? COLORS.green : node.status === "offline" ? COLORS.red : COLORS.amber;
      return `<g class="network-node" transform="translate(${node.x} ${node.y})" style="--node-color:${color}"><circle r="13"/><circle r="3" fill="${color}" stroke="none"/><text y="29">${escapeHtml(node.code.replace("RP-", ""))}</text></g>`;
    }).join("");

    svg.innerHTML = `
      <defs><radialGradient id="networkGlow"><stop offset="0%" stop-color="#1b769f" stop-opacity=".3"/><stop offset="100%" stop-color="#1b769f" stop-opacity="0"/></radialGradient></defs>
      <ellipse cx="500" cy="310" rx="350" ry="230" fill="url(#networkGlow)"/>
      ${links}
      ${nodeGroups}
      <g class="network-hub" transform="translate(${hub.x} ${hub.y})"><circle r="30"/><circle r="9" fill="#42b9ff" stroke="none"/><text y="52" fill="#bcd9ea" font-family="monospace" font-size="11" text-anchor="middle">GATEWAY CENTRAL</text></g>
    `;
  }

  function renderSensorInventory() {
    const host = $("#sensorInventory");
    if (!host) return;
    const statusConfig = {
      online: [COLORS.green, "Online"],
      warning: [COLORS.amber, "Atenção"],
      maintenance: [COLORS.amber, "Manutenção"],
      offline: [COLORS.red, "Offline"],
    };
    host.innerHTML = sensorInventory.map(([id, location, status, last]) => {
      const [color, label] = statusConfig[status] || [COLORS.gray, "Desconhecido"];
      return `
        <div class="sensor-row" style="--state-color:${color}">
          <span class="sensor-state"><svg class="icon"><use href="#i-sensor"></use></svg></span>
          <span><strong>${escapeHtml(id)}</strong><small>${escapeHtml(location)} · ${escapeHtml(last)}</small></span>
          <span>${label}</span>
        </div>`;
    }).join("");
  }

  function updateDashboardValues() {
    const assignments = [
      ["#airTemperature", `${pt(state.dashboard.air, 1)} °C`],
      ["#surfaceTemperature", `${pt(state.dashboard.surface, 1)} °C`],
      ["#relativeHumidity", `${Math.round(state.dashboard.humidity)}%`],
      ["#windSpeed", `${pt(state.dashboard.wind, 1)} m/s`],
      ["#uhiIntensity", `+${pt(state.dashboard.uhi, 1)} °C`],
      ["#ndviValue", pt(state.dashboard.ndvi, 2)],
      ["#utciValue", `${pt(state.dashboard.utci, 1)} °C`],
      ["#precipitationValue", state.api.dashboard?.current?.precipitation_1h_mm == null ? "N/D" : `${pt(state.api.dashboard.current.precipitation_1h_mm, 2)} mm`],
      ["#weatherCondition", state.api.dashboard?.current?.weather_condition || "dados atuais"],
    ];
    assignments.forEach(([selector, value]) => setText(selector, value));

    const liveTimeline = state.api.dashboard?.forecast?.city_timeline;
    const wave = Array.isArray(liveTimeline) && liveTimeline.length >= 2
      ? liveTimeline.map((row) => Number(row.surface_temperature_c)).filter(Number.isFinite)
      : createWaveData(9221, 150, 0.24);
    renderSparkline("#cityWave", wave, COLORS.orange);
    renderOverviewCharts();
  }

  function downloadFile(filename, content, type = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function createReportData() {
    const live = state.api.dashboard;
    return {
      project: "SIPIC-RP",
      generated_at: live?.generated_at || new Date().toISOString(),
      data_status: live?.data_status || "contingency_demonstrative",
      model_version: live?.model_version || "sipic-hybrid-1.0.0",
      location: live?.location || { city: "Ribeirão Preto", state: "SP", country: "Brasil" },
      current_indicators: {
        air_temperature_c: Number(state.dashboard.air.toFixed(1)),
        apparent_temperature_c: Number(state.dashboard.utci.toFixed(1)),
        surface_temperature_c: Number(state.dashboard.surface.toFixed(1)),
        relative_humidity_percent: Math.round(state.dashboard.humidity),
        wind_speed_m_s: Number(state.dashboard.wind.toFixed(1)),
        urban_heat_island_c: Number(state.dashboard.uhi.toFixed(1)),
        ndvi: Number(state.dashboard.ndvi.toFixed(2)),
      },
      air_quality: live?.air_quality || null,
      alerts: live?.alerts || [],
      sectors: sectors.map((sector) => ({
        id: sector.code,
        name: sector.name,
        latitude: Number.isFinite(sector.latitude) ? sector.latitude : null,
        longitude: Number.isFinite(sector.longitude) ? sector.longitude : null,
        surface_temperature_c: sector.surface,
        air_temperature_c: sector.air,
        uhi_c: sector.uhi,
        ndvi: sector.ndvi,
        risk_score: sector.score,
        confidence_pct: sector.confidence ?? null,
      })),
      sources: live?.sources || [],
      disclaimer: live?.scientific_disclaimer || "Valores urbanos em contingência são demonstrativos. Não substitui alertas meteorológicos oficiais.",
    };
  }


  function escapePdfHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function formatReportDate(value) {
    try { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value)); }
    catch { return new Date().toLocaleString("pt-BR"); }
  }

  function openPdfReport(kind = "complete") {
    const report = createReportData();
    const indicators = report.current_indicators;
    const alerts = Array.isArray(report.alerts) ? report.alerts : [];
    const sectors = report.sectors || [];
    const title = kind === "sectors" ? "Indicadores por setor urbano" : kind === "map" ? "Resumo geográfico dos setores" : "Boletim de risco térmico urbano";
    const subtitle = kind === "sectors" ? "Comparativo dos indicadores monitorados em cada setor" : kind === "map" ? "Localização e situação resumida dos setores monitorados" : "Resumo executivo dos indicadores, riscos e recomendações operacionais";
    const rows = sectors.map((sector) => `<tr><td><strong>${escapePdfHtml(sector.name)}</strong><br><small>${escapePdfHtml(sector.id)}</small></td><td>${pt(sector.air_temperature_c,1)} °C</td><td>${pt(sector.surface_temperature_c,1)} °C</td><td>+${pt(sector.uhi_c,1)} °C</td><td>${pt(sector.ndvi,2)}</td><td><b>${Math.round(sector.risk_score || 0)}</b>/100</td></tr>`).join("");
    const alertHtml = alerts.length ? alerts.slice(0, 5).map((alert) => `<li><strong>${escapePdfHtml(alert.title || alert.type || "Alerta")}</strong><span>${escapePdfHtml(alert.description || alert.message || "Atenção aos indicadores monitorados.")}</span></li>`).join("") : '<li><strong>Sem alertas críticos</strong><span>Não há alertas críticos registrados no ciclo atual.</span></li>';
    const maxRisk = Math.max(1, ...sectors.map(s => Number(s.risk_score) || 0));
    const chartBars = sectors.map((s, i) => `<div class="barrow"><span>${escapePdfHtml(s.name)}</span><div class="bar"><i style="width:${Math.max(4, (Number(s.risk_score)||0)/maxRisk*100)}%"></i></div><b>${Math.round(s.risk_score||0)}</b></div>`).join("");
    const avgRisk = sectors.length ? Math.round(sectors.reduce((a,s)=>a+(Number(s.risk_score)||0),0)/sectors.length) : 0;
    const executive = kind === "complete" ? `<section class="executive page-break"><div class="kicker">RESUMO EXECUTIVO</div><h2>Leitura rápida para tomada de decisão</h2><div class="exec-grid"><article><span>Risco médio</span><strong>${avgRisk}/100</strong><p>Prioridade média entre os setores monitorados.</p></article><article><span>Setores monitorados</span><strong>${sectors.length}</strong><p>Cobertura do ciclo atual de observação.</p></article><article><span>Alertas ativos</span><strong>${alerts.length}</strong><p>Ocorrências que merecem acompanhamento.</p></article></div><div class="recommend"><b>Recomendação operacional</b><p>Priorize os setores com maior pontuação de risco e interprete os indicadores em conjunto com as condições meteorológicas e as fontes científicas disponíveis.</p></div></section>` : "";
    const body = `<div class="cover"><div class="cover-logo"><span class="mark">◉</span> SIPIC<span>•</span>RP</div><div class="cover-content"><p>RELATÓRIO DE MONITORAMENTO AMBIENTAL</p><h1>${title}</h1><h3>${subtitle}</h3><div class="cover-line"></div><small>Gerado em ${formatReportDate(report.generated_at)}</small></div><div class="cover-foot">Sistema de Inteligência e Predição de Indicadores Climáticos<br>Ribeirão Preto • São Paulo • Brasil</div></div>
      <div class="report"><header><div class="brand"><span class="mark">◉</span> SIPIC<span>•</span>RP</div><div class="meta"><b>RELATÓRIO CIENTÍFICO OPERACIONAL</b><br>${formatReportDate(report.generated_at)}</div></header>
      <main>${executive}<section class="hero"><p>MONITORAMENTO AMBIENTAL URBANO</p><h1>${title}</h1><div>${subtitle}</div></section>
      ${kind !== "map" ? `<section><h2>Indicadores principais</h2><div class="cards"><article><span>Temperatura do ar</span><strong>${pt(indicators.air_temperature_c,1)} °C</strong></article><article><span>Temperatura aparente</span><strong>${pt(indicators.apparent_temperature_c,1)} °C</strong></article><article><span>Umidade relativa</span><strong>${Math.round(indicators.relative_humidity_percent)}%</strong></article><article><span>Ilha de calor urbana</span><strong>+${pt(indicators.urban_heat_island_c,1)} °C</strong></article></div></section><section class="chart-card"><h2>Comparativo visual de risco por setor</h2>${chartBars || '<p>Sem dados suficientes para o gráfico.</p>'}</section>` : ""}
      <section><h2>${kind === "map" ? "Setores monitorados" : "Dados detalhados por setor"}</h2><table><thead><tr><th>Setor</th><th>Ar</th><th>Superfície</th><th>ICU</th><th>NDVI</th><th>Risco</th></tr></thead><tbody>${rows}</tbody></table></section>
      ${kind === "complete" ? `<section><h2>Alertas e pontos de atenção</h2><ul>${alertHtml}</ul></section><section class="note"><h2>Como interpretar este relatório</h2><p><b>Risco:</b> quanto maior a pontuação, maior a prioridade de acompanhamento. <b>ICU:</b> indica a intensidade da ilha de calor urbana. <b>NDVI:</b> representa a presença relativa de vegetação. Os valores devem ser interpretados em conjunto com as fontes e condições do ciclo monitorado.</p></section>` : ""}
      <footer><b>SIPIC-RP — Sistema de Inteligência e Predição de Indicadores Climáticos</b><br>${escapePdfHtml(report.disclaimer)}</footer></main></div>`;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><style>@page{size:A4;margin:0}.report{padding:16mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#17212b;margin:0;background:#fff}.cover{height:297mm;padding:22mm;background:linear-gradient(145deg,#073e49,#0b5966 60%,#167987);color:#fff;position:relative;overflow:hidden}.cover:after{content:"";position:absolute;width:260mm;height:260mm;border:1px solid rgba(255,255,255,.14);border-radius:50%;right:-90mm;bottom:-110mm}.cover-logo,.brand{font-size:25px;font-weight:800;letter-spacing:.4px}.cover-logo span,.brand span{color:#f1a45c}.mark{color:#f1a45c!important}.cover-content{margin-top:72mm;max-width:150mm;position:relative;z-index:1}.cover-content p,.kicker{font-size:10px;font-weight:bold;letter-spacing:2px;color:#f1c18f}.cover h1{font-size:39px;line-height:1.1;margin:14px 0}.cover h3{font-size:16px;font-weight:400;line-height:1.6;color:#dceff1}.cover-line{height:3px;width:70mm;background:#f1a45c;margin:26px 0}.cover-foot{position:absolute;bottom:22mm;font-size:10px;line-height:1.7;color:#b9d9dc}header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #dce4e8;padding-bottom:14px}.meta{text-align:right;font-size:9px;color:#65727c;line-height:1.6}.hero{padding:24px 0 16px}.hero p{font-size:9px;font-weight:bold;letter-spacing:1.5px;color:#0b7180;margin:0 0 8px}.hero h1{font-size:26px;margin:0 0 8px}.hero div{color:#56636d;font-size:12px;line-height:1.5}h2{font-size:16px;margin:22px 0 11px}.cards,.exec-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.cards article,.exec-grid article{background:#f1f6f6;border-radius:9px;padding:12px}.cards span,.exec-grid span{display:block;color:#65727c;font-size:9px;margin-bottom:6px}.cards strong,.exec-grid strong{font-size:17px;color:#0b5966}.exec-grid{grid-template-columns:repeat(3,1fr)}.exec-grid p{font-size:9px;color:#65727c;line-height:1.4;margin:7px 0 0}.executive{padding-top:10px}.executive h2{font-size:23px;margin-top:8px}.recommend{margin-top:12px;background:#fff5e9;border-left:4px solid #e77b32;padding:12px;font-size:11px;line-height:1.5}.recommend p{margin:5px 0 0}.chart-card{margin-top:20px;padding:13px 15px;border:1px solid #e1eaec;border-radius:9px}.chart-card h2{margin-top:0}.barrow{display:grid;grid-template-columns:32mm 1fr 10mm;gap:7px;align-items:center;font-size:9px;margin:8px 0}.bar{height:9px;background:#e7eeee;border-radius:10px;overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,#0b7180,#e77b32);border-radius:10px}.barrow b{text-align:right;color:#0b5966}table{width:100%;border-collapse:collapse;font-size:9px}th{text-align:left;background:#0b5966;color:#fff;padding:8px}td{padding:8px;border-bottom:1px solid #e4e9eb}tr:nth-child(even) td{background:#f7f9f9}small{color:#7b8790}ul{padding:0;list-style:none}li{padding:9px 11px;background:#fff7ed;border-left:4px solid #e77b32;margin-bottom:6px;font-size:10px}li span{display:block;color:#56636d;margin-top:3px}.note{background:#edf6f6;padding:13px;border-radius:8px;font-size:10px;line-height:1.6}.note h2{margin-top:0}footer{margin-top:24px;padding-top:11px;border-top:1px solid #dce4e8;color:#65727c;font-size:8px;line-height:1.5}.page-break{page-break-before:always}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.cover{page-break-after:always}.page-break{page-break-before:always}}</style></head><body>${body}<script>window.onload=()=>setTimeout(()=>window.print(),350);<\/script></body></html>`;
    const win = window.open("", "_blank", "width=960,height=760");
    if (!win) { showToast("Não foi possível gerar o PDF", "Permita pop-ups para criar o relatório.", "warning"); return; }
    win.document.open(); win.document.write(html); win.document.close();
    showToast("Relatório profissional pronto", "Na janela aberta, selecione 'Salvar como PDF'.");
  }

  function renderVisibleCharts() {
    switch (state.currentPage) {
      case "overview": renderOverviewCharts(); break;
      case "analytics": renderAnalyticsCharts(); break;
      case "venus": renderSpectralChart(); break;
      case "predictions": renderPredictionFullChart(); break;
      default: break;
    }
  }

  function renderDiagnostics(data) {
    const summary = $("#diagnosticsSummary");
    const log = $("#diagnosticsLog");
    if (!summary || !log) return;
    const checks = Object.entries(data?.checks || {});
    const online = checks.filter(([, v]) => v.ok).length;
    summary.textContent = `${online}/${checks.length} fontes online · diagnóstico em ${data?.latency_ms ?? "--"} ms`;
    const rows = [];
    for (const [source, item] of checks) {
      // Uma contingência automática que respondeu com sucesso é um estado operacional,
      // não um WARN. Reservamos WARN para cache/contingência degradada (ex.: referência
      // calculada localmente quando até a fonte alternativa externa falha).
      const level = !item.ok
        ? "error"
        : ["degraded", "stale"].includes(item.status)
          ? "warn"
          : "info";
      const successMessage = item.status === "fallback"
        ? `ONLINE · CONTINGÊNCIA AUTOMÁTICA · ${item.message || "fonte alternativa em uso"}`
        : item.status === "degraded"
          ? `CONTINGÊNCIA DEGRADADA · ${item.message || "referência alternativa em uso"}`
          : `ONLINE · HTTP ${item.http_status || 200}${item.message ? ` · ${item.message}` : ""}`;
      rows.push(`<div class="console-row"><span>${new Date().toLocaleTimeString("pt-BR")}</span><span class="console-level-${level}">${level.toUpperCase()}</span><span class="console-source">${source}</span><span class="console-message">${String(item.ok ? successMessage : `${item.message || "Falha"}${item.http_status ? ` · HTTP ${item.http_status}` : ""}`).replace(/[<>]/g, "")}</span></div>`);
    }
    for (const entry of (data?.logs || []).slice(-50)) {
      rows.push(`<div class="console-row"><span>${new Date(entry.timestamp).toLocaleTimeString("pt-BR")}</span><span class="console-level-${entry.level}">${String(entry.level).toUpperCase()}</span><span class="console-source">${String(entry.source).replace(/[<>]/g, "")}</span><span class="console-message">${String(entry.message).replace(/[<>]/g, "")}</span></div>`);
    }
    log.innerHTML = rows.length ? rows.join("") : '<div class="console-empty">Nenhum evento registrado.</div>';
  }

  async function loadDiagnostics(showFeedback = false) {
    try {
      const data = await apiFetch("/diagnostics", { retry: false });
      renderDiagnostics(data);
      if (showFeedback) showToast("Diagnóstico atualizado", `${data.summary?.online ?? 0}/${data.summary?.total ?? 0} fontes responderam.`);
      return data;
    } catch (error) {
      const log = $("#diagnosticsLog");
      if (log) log.innerHTML = `<div class="console-row"><span>${new Date().toLocaleTimeString("pt-BR")}</span><span class="console-level-error">ERROR</span><span class="console-source">SIPIC-RP</span><span class="console-message">${String(error.message).replace(/[<>]/g, "")}</span></div>`;
      if (showFeedback) showToast("Diagnóstico indisponível", error.message, "warning");
      return null;
    }
  }

  function setupEvents() {
    $$(".nav-item").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
    $$(".mobile-nav-item[data-page]").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
    $("#mobileMoreButton")?.addEventListener("click", openMobileSidebar);
    $("#demoModeButton")?.addEventListener("click", openDemoModal);
    $("#closeDemoButton")?.addEventListener("click", closeDemoModal);
    $("#playDemoButton")?.addEventListener("click", () => {
      if (demoState.timer) {
        stopDemoTimer();
        const button = $("#playDemoButton");
        if (button) button.innerHTML = '<svg class="icon"><use href="#i-play"></use></svg>Continuar simulação';
      } else {
        playDemoSequence();
      }
    });
    $("#resetDemoButton")?.addEventListener("click", resetDemoSequence);
    $("#demoHeatwaveButton")?.addEventListener("click", simulateHeatwaveRange);
    ["#demoStart", "#demoEnd"].forEach((selector) => $(selector)?.addEventListener("change", prepareDemo));
    $$('input[name="demoSpeed"]').forEach((input) => input.addEventListener("change", () => { demoState.speed = getDemoSpeed(); }));
    $("#demoModal")?.addEventListener("click", (event) => { if (event.target.id === "demoModal") closeDemoModal(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDemoModal(); });
    $$('[data-page-link]').forEach((button) => button.addEventListener("click", () => setPage(button.dataset.pageLink)));

    $("#mobileMenuButton")?.addEventListener("click", () => {
      const sidebar = $("#sidebar");
      if (sidebar?.classList.contains("open")) closeMobileSidebar();
      else openMobileSidebar();
    });
    $("#sidebarBackdrop")?.addEventListener("click", closeMobileSidebar);

    $("#fullscreenButton")?.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
      } catch {
        showToast("Modo de apresentação", "O navegador bloqueou a ativação de tela cheia.", "warning");
      }
    });

    $("#refreshWeatherComparisonButton")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await loadWeatherComparison(true); } catch {}
      finally { button.disabled = false; }
    });

    $("#refreshDashboardButton")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await loadDashboardData(true, true);
      } catch {
        // A mensagem de contingência é tratada em loadDashboardData.
      } finally {
        button.disabled = false;
      }
    });

    $$('[data-map-layer]').forEach((button) => button.addEventListener("click", () => {
      $$('[data-map-layer]').forEach((item) => item.classList.toggle("active", item === button));
      state.mapLayer = button.dataset.mapLayer;
      renderHeatMap();
      selectSector(state.selectedSectorId);
    }));

    $("#mapTimeSlider")?.addEventListener("input", (event) => {
      state.mapHour = Number(event.target.value);
      const label = $("#mapTimeLabel");
      if (label) label.textContent = `${String(state.mapHour).padStart(2, "0")}:00`;
      renderHeatMap();
      selectSector(state.selectedSectorId);
    });

    $("#treeCoverRange")?.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      $("#treeCoverValue").textContent = `+${value}%`;
      $("#surfaceReduction").textContent = `−${pt(value * 0.14, 1)} °C`;
      $("#utciReduction").textContent = `−${pt(value * 0.093, 1)} °C`;
    });

    $("#centerMapButton")?.addEventListener("click", () => {
      const map = $("#heatMapSvg");
      map?.animate([{ transform: "scale(1.015)" }, { transform: "scale(1)" }], { duration: 420, easing: "ease-out" });
      showToast("Mapa centralizado", "A extensão de Ribeirão Preto foi restaurada.");
    });

    $("#exportMapButton")?.addEventListener("click", () => openPdfReport("map"));

    $("#runPredictionButton")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      const original = button.innerHTML;
      button.textContent = "Atualizando fontes e modelo...";
      showToast("Novo ciclo iniciado", "Atualizando meteorologia, qualidade do ar, persistência e predições.", "info");
      try {
        await loadDashboardData(true, false);
        renderPredictionFullChart();
        showToast("Ciclo concluído", `Predição de ${state.api.dashboard?.forecast?.horizon_hours ?? 48} horas persistida no banco.`);
      } catch {
        // A falha já é apresentada pela rotina central.
      } finally {
        button.innerHTML = original;
        button.disabled = false;
      }
    });

    $("#refreshSensorsButton")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await loadDashboardData(true, true);
      } catch {
        // A rotina central apresenta a falha.
      } finally {
        button.disabled = false;
      }
    });

    $$('[data-report-action]').forEach((button) => button.addEventListener("click", () => {
      const action = button.dataset.reportAction;
      if (action === "complete") $("#downloadJsonButton")?.click();
      if (action === "sectors") $("#downloadCsvButton")?.click();
      if (action === "map") $("#exportMapButton")?.click();
    }));

    $("#refreshDiagnosticsButton")?.addEventListener("click", () => { void loadDiagnostics(true); });
    $("#clearDiagnosticsButton")?.addEventListener("click", () => { const log = $("#diagnosticsLog"); if (log) log.innerHTML = '<div class="console-empty">Console limpo.</div>'; });

    $("#testApiButton")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await testApiHealth(true);
      } finally {
        button.disabled = false;
      }
    });

    $("#copyApiUrlButton")?.addEventListener("click", async () => {
      const url = CONFIG.apiBaseUrl || "";
      if (!url) {
        showToast("API não configurada", "Defina apiBaseUrl no arquivo config.js.", "warning");
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      showToast("URL copiada", "A URL base da API foi copiada.");
    });

    $("#copySchemaButton")?.addEventListener("click", async () => {
      const text = $("#schemaCode")?.innerText || "";
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      showToast("Contrato copiado", "O exemplo JSON foi copiado para a área de transferência.");
    });

    $("#downloadJsonButton")?.addEventListener("click", () => openPdfReport("complete"));

    $("#downloadCsvButton")?.addEventListener("click", () => openPdfReport("sectors"));

    $("#printReportButton")?.addEventListener("click", () => window.print());

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderVisibleCharts, 180);
      if (window.innerWidth > 900) closeMobileSidebar();
    });

    window.addEventListener("hashchange", () => {
      const page = location.hash.replace("#", "");
      if (page) setPage(page, false);
    });
  }

  function initialize() {
    renderCityScene();
    renderMiniCity();
    renderSparkline("#venusWave", createWaveData(1448, 150, 0.33), COLORS.orange);
    renderSparkline("#cityWave", createWaveData(9221, 150, 0.24), COLORS.orange);
    renderHeatMap();
    renderHotspotList();
    selectSector(state.selectedSectorId);
    renderPredictionLists();
    renderForecastEvents();
    renderFeatureImportance();
    renderAnalyticsKpis();
    renderSensorNetwork();
    renderSensorInventory();
    setupEvents();
    void loadOpenWeatherKeyStatus();
    void loadDiagnostics(false);
    updateClocks();
    updateDashboardValues();
    renderApiStatus();
    setInterval(updateClocks, 1000);
    setInterval(() => {
      void loadDashboardData(false, false).catch(() => {});
    }, CONFIG.automaticRefreshMs);

    const initialPage = location.hash.replace("#", "");
    setPage(initialPage && $(`#page-${initialPage}`) ? initialPage : "overview", false);
    void loadDashboardData(false, true).catch(() => {});
  }


  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
