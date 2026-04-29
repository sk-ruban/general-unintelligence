#!/usr/bin/env python3
"""Fetch delayed Dutch TTF futures data from ICE's product-guide endpoints.

This is a demo-only adapter for the hackathon dashboard. It resolves the
current ICE contract list first because `marketId` identifies a specific strip,
not the Dutch TTF product as a whole.
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


ICE_BASE_URL = "https://www.ice.com"
SPEC_ID = 27996665
PRODUCT_ID = 4331
HUB_ID = 7979
OUTPUT_ROOT = Path("data/fuel/ttf")
USER_AGENT = "odyceo-hackathon-ttf-fetcher/1.0"
DEFAULT_EFFICIENCY = 0.55


@dataclass(frozen=True)
class Contract:
    market_id: int
    market_strip: str
    last_price: float | None
    change: float | None
    volume: int | None
    last_time_utc: str | None
    end_date_utc: str | None


@dataclass(frozen=True)
class PricePoint:
    timestamp_utc: str
    price_eur_per_mwh_gas: float


def request_json(url: str, retries: int = 3) -> Any:
    headers = {
        "Accept": "application/json,text/plain,*/*",
        "Referer": f"{ICE_BASE_URL}/products/{SPEC_ID}/Dutch-TTF-Natural-Gas-Futures/data",
        "User-Agent": USER_AGENT,
    }
    request = urllib.request.Request(url, headers=headers)
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


def parse_ice_last_time(value: str | None) -> str | None:
    if not value:
        return None
    parsed = datetime.strptime(value, "%m/%d/%Y %I:%M %p GMT")
    return parsed.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z")


def parse_ice_bar_time(value: str) -> str:
    parsed = datetime.strptime(value, "%a %b %d %H:%M:%S %Y")
    return parsed.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z")


def parse_epoch_ms(value: int | None) -> str | None:
    if value is None:
        return None
    return datetime.fromtimestamp(value / 1000, UTC).isoformat().replace("+00:00", "Z")


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)


def fetch_contracts() -> list[Contract]:
    params = urllib.parse.urlencode({"productId": PRODUCT_ID, "hubId": HUB_ID})
    url = f"{ICE_BASE_URL}/marketdata/api/productguide/charting/contract-data?{params}"
    rows = request_json(url)
    if not isinstance(rows, list):
        raise RuntimeError("ICE contract endpoint returned a non-list response")

    contracts: list[Contract] = []
    for row in rows:
        contracts.append(
            Contract(
                market_id=int(row["marketId"]),
                market_strip=str(row["marketStrip"]),
                last_price=to_float(row.get("lastPrice")),
                change=to_float(row.get("change")),
                volume=int(row["volume"]) if row.get("volume") is not None else None,
                last_time_utc=parse_ice_last_time(row.get("lastTime")),
                end_date_utc=parse_epoch_ms(row.get("endDate")),
            )
        )
    return contracts


def select_contract(contracts: list[Contract], mode: str, market_id: int | None) -> Contract:
    if not contracts:
        raise RuntimeError("ICE returned no Dutch TTF contracts")

    if market_id is not None:
        for contract in contracts:
            if contract.market_id == market_id:
                return contract
        raise RuntimeError(f"marketId {market_id} was not present in the current ICE contract list")

    if mode == "highest-volume":
        return max(contracts, key=lambda item: item.volume or 0)

    return contracts[0]


def fetch_bars(market_id: int, kind: str, historical_span: str) -> list[PricePoint]:
    if kind == "intraday":
        path = "/marketdata/api/productguide/charting/data/current-day"
        params = urllib.parse.urlencode({"marketId": market_id})
    else:
        path = "/marketdata/api/productguide/charting/data/historical"
        params = urllib.parse.urlencode({"marketId": market_id, "historicalSpan": historical_span})

    payload = request_json(f"{ICE_BASE_URL}{path}?{params}")
    bars = payload.get("bars") if isinstance(payload, dict) else None
    if not isinstance(bars, list):
        raise RuntimeError("ICE chart endpoint returned no bars list")

    points: list[PricePoint] = []
    for timestamp, price in bars:
        points.append(
            PricePoint(
                timestamp_utc=parse_ice_bar_time(str(timestamp)),
                price_eur_per_mwh_gas=float(price),
            )
        )
    return points


def fuel_cost(price: float | None, efficiency: float) -> float | None:
    if price is None:
        return None
    return round(price / efficiency, 3)


def serialize_contract(contract: Contract) -> dict[str, Any]:
    return {
        "marketId": contract.market_id,
        "marketStrip": contract.market_strip,
        "lastPrice": contract.last_price,
        "change": contract.change,
        "volume": contract.volume,
        "lastTimeUtc": contract.last_time_utc,
        "endDateUtc": contract.end_date_utc,
    }


def serialize_point(point: PricePoint) -> dict[str, Any]:
    return {
        "timestampUtc": point.timestamp_utc,
        "priceEurPerMwhGas": point.price_eur_per_mwh_gas,
    }


def write_outputs(
    contract: Contract,
    contracts: list[Contract],
    intraday: list[PricePoint],
    historical: list[PricePoint],
    efficiency: float,
) -> Path:
    normalized_dir = OUTPUT_ROOT / "normalized"
    normalized_dir.mkdir(parents=True, exist_ok=True)

    fetched_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    latest = {
        "source": "ice-delayed-product-guide",
        "sourceUrl": f"{ICE_BASE_URL}/products/{SPEC_ID}/Dutch-TTF-Natural-Gas-Futures/data",
        "fetchedAtUtc": fetched_at,
        "instrument": {
            "name": "Dutch TTF Natural Gas Futures",
            "specId": SPEC_ID,
            "productId": PRODUCT_ID,
            "hubId": HUB_ID,
            "unit": "EUR/MWh gas",
        },
        "selectedContract": serialize_contract(contract),
        "priceEurPerMwhGas": contract.last_price,
        "thermalProxy": {
            "efficiency": efficiency,
            "fuelCostEurPerMwhElectric": fuel_cost(contract.last_price, efficiency),
        },
        "contracts": [serialize_contract(item) for item in contracts],
        "intradayBars": [serialize_point(item) for item in intraday],
        "historicalBars": [serialize_point(item) for item in historical],
        "demoCaveat": (
            "ICE website-delayed endpoint for hackathon demo use. "
            "Not a licensed production market-data feed."
        ),
    }

    output_path = normalized_dir / "latest.json"
    output_path.write_text(json.dumps(latest, indent=2), encoding="utf-8")
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch delayed ICE Dutch TTF data for dashboard demo.")
    parser.add_argument("--contract", choices=["front-month", "highest-volume"], default="front-month")
    parser.add_argument("--market-id", type=int, default=None)
    parser.add_argument("--historical-span", choices=["1", "2", "3"], default="1")
    parser.add_argument("--efficiency", type=float, default=DEFAULT_EFFICIENCY)
    args = parser.parse_args()

    contracts = fetch_contracts()
    selected = select_contract(contracts, args.contract, args.market_id)
    intraday = fetch_bars(selected.market_id, "intraday", args.historical_span)
    historical = fetch_bars(selected.market_id, "historical", args.historical_span)
    output_path = write_outputs(selected, contracts, intraday, historical, args.efficiency)

    print(
        json.dumps(
            {
                "output": output_path.as_posix(),
                "marketStrip": selected.market_strip,
                "marketId": selected.market_id,
                "priceEurPerMwhGas": selected.last_price,
                "fuelCostEurPerMwhElectric": fuel_cost(selected.last_price, args.efficiency),
                "intradayBars": len(intraday),
                "historicalBars": len(historical),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
