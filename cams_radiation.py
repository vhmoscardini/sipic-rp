#!/usr/bin/env python3
"""Small CAMS ADS adapter used by the SIPIC-RP local gateway.

The script intentionally keeps the CAMS credential server-side. It requests the
latest available all-sky hourly time series for Ribeirão Preto and emits compact
JSON so the Node gateway does not need to understand NetCDF/GRIB.
"""
import csv
import io
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone


def fail(message):
    print(json.dumps({"ok": False, "message": message}, ensure_ascii=False))
    raise SystemExit(1)


def parse_number(value):
    try:
        n = float(str(value).strip())
        return n if n == n and abs(n) != float("inf") else None
    except (TypeError, ValueError):
        return None


def latest_available_date():
    explicit = os.getenv("CAMS_DATE", "").strip()
    if explicit:
        return explicit, "environment"

    url = "https://ads.atmosphere.copernicus.eu/api/catalogue/v1/collections/cams-solar-radiation-timeseries"
    try:
        request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "SIPIC-RP CAMS adapter"})
        with urllib.request.urlopen(request, timeout=12) as response:
            metadata = json.loads(response.read().decode("utf-8"))
        intervals = (((metadata or {}).get("extent") or {}).get("temporal") or {}).get("interval") or []
        end = intervals[0][1] if intervals and len(intervals[0]) > 1 else None
        if end:
            return str(end)[:10], "catalogue"
    except Exception:
        pass

    # CAMS Solar Radiation é histórico e normalmente tem algum atraso de publicação.
    # Em vez de pedir "ontem" (que frequentemente ainda não existe no catálogo),
    # usa uma data conservadora quando o catálogo não puder ser consultado.
    return (datetime.now(timezone.utc) - timedelta(days=45)).date().isoformat(), "conservative_fallback"


def parse_cams_csv(text):
    lines = text.splitlines()
    names = None
    for line in lines:
        if line.startswith("# Observation period"):
            names = line.lstrip("# ").split(";")
            break
    if not names:
        fail("Resposta CAMS sem cabeçalho reconhecível.")

    rows = []
    reader = csv.DictReader(io.StringIO("\n".join(lines)), fieldnames=names, delimiter=";")
    for row in reader:
        obs = row.get("Observation period")
        if not obs or obs.startswith("#"):
            continue
        parts = obs.split("/")
        timestamp = parts[0].strip() if parts else None
        if not timestamp:
            continue
        rows.append({
            "timestamp": timestamp,
            "ghi_wm2": parse_number(row.get("GHI")),
            "bhi_wm2": parse_number(row.get("BHI")),
            "dhi_wm2": parse_number(row.get("DHI")),
            "dni_wm2": parse_number(row.get("BNI")),
            "ghi_clear_wm2": parse_number(row.get("Clear sky GHI")),
            "dni_clear_wm2": parse_number(row.get("Clear sky BNI")),
            "dhi_clear_wm2": parse_number(row.get("Clear sky DHI")),
            "reliability_pct": parse_number(row.get("Reliability")),
        })
    return rows


def main():
    api_key = os.getenv("CAMS_API_KEY", "").strip()
    if not api_key:
        fail("CAMS_API_KEY não configurada.")

    try:
        import cdsapi
    except ImportError:
        fail("Dependência cdsapi ausente. Execute: pip install -r requirements.txt")

    lat = float(os.getenv("SIPIC_RADIATION_LAT", "-21.1775"))
    lon = float(os.getenv("SIPIC_RADIATION_LON", "-47.8103"))
    requested_date, date_source = latest_available_date()

    client = cdsapi.Client(
        url="https://ads.atmosphere.copernicus.eu/api",
        key=api_key,
        quiet=True,
        progress=False,
    )

    request = {
        "sky_type": "observed_cloud",
        "location": {"latitude": lat, "longitude": lon},
        "altitude": ["-999"],
        "date": [f"{requested_date}/{requested_date}"],
        "time_step": "1hour",
        "time_reference": "universal_time",
        "format": "csv",
    }

    remote = client.retrieve("cams-solar-radiation-timeseries", request)
    path = remote.download()
    with open(path, "r", encoding="utf-8") as handle:
        text = handle.read()

    rows = parse_cams_csv(text)
    if not rows:
        fail("CAMS não retornou registros para a data solicitada.")

    print(json.dumps({
        "ok": True,
        "source": "CAMS Solar Radiation Time-Series",
        "dataset": "cams-solar-radiation-timeseries",
        "sky_type": "observed_cloud",
        "date": requested_date,
        "date_source": date_source,
        "location": {"latitude": lat, "longitude": lon},
        "temporal_resolution": "1hour",
        "time_reference": "UTC",
        "rows": rows,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
