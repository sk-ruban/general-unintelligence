from __future__ import annotations

import argparse

from services.common.data import load_archetype, load_dam_prices, write_json_artifact
from services.optimizer.lp_dispatch import LpInput, SystemTwinSpec, solve_dispatch


def generate(asset_slug: str = "metlen_karatzis_thessaly", market_date: str | None = None) -> dict:
    prices = load_dam_prices()
    market_date = market_date or str(prices["marketDate"].max())
    day = prices[prices["marketDate"] == market_date].sort_values("mtu")
    twin = SystemTwinSpec(**load_archetype(asset_slug))
    duration = int(day["duration_minutes"].iloc[0])
    base_prices = day["price"].astype(float).tolist()
    initial_soc = twin.contracted_energy_mwh * 0.5
    scenarios = {
        "base": (base_prices, twin, "balanced", None),
        "gas_shock": (_gas_shock(base_prices), twin, "balanced", None),
        "heatwave": (base_prices, _heatwave_twin(twin), "balanced", None),
        "high_uncertainty": (base_prices, twin, "conservative", [max(4.0, abs(price) * 0.12) for price in base_prices]),
    }
    outputs = {}
    for name, (scenario_prices, scenario_twin, risk_mode, sigma) in scenarios.items():
        out = solve_dispatch(
            LpInput(
                prices_eur_per_mwh=scenario_prices,
                resolution_minutes=duration,
                twin=scenario_twin,
                forecast_uncertainty_sigma=sigma,
                initial_soc_mwh=initial_soc,
                terminal_soc_mwh=initial_soc,
                risk_mode=risk_mode,
            )
        )
        outputs[name] = out.model_dump()
        outputs[name]["input_prices_eur_per_mwh"] = [round(price, 2) for price in scenario_prices]

    payload = {
        "asset_slug": asset_slug,
        "asset": twin.model_dump(),
        "market_date": market_date,
        "resolution_minutes": duration,
        "scenarios": outputs,
        "price_points": [
            {
                "marketDate": row.marketDate,
                "mtu": int(row.mtu),
                "timestamp": str(row.timestamp),
                "price_eur_per_mwh": round(float(row.price), 2),
            }
            for row in day.itertuples()
        ],
    }
    write_json_artifact(f"demo_dispatch_{asset_slug}.json", payload)
    if asset_slug == "metlen_karatzis_thessaly":
        write_json_artifact("demo_dispatch.json", payload)
    return payload


def _gas_shock(prices: list[float]) -> list[float]:
    shocked = []
    for index, price in enumerate(prices):
        hour = index / 4
        premium = 0.4 if 17 <= hour <= 21 or price > 150 else 0.12
        shocked.append(round(price * (1 + premium), 2))
    return shocked


def _heatwave_twin(twin: SystemTwinSpec) -> SystemTwinSpec:
    data = twin.model_dump()
    data["power_mw"] = round(twin.power_mw * 0.9, 3)
    data["rte_pct"] = max(1.0, twin.rte_pct - 3.0)
    data["aux_load_kw"]["active"] = round(data["aux_load_kw"]["active"] * 1.2, 3)
    return SystemTwinSpec(**data)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", default="metlen_karatzis_thessaly")
    parser.add_argument("--market-date")
    args = parser.parse_args()
    print(generate(args.asset, args.market_date)["market_date"])

