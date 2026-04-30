from __future__ import annotations

import argparse
from collections import defaultdict

import numpy as np
import pandas as pd

from services.common.data import load_archetype, load_dam_prices, write_json_artifact
from services.forecast.run_model_lab import build_feature_frame, walk_forward_cv
from services.optimizer.lp_dispatch import LpInput, SystemTwinSpec, solve_dispatch


def run_backtest(asset_slug: str = "metlen_karatzis_thessaly") -> dict:
    prices = load_dam_prices()
    forecast_artifacts = walk_forward_cv(build_feature_frame(prices))
    predictions = forecast_artifacts.predictions
    twin = SystemTwinSpec(**load_archetype(asset_slug))
    daily = []
    risk_adjusted_daily = []

    for date, group in predictions.groupby("marketDate", sort=True):
        ordered = group.sort_values("mtu")
        realized = ordered["price"].astype(float).tolist()
        forecast = ordered["pred"].astype(float).tolist()
        uncertainty_sigma = _uncertainty_sigma(
            ordered["p10"].astype(float).tolist(),
            ordered["p90"].astype(float).tolist(),
        )
        duration = int(group["duration_minutes"].iloc[0])
        initial_soc = twin.contracted_energy_mwh * 0.5
        forecast_schedule = solve_dispatch(
            LpInput(
                prices_eur_per_mwh=forecast,
                resolution_minutes=duration,
                twin=twin,
                initial_soc_mwh=initial_soc,
                terminal_soc_mwh=initial_soc,
                risk_mode="balanced",
            )
        )
        risk_adjusted_schedule = solve_dispatch(
            LpInput(
                prices_eur_per_mwh=forecast,
                resolution_minutes=duration,
                twin=twin,
                forecast_uncertainty_sigma=uncertainty_sigma,
                initial_soc_mwh=initial_soc,
                terminal_soc_mwh=initial_soc,
                risk_mode="conservative",
            )
        )
        perfect_schedule = solve_dispatch(
            LpInput(
                prices_eur_per_mwh=realized,
                resolution_minutes=duration,
                twin=twin,
                initial_soc_mwh=initial_soc,
                terminal_soc_mwh=initial_soc,
                risk_mode="balanced",
            )
        )
        dt = duration / 60.0
        realized_eur = _realized_value(realized, forecast_schedule.charge_mw, forecast_schedule.discharge_mw, dt)
        risk_realized_eur = _realized_value(
            realized,
            risk_adjusted_schedule.charge_mw,
            risk_adjusted_schedule.discharge_mw,
            dt,
        )
        perfect_eur = _realized_value(realized, perfect_schedule.charge_mw, perfect_schedule.discharge_mw, dt)
        daily.append(
            {
                "date": date,
                "realized_eur": round(realized_eur, 2),
                "perfect_eur": round(perfect_eur, 2),
                "feasibility_violations": len(forecast_schedule.feasibility_violations),
                "cycles": round(forecast_schedule.cycle_count, 3),
            }
        )
        risk_adjusted_daily.append(
            {
                "date": date,
                "realized_eur": round(risk_realized_eur, 2),
                "perfect_eur": round(perfect_eur, 2),
                "feasibility_violations": len(risk_adjusted_schedule.feasibility_violations),
                "cycles": round(risk_adjusted_schedule.cycle_count, 3),
            }
        )

    payload = _assemble(asset_slug, twin, daily, risk_adjusted_daily, forecast_artifacts.metrics)
    write_json_artifact("backtest_summary.json", payload)
    return payload


def _realized_value(prices: list[float], charge: list[float], discharge: list[float], dt: float) -> float:
    return sum(price * (dis - chg) * dt for price, chg, dis in zip(prices, charge, discharge, strict=False))


def _uncertainty_sigma(p10: list[float], p90: list[float]) -> list[float]:
    # HiGHS applies a 2x penalty to this value, so use a mild width haircut rather
    # than a literal statistical sigma that would over-suppress dispatch.
    return [max(0.0, (hi - lo) / 10.0) for lo, hi in zip(p10, p90, strict=False)]


def _assemble(
    asset_slug: str,
    twin: SystemTwinSpec,
    daily: list[dict],
    risk_adjusted_daily: list[dict],
    model_metrics: dict,
) -> dict:
    by_year: dict[str, list[dict]] = defaultdict(list)
    for row in daily:
        by_year[row["date"][:4]].append(row)
    annualized = {}
    perfect_annualized = {}
    for year, rows in by_year.items():
        factor = 365 / max(1, len(rows))
        annualized[year] = round(sum(row["realized_eur"] for row in rows) * factor / twin.power_mw, 2)
        perfect_annualized[year] = round(sum(row["perfect_eur"] for row in rows) * factor / twin.power_mw, 2)
    realized = np.array([row["realized_eur"] for row in daily], dtype=float)
    perfect = np.array([row["perfect_eur"] for row in daily], dtype=float)
    equity = realized.cumsum()
    drawdown = equity - np.maximum.accumulate(equity) if len(equity) else np.array([0.0])
    risk_summary = _risk_adjusted_summary(risk_adjusted_daily, perfect, twin)
    return {
        "asset_slug": asset_slug,
        "asset": twin.model_dump(),
        "forecast_model": model_metrics["model_id"],
        "start_date": daily[0]["date"] if daily else None,
        "end_date": daily[-1]["date"] if daily else None,
        "results": {
            "daily": daily,
            "annualized_eur_per_mw_per_year": annualized,
            "perfect_foresight_eur_per_mw_per_year": perfect_annualized,
            "capture_rate": round(float(realized.sum() / perfect.sum()), 3) if perfect.sum() else 0,
            "sharpe": round(float(np.mean(realized) / np.std(realized) * np.sqrt(365)), 3) if np.std(realized) else 0,
            "max_drawdown_eur": round(float(drawdown.min()), 2),
            "feasibility_violations": int(sum(row["feasibility_violations"] for row in daily)),
            "risk_adjusted": risk_summary,
        },
        "model_metrics": model_metrics["overall"],
    }


def _risk_adjusted_summary(daily: list[dict], perfect: np.ndarray, twin: SystemTwinSpec) -> dict:
    realized = np.array([row["realized_eur"] for row in daily], dtype=float)
    equity = realized.cumsum()
    drawdown = equity - np.maximum.accumulate(equity) if len(equity) else np.array([0.0])
    by_year: dict[str, list[dict]] = defaultdict(list)
    for row in daily:
        by_year[row["date"][:4]].append(row)
    annualized = {}
    for year, rows in by_year.items():
        factor = 365 / max(1, len(rows))
        annualized[year] = round(sum(row["realized_eur"] for row in rows) * factor / twin.power_mw, 2)
    return {
        "mode": "conservative_quantile_penalty",
        "annualized_eur_per_mw_per_year": annualized,
        "capture_rate": round(float(realized.sum() / perfect.sum()), 3) if perfect.sum() else 0,
        "sharpe": round(float(np.mean(realized) / np.std(realized) * np.sqrt(365)), 3) if np.std(realized) else 0,
        "max_drawdown_eur": round(float(drawdown.min()), 2),
        "feasibility_violations": int(sum(row["feasibility_violations"] for row in daily)),
        "mean_cycles_per_day": round(float(np.mean([row["cycles"] for row in daily])), 3) if daily else 0,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", default="metlen_karatzis_thessaly")
    args = parser.parse_args()
    result = run_backtest(args.asset)
    print(result["results"]["capture_rate"])
