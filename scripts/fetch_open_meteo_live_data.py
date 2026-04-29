#!/usr/bin/env python3
"""Fetch live Open-Meteo weather signals on a 15-minute dashboard grid."""

from __future__ import annotations

import argparse
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OUTPUT_ROOT = Path("data/weather/open_meteo")
USER_AGENT = "odyceo-hackathon-open-meteo-live/1.0"
TIMEZONE = "Europe/Athens"

MINUTELY_15_VARIABLES = [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "precipitation",
    "rain",
    "wind_speed_10m",
    "wind_speed_80m",
    "wind_direction_10m",
    "wind_direction_80m",
    "wind_gusts_10m",
    "shortwave_radiation",
    "direct_radiation",
    "diffuse_radiation",
    "direct_normal_irradiance",
    "global_tilted_irradiance",
    "sunshine_duration",
    "is_day",
    "weather_code",
    "cape",
    "visibility",
]

CURRENT_VARIABLES = [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "precipitation",
    "rain",
    "weather_code",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "is_day",
]

HOURLY_AUX_VARIABLES = [
    "cloud_cover",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
]


@dataclass(frozen=True)
class Location:
    id: str
    name: str
    latitude: float
    longitude: float
    weight: float


LOCATIONS = [
    Location("athens", "Athens", 37.9838, 23.7275, 0.30),
    Location("thessaloniki", "Thessaloniki", 40.6401, 22.9444, 0.18),
    Location("crete", "Crete", 35.2401, 24.8093, 0.14),
    Location("western_greece", "Western Greece", 38.2466, 21.7346, 0.13),
    Location("thessaly", "Thessaly", 39.6390, 22.4191, 0.13),
    Location("peloponnese", "Peloponnese", 37.5079, 22.3735, 0.07),
    Location("aegean_islands", "Aegean Islands", 37.0850, 25.1500, 0.05),
]


def request_json(url: str, retries: int = 3) -> Any:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = response.read().decode("utf-8")
            return json.loads(payload)
        except (TimeoutError, urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as error:
            last_error = error
            if attempt == retries:
                break
            time.sleep(0.75 * attempt)

    raise RuntimeError(f"Failed to fetch {url}: {last_error}") from last_error


def camel_case(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


def build_forecast_url(locations: list[Location], forecast_steps: int, past_steps: int) -> str:
    params = {
        "latitude": ",".join(str(location.latitude) for location in locations),
        "longitude": ",".join(str(location.longitude) for location in locations),
        "timezone": TIMEZONE,
        "minutely_15": ",".join(MINUTELY_15_VARIABLES),
        "current": ",".join(CURRENT_VARIABLES),
        "hourly": ",".join(HOURLY_AUX_VARIABLES),
        "forecast_minutely_15": str(forecast_steps),
        "past_minutely_15": str(past_steps),
        "forecast_hours": str(max(1, math.ceil(forecast_steps / 4))),
        "past_hours": str(max(0, math.ceil(past_steps / 4))),
    }
    return f"{FORECAST_URL}?{urllib.parse.urlencode(params)}"


def as_list_response(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        return [payload]
    raise RuntimeError("Open-Meteo returned an unsupported response shape")


def series_rows(block: dict[str, Any], variables: list[str]) -> list[dict[str, Any]]:
    times = block.get("time")
    if not isinstance(times, list):
        return []

    rows: list[dict[str, Any]] = []
    for index, timestamp in enumerate(times):
        row: dict[str, Any] = {"timestamp": timestamp}
        for variable in variables:
            values = block.get(variable)
            if isinstance(values, list) and index < len(values):
                row[camel_case(variable)] = values[index]
        rows.append(row)
    return rows


def index_by_timestamp(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(row["timestamp"]): row for row in rows if row.get("timestamp")}


def hour_key(minutely_timestamp: str) -> str:
    return minutely_timestamp[:13] + ":00"


def enrich_with_hourly_aux(minutely_rows: list[dict[str, Any]], hourly_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    hourly_by_time = index_by_timestamp(hourly_rows)
    enriched: list[dict[str, Any]] = []
    for row in minutely_rows:
        aux = hourly_by_time.get(hour_key(str(row["timestamp"])), {})
        merged = dict(row)
        for variable in HOURLY_AUX_VARIABLES:
            key = camel_case(variable)
            if key in aux:
                merged[key] = aux[key]
        enriched.append(merged)
    return enriched


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def feature_scores(row: dict[str, Any]) -> dict[str, float | None]:
    shortwave = row.get("shortwaveRadiation")
    direct = row.get("directRadiation")
    wind80 = row.get("windSpeed80m")
    apparent = row.get("apparentTemperature")
    precipitation = row.get("precipitation")

    solar = None
    if isinstance(shortwave, (int, float)) and isinstance(direct, (int, float)):
        rain_penalty = clamp(float(precipitation or 0) / 2.0)
        solar = round(clamp((0.7 * float(shortwave) + 0.3 * float(direct)) / 900.0) * (1 - rain_penalty), 3)

    wind = None
    if isinstance(wind80, (int, float)):
        wind = round(clamp((float(wind80) / 14.0) ** 3), 3)

    demand = None
    if isinstance(apparent, (int, float)):
        heat_stress = clamp((float(apparent) - 24.0) / 16.0)
        cold_stress = clamp((10.0 - float(apparent)) / 14.0)
        demand = round(max(heat_stress, cold_stress), 3)

    return {
        "solarAvailabilityScore": solar,
        "windGenerationProxy": wind,
        "weatherDemandStress": demand,
    }


def add_features(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for row in rows:
        merged = dict(row)
        merged.update(feature_scores(row))
        enriched.append(merged)
    return enriched


def weighted_average(values: list[tuple[float, float]]) -> float | None:
    valid = [(value, weight) for value, weight in values if value is not None]
    if not valid:
        return None
    total_weight = sum(weight for _, weight in valid)
    if total_weight == 0:
        return None
    return round(sum(value * weight for value, weight in valid) / total_weight, 3)


def weighted_circular_mean_degrees(values: list[tuple[float, float]]) -> float | None:
    valid = [(value, weight) for value, weight in values if value is not None]
    if not valid:
        return None
    sin_sum = sum(math.sin(math.radians(value)) * weight for value, weight in valid)
    cos_sum = sum(math.cos(math.radians(value)) * weight for value, weight in valid)
    if sin_sum == 0 and cos_sum == 0:
        return None
    return round((math.degrees(math.atan2(sin_sum, cos_sum)) + 360) % 360, 1)


def weighted_mode(values: list[tuple[float, float]]) -> float | None:
    weights: dict[float, float] = {}
    for value, weight in values:
        weights[value] = weights.get(value, 0.0) + weight
    if not weights:
        return None
    return max(weights.items(), key=lambda item: item[1])[0]


def aggregate_value(key: str, values: list[tuple[float, float]]) -> float | None:
    if key.startswith("windDirection"):
        return weighted_circular_mean_degrees(values)
    if key == "weatherCode":
        return weighted_mode(values)
    return weighted_average(values)


def normalize_current(current: dict[str, Any]) -> dict[str, Any]:
    normalized = {}
    for key, value in current.items():
        normalized[camel_case(key)] = value
    return normalized


def aggregate_national(location_series: dict[str, dict[str, Any]], locations: list[Location]) -> list[dict[str, Any]]:
    timestamps = sorted({timestamp for series in location_series.values() for timestamp in series.keys()})
    location_by_id = {location.id: location for location in locations}
    output: list[dict[str, Any]] = []

    for timestamp in timestamps:
        rows = {
            location_id: series[timestamp]
            for location_id, series in location_series.items()
            if timestamp in series
        }
        merged: dict[str, Any] = {"timestamp": timestamp}
        keys = sorted({key for row in rows.values() for key in row.keys() if key != "timestamp"})
        for key in keys:
            numeric_values: list[tuple[float, float]] = []
            for location_id, row in rows.items():
                value = row.get(key)
                if isinstance(value, (int, float)):
                    numeric_values.append((float(value), location_by_id[location_id].weight))
            averaged = aggregate_value(key, numeric_values)
            if averaged is not None:
                merged[key] = averaged
        output.append(merged)

    return output


def normalize_response(payload: Any, locations: list[Location]) -> dict[str, Any]:
    responses = as_list_response(payload)
    if len(responses) != len(locations):
        raise RuntimeError(f"Expected {len(locations)} Open-Meteo responses, received {len(responses)}")

    regional: list[dict[str, Any]] = []
    location_series: dict[str, dict[str, Any]] = {}
    current: dict[str, Any] = {}

    for location, response in zip(locations, responses, strict=True):
        minutely_rows = series_rows(response.get("minutely_15", {}), MINUTELY_15_VARIABLES)
        hourly_rows = series_rows(response.get("hourly", {}), HOURLY_AUX_VARIABLES)
        rows = add_features(enrich_with_hourly_aux(minutely_rows, hourly_rows))

        regional.append(
            {
                "id": location.id,
                "name": location.name,
                "latitude": location.latitude,
                "longitude": location.longitude,
                "weight": location.weight,
                "elevation": response.get("elevation"),
                "current": normalize_current(response.get("current", {})),
                "series": rows,
            }
        )
        location_series[location.id] = index_by_timestamp(rows)
        current[location.id] = normalize_current(response.get("current", {}))

    national_series = aggregate_national(location_series, locations)
    return {
        "regional": regional,
        "nationalSeries": national_series,
        "currentByLocation": current,
        "units": {
            "minutely15": responses[0].get("minutely_15_units", {}),
            "hourlyAux": responses[0].get("hourly_units", {}),
            "current": responses[0].get("current_units", {}),
        },
    }


def write_outputs(url: str, payload: Any, normalized: dict[str, Any]) -> Path:
    fetched_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    stamp = fetched_at.replace(":", "").replace("-", "").replace(".", "_")
    raw_dir = OUTPUT_ROOT / "raw" / "forecast"
    normalized_dir = OUTPUT_ROOT / "normalized"
    raw_dir.mkdir(parents=True, exist_ok=True)
    normalized_dir.mkdir(parents=True, exist_ok=True)

    (raw_dir / f"{stamp}.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    latest = {
        "source": "open-meteo",
        "sourceUrl": url,
        "fetchedAtUtc": fetched_at,
        "timezone": TIMEZONE,
        "resolution": "PT15M",
        "resolutionSource": "forecast.minutely_15",
        "hourlyAuxiliaryVariables": HOURLY_AUX_VARIABLES,
        "health": {
            "status": "ok",
            "minutely15": "ok",
            "hourlyAux": "ok",
            "fallbackUsed": False,
            "note": (
                "Open-Meteo may interpolate 15-minute values outside high-resolution "
                "model regions; the dashboard still receives a native 15-minute API grid."
            ),
        },
        **normalized,
    }
    output_path = normalized_dir / "latest.json"
    output_path.write_text(json.dumps(latest, indent=2), encoding="utf-8")
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch live Open-Meteo 15-minute weather signals.")
    parser.add_argument("--forecast-steps", type=int, default=96, help="Number of future 15-minute steps.")
    parser.add_argument("--past-steps", type=int, default=4, help="Number of past 15-minute steps.")
    args = parser.parse_args()

    url = build_forecast_url(LOCATIONS, args.forecast_steps, args.past_steps)
    payload = request_json(url)
    normalized = normalize_response(payload, LOCATIONS)
    output_path = write_outputs(url, payload, normalized)
    national_series = normalized["nationalSeries"]

    print(
        json.dumps(
            {
                "output": output_path.as_posix(),
                "locations": len(LOCATIONS),
                "resolution": "PT15M",
                "nationalPoints": len(national_series),
                "firstTimestamp": national_series[0]["timestamp"] if national_series else None,
                "lastTimestamp": national_series[-1]["timestamp"] if national_series else None,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
