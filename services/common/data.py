from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd
import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
CONVEX_EXPORT = Path("/tmp/general-unintelligence-convex-export")
DEMO_ARTIFACTS = REPO_ROOT / "public" / "demo_artifacts"


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open() as handle:
        return [json.loads(line) for line in handle if line.strip()]


def load_dam_prices() -> pd.DataFrame:
    export_file = CONVEX_EXPORT / "damPriceIntervals" / "documents.jsonl"
    if export_file.exists():
        frame = pd.DataFrame(load_jsonl(export_file))
        frame = frame.rename(
            columns={
                "deliveryDurationMinutes": "duration_minutes",
                "mcpEurPerMwh": "price",
                "timestamp": "timestamp_local",
            }
        )
    else:
        frame = pd.read_json(REPO_ROOT / "public" / "data" / "dam" / "dam_prices.json")
        frame = frame.rename(
            columns={
                "mcp_eur_per_mwh": "price",
                "market_date": "marketDate",
                "duration_minutes": "duration_minutes",
                "timestamp_utc": "timestampUtc",
            }
        )
    if frame.empty:
        return frame

    frame["marketDate"] = frame["marketDate"].astype(str)
    frame["mtu"] = frame["mtu"].astype(int)
    frame["duration_minutes"] = frame["duration_minutes"].astype(int)
    frame["version"] = frame.get("version", 1).fillna(1).astype(int)
    frame["price"] = frame["price"].astype(float)
    sort_cols = ["marketDate", "mtu", "version"]
    frame = frame.sort_values(sort_cols).drop_duplicates(["marketDate", "mtu"], keep="last")
    frame["timestamp"] = pd.to_datetime(frame.get("timestamp_local", frame.get("timestampUtc")), utc=True)
    return frame.sort_values(["marketDate", "mtu"]).reset_index(drop=True)


def load_archetype(slug: str) -> dict[str, Any]:
    path = REPO_ROOT / "data" / "archetypes" / f"{slug}.yaml"
    with path.open() as handle:
        return yaml.safe_load(handle)


def write_json_artifact(name: str, payload: dict[str, Any]) -> Path:
    DEMO_ARTIFACTS.mkdir(parents=True, exist_ok=True)
    path = DEMO_ARTIFACTS / name
    path.write_text(json.dumps(payload, indent=2, sort_keys=True))
    return path

