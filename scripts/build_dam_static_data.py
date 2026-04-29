#!/usr/bin/env python3
"""Build static DAM Parquet and JSON assets for the frontend demo."""

from __future__ import annotations

import argparse
import json
import warnings
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "data/dam/manifest.json"
OUT_DIR = ROOT / "public/data/dam"


@dataclass(frozen=True)
class BuildSummary:
    generated_at_utc: str
    price_files: int
    curve_files: int
    price_rows: int
    curve_rows: int
    first_market_date: str | None
    last_market_date: str | None
    curve_market_dates: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="from_date", default="2026-04-29")
    parser.add_argument("--to", dest="to_date", default="2026-04-29")
    parser.add_argument("--results-max-rows", type=int, default=1200)
    parser.add_argument("--curve-days", type=int, default=1)
    parser.add_argument("--curve-max-rows", type=int, default=1200)
    return parser.parse_args()


def read_manifest() -> list[dict[str, object]]:
    with MANIFEST_PATH.open() as handle:
        manifest = json.load(handle)
    return list(manifest["assets"])


def selected_assets(source_code: str, from_date: str, to_date: str) -> list[dict[str, object]]:
    assets = [
        asset
        for asset in read_manifest()
        if asset["source_code"] == source_code
        and from_date <= str(asset["market_date"]) <= to_date
        and str(asset["extension"]) == "xlsx"
    ]
    return sorted(assets, key=lambda asset: (str(asset["market_date"]), str(asset["filename"])))


def local_to_utc_series(values: pd.Series) -> pd.Series:
    localized = pd.to_datetime(values).dt.tz_localize(
        "Europe/Athens",
        ambiguous="infer",
        nonexistent="shift_forward",
    )
    return localized.dt.tz_convert("UTC").dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def local_label(value: object) -> str:
    timestamp = pd.to_datetime(value)
    return timestamp.strftime("%Y-%m-%d %H:%M")


def number_or_none(value: object) -> float | None:
    parsed = pd.to_numeric(value, errors="coerce")
    return None if pd.isna(parsed) else float(parsed)


def parse_results(asset: dict[str, object], max_rows: int | None) -> pd.DataFrame:
    path = ROOT / str(asset["output_path"])
    raw = pd.read_excel(path, nrows=max_rows)
    raw = raw[raw["BIDDING_ZONE_DESCR"].astype(str).eq("Mainland Greece")]

    normalized = pd.DataFrame(
        {
            "market_date": str(asset["market_date"]),
            "delivery_mtu_local": raw["DELIVERY_MTU"].map(local_label),
            "timestamp_utc": local_to_utc_series(raw["DELIVERY_MTU"]),
            "mtu": pd.to_numeric(raw["SORT"], errors="coerce").astype("Int64"),
            "duration_minutes": pd.to_numeric(raw["DELIVERY_DURATION"], errors="coerce").astype("Int64"),
            "mcp_eur_per_mwh": pd.to_numeric(raw["MCP"], errors="coerce"),
            "total_trades": pd.to_numeric(raw["TOTAL_TRADES"], errors="coerce"),
            "published_at_local": raw["PUB_TIME"].map(local_label),
            "version": pd.to_numeric(raw["VER"], errors="coerce").astype("Int64"),
            "source_file": str(asset["filename"]),
        }
    )

    return (
        normalized.dropna(subset=["mtu", "mcp_eur_per_mwh"])
        .groupby(
            [
                "market_date",
                "delivery_mtu_local",
                "timestamp_utc",
                "mtu",
                "duration_minutes",
                "published_at_local",
                "version",
                "source_file",
            ],
            as_index=False,
            dropna=False,
        )
        .agg(mcp_eur_per_mwh=("mcp_eur_per_mwh", "first"), total_trades=("total_trades", "max"))
        .sort_values(["market_date", "mtu"])
    )


def parse_curves(asset: dict[str, object], max_rows: int | None) -> pd.DataFrame:
    path = ROOT / str(asset["output_path"])
    raw = pd.read_excel(path, nrows=max_rows)
    raw = raw[pd.to_numeric(raw["DELIVERY_DURATION"], errors="coerce").eq(15)]

    return pd.DataFrame(
        {
            "market_date": str(asset["market_date"]),
            "delivery_mtu_local": raw["DELIVERY_MTU"].map(local_label),
            "timestamp_utc": local_to_utc_series(raw["DELIVERY_MTU"]),
            "mtu": pd.to_numeric(raw["SORT"], errors="coerce").astype("Int64"),
            "side": raw["SIDE_DESCR"].astype(str),
            "curve_order": pd.to_numeric(raw["AA"], errors="coerce").astype("Int64"),
            "quantity_mwh": raw["QUANTITY"].map(number_or_none),
            "unit_price_eur_per_mwh": raw["UNITPRICE"].map(number_or_none),
            "published_at_local": raw["PUB_TIME"].map(local_label),
            "version": pd.to_numeric(raw["VER"], errors="coerce").astype("Int64"),
            "source_file": str(asset["filename"]),
        }
    ).dropna(subset=["mtu", "curve_order", "quantity_mwh", "unit_price_eur_per_mwh"])


def records_for_json(frame: pd.DataFrame) -> list[dict[str, object]]:
    records = frame.where(pd.notnull(frame), None).to_dict(orient="records")
    for record in records:
        for key, value in list(record.items()):
            if hasattr(value, "item"):
                record[key] = value.item()
    return records


def main() -> None:
    warnings.filterwarnings("ignore", message="Workbook contains no default style")
    args = parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    price_assets = selected_assets("Results", args.from_date, args.to_date)
    curve_assets = selected_assets("AggrCurves", args.from_date, args.to_date)[-args.curve_days :]

    prices = pd.concat([parse_results(asset, args.results_max_rows) for asset in price_assets], ignore_index=True)
    curves = pd.concat([parse_curves(asset, args.curve_max_rows) for asset in curve_assets], ignore_index=True)

    prices.to_parquet(OUT_DIR / "dam_prices.parquet", index=False)
    curves.to_parquet(OUT_DIR / "dam_curves.parquet", index=False)

    representative_curve = curves.sort_values(["market_date", "mtu", "side", "curve_order"])

    (OUT_DIR / "dam_prices.json").write_text(json.dumps(records_for_json(prices), separators=(",", ":")))
    (OUT_DIR / "dam_curves_sample.json").write_text(
        json.dumps(records_for_json(representative_curve), separators=(",", ":"))
    )

    summary = BuildSummary(
        generated_at_utc=datetime.now(tz=UTC).isoformat().replace("+00:00", "Z"),
        price_files=len(price_assets),
        curve_files=len(curve_assets),
        price_rows=len(prices),
        curve_rows=len(curves),
        first_market_date=str(prices["market_date"].min()) if not prices.empty else None,
        last_market_date=str(prices["market_date"].max()) if not prices.empty else None,
        curve_market_dates=sorted(str(value) for value in curves["market_date"].dropna().unique()),
    )
    (OUT_DIR / "dam_static_manifest.json").write_text(json.dumps(asdict(summary), indent=2))
    print(json.dumps(asdict(summary), indent=2))


if __name__ == "__main__":
    main()
