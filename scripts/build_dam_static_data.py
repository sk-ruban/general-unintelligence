#!/usr/bin/env python3
"""Build demo DAM prices and recent AggrCurve Parquet assets for the frontend."""

from __future__ import annotations

import argparse
import json
import warnings
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Callable

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "data/dam/manifest.json"
OUT_DIR = ROOT / "public/data/dam"
RESULT_COLUMNS = [
    "BIDDING_ZONE_DESCR",
    "DELIVERY_MTU",
    "DELIVERY_DURATION",
    "SORT",
    "MCP",
    "TOTAL_TRADES",
    "PUB_TIME",
    "VER",
]
CURVE_COLUMNS = [
    "SIDE_DESCR",
    "DELIVERY_MTU",
    "SORT",
    "DELIVERY_DURATION",
    "AA",
    "QUANTITY",
    "UNITPRICE",
    "PUB_TIME",
    "VER",
]


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
    parser.add_argument("--from", dest="from_date", default=None)
    parser.add_argument("--to", dest="to_date", default=None)
    parser.add_argument("--price-days", type=int, default=1)
    parser.add_argument("--results-max-rows", type=int, default=None)
    parser.add_argument("--curve-days", type=int, default=7)
    parser.add_argument("--curve-max-rows", type=int, default=None)
    parser.add_argument("--json-curve-days", type=int, default=1)
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


def date_bounds(assets: list[dict[str, object]]) -> tuple[str, str]:
    dates = sorted(str(asset["market_date"]) for asset in assets if str(asset["extension"]) == "xlsx")
    if not dates:
        raise ValueError("No XLSX DAM assets found in manifest")
    return dates[0], dates[-1]


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
    raw = pd.read_excel(path, nrows=max_rows, usecols=RESULT_COLUMNS)
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
    raw = pd.read_excel(path, nrows=max_rows, usecols=CURVE_COLUMNS)
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


def parse_asset_frames(
    label: str,
    assets: list[dict[str, object]],
    parser: Callable[[dict[str, object], int | None], pd.DataFrame],
    max_rows: int | None,
) -> pd.DataFrame:
    print(f"Parsing {label}: {len(assets)} files", flush=True)
    frames = []
    for index, asset in enumerate(assets, start=1):
        print(f"  [{index}/{len(assets)}] {asset['market_date']} {asset['filename']}", flush=True)
        frames.append(parser(asset, max_rows))
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def main() -> None:
    warnings.filterwarnings("ignore", message="Workbook contains no default style")
    args = parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest_assets = read_manifest()
    manifest_from_date, manifest_to_date = date_bounds(manifest_assets)
    from_date = args.from_date or manifest_from_date
    to_date = args.to_date or manifest_to_date

    price_assets = selected_assets("Results", from_date, to_date)
    if args.price_days is not None:
        price_assets = price_assets[-args.price_days :]
    curve_assets = selected_assets("AggrCurves", from_date, to_date)
    if args.curve_days is not None:
        curve_assets = curve_assets[-args.curve_days :]

    prices = parse_asset_frames("Results", price_assets, parse_results, args.results_max_rows)
    curves = parse_asset_frames("AggrCurves", curve_assets, parse_curves, args.curve_max_rows)

    prices.to_parquet(OUT_DIR / "dam_prices.parquet", index=False)
    curves.to_parquet(OUT_DIR / "dam_curves.parquet", index=False)

    json_curve_dates = sorted(str(value) for value in curves["market_date"].dropna().unique())[-args.json_curve_days :]
    representative_curve = curves[curves["market_date"].isin(json_curve_dates)].sort_values(
        ["market_date", "mtu", "side", "curve_order"]
    )

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
