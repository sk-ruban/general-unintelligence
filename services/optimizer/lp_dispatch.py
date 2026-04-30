from __future__ import annotations

import json
import math
import sys
import time
from typing import Literal

import highspy
from fastapi import FastAPI
from highspy import Highs, HighsModelStatus, HighsVarType
from pydantic import BaseModel, Field


RiskMode = Literal["conservative", "balanced", "aggressive"]
SolveStatus = Literal["optimal", "infeasible", "timeout"]


class AuxLoadKw(BaseModel):
    active: float = 0
    standby: float = 0


class ThermalDeratePoint(BaseModel):
    temp_c: float
    derate_pu: float


class SystemTwinSpec(BaseModel):
    name: str = "generic"
    power_mw: float
    contracted_energy_mwh: float
    nameplate_energy_mwh: float | None = None
    duration_hours: float | None = None
    rte_pct: float = 88
    soc_min_pct: float = 10
    soc_max_pct: float = 90
    reserve_soc_pct: float = 0
    max_cycles_per_day: float = 1.5
    warranty_throughput_mwh: float | None = None
    aux_load_kw: AuxLoadKw = Field(default_factory=AuxLoadKw)
    thermal_derating: list[ThermalDeratePoint] = Field(default_factory=list)
    confidence: dict[str, str] = Field(default_factory=dict)


class DegGrid(BaseModel):
    dod: list[float]
    c_rate: list[float]
    temp_c: list[float]


class DegSurface(BaseModel):
    archetype: str
    parameter_set: str
    grid: DegGrid
    c_deg_eur_per_mwh: list[list[list[float]]]
    generated_at: str


class LpInput(BaseModel):
    prices_eur_per_mwh: list[float]
    resolution_minutes: Literal[15, 60]
    twin: SystemTwinSpec
    cell_degradation_surface: DegSurface | None = None
    forecast_uncertainty_sigma: list[float] | None = None
    initial_soc_mwh: float
    terminal_soc_mwh: float | None = None
    risk_mode: RiskMode = "balanced"
    degradation_cost_eur_per_mwh: float = 4.0
    solve_time_limit_s: float = 10.0


class LpOutput(BaseModel):
    charge_mw: list[float]
    discharge_mw: list[float]
    soc_mwh: list[float]
    cycle_count: float
    expected_revenue_eur: float
    degradation_cost_eur: float
    feasibility_violations: list[str]
    solve_status: SolveStatus
    solve_time_ms: float


app = FastAPI(title="Battery Intelligence OS Optimizer")


@app.post("/optimize")
def optimize_endpoint(inp: LpInput) -> LpOutput:
    return solve_dispatch(inp)


def solve_dispatch(inp: LpInput) -> LpOutput:
    started = time.perf_counter()
    n = len(inp.prices_eur_per_mwh)
    if n == 0:
        return _empty_output("optimal", started)

    twin = inp.twin
    dt = inp.resolution_minutes / 60.0
    energy_max = _usable_energy_mwh(twin)
    power_max = max(0.0, twin.power_mw)
    soc_min = energy_max * max(0.0, min(1.0, twin.soc_min_pct / 100.0))
    soc_max = energy_max * max(0.0, min(1.0, twin.soc_max_pct / 100.0))
    initial_soc = _clamp(inp.initial_soc_mwh, soc_min, soc_max)
    terminal_soc = None if inp.terminal_soc_mwh is None else _clamp(inp.terminal_soc_mwh, soc_min, soc_max)

    if energy_max <= 0 or power_max <= 0 or soc_max <= soc_min:
        soc = [round(initial_soc, 6)] * (n + 1)
        return LpOutput(
            charge_mw=[0.0] * n,
            discharge_mw=[0.0] * n,
            soc_mwh=soc,
            cycle_count=0.0,
            expected_revenue_eur=0.0,
            degradation_cost_eur=0.0,
            feasibility_violations=[],
            solve_status="optimal",
            solve_time_ms=_elapsed_ms(started),
        )

    eta = math.sqrt(max(0.01, min(1.0, twin.rte_pct / 100.0)))
    c_deg = _degradation_cost(inp)
    risk_penalty = _risk_penalties(inp)

    highs = Highs()
    highs.setOptionValue("output_flag", False)
    highs.setOptionValue("time_limit", float(inp.solve_time_limit_s))

    p_chg = [highs.addVariable(lb=0, ub=power_max, name=f"chg_{t}") for t in range(n)]
    p_dis = [highs.addVariable(lb=0, ub=power_max, name=f"dis_{t}") for t in range(n)]
    soc = [highs.addVariable(lb=soc_min, ub=soc_max, name=f"soc_{t}") for t in range(n + 1)]
    is_chg = [
        highs.addVariable(lb=0, ub=1, type=HighsVarType.kInteger, name=f"is_chg_{t}") for t in range(n)
    ]
    is_dis = [
        highs.addVariable(lb=0, ub=1, type=HighsVarType.kInteger, name=f"is_dis_{t}") for t in range(n)
    ]

    highs.addConstr(soc[0] == initial_soc)
    if terminal_soc is not None:
        highs.addConstr(soc[n] == terminal_soc)

    for t in range(n):
        highs.addConstr(soc[t + 1] == soc[t] + eta * dt * p_chg[t] - (dt / eta) * p_dis[t])
        highs.addConstr(p_chg[t] <= power_max * is_chg[t])
        highs.addConstr(p_dis[t] <= power_max * is_dis[t])
        highs.addConstr(is_chg[t] + is_dis[t] <= 1)

    total_discharge = sum((p_dis[t] * dt for t in range(n)), highs.expr(0))
    highs.addConstr(total_discharge <= max(0.0, twin.max_cycles_per_day) * energy_max)

    objective = highs.expr(0)
    for t, price in enumerate(inp.prices_eur_per_mwh):
        interval_penalty = c_deg + risk_penalty[t]
        objective += price * (p_dis[t] - p_chg[t]) * dt
        objective += -interval_penalty * (p_chg[t] + p_dis[t]) * dt

    highs.maximize(objective)
    highs.run()

    model_status = highs.getModelStatus()
    if model_status != HighsModelStatus.kOptimal:
        status: SolveStatus = "timeout" if model_status == HighsModelStatus.kTimeLimit else "infeasible"
        return _empty_output(status, started, n=n, initial_soc=initial_soc)

    charge = [_round(highs.variableValue(var)) for var in p_chg]
    discharge = [_round(highs.variableValue(var)) for var in p_dis]
    soc_values = [_round(highs.variableValue(var)) for var in soc]
    revenue = sum(inp.prices_eur_per_mwh[t] * (discharge[t] - charge[t]) * dt for t in range(n))
    degradation_cost = sum(c_deg * (charge[t] + discharge[t]) * dt for t in range(n))
    total_discharge_mwh = sum(discharge[t] * dt for t in range(n))

    return LpOutput(
        charge_mw=charge,
        discharge_mw=discharge,
        soc_mwh=soc_values,
        cycle_count=_round(total_discharge_mwh / energy_max),
        expected_revenue_eur=_round(revenue - degradation_cost),
        degradation_cost_eur=_round(degradation_cost),
        feasibility_violations=_validate_solution(charge, discharge, soc_values, inp, soc_min, soc_max),
        solve_status="optimal",
        solve_time_ms=_elapsed_ms(started),
    )


def _usable_energy_mwh(twin: SystemTwinSpec) -> float:
    if twin.nameplate_energy_mwh is None:
        return max(0.0, twin.contracted_energy_mwh)
    return max(0.0, min(twin.contracted_energy_mwh, twin.nameplate_energy_mwh))


def _degradation_cost(inp: LpInput) -> float:
    base = inp.degradation_cost_eur_per_mwh
    if inp.cell_degradation_surface is not None:
        values: list[float] = []
        for by_dod in inp.cell_degradation_surface.c_deg_eur_per_mwh:
            for by_c in by_dod:
                values.extend(float(value) for value in by_c)
        if values:
            base = sorted(values)[len(values) // 2]
    if inp.risk_mode == "conservative":
        return base * 1.25
    if inp.risk_mode == "aggressive":
        return base * 0.85
    return base


def _risk_penalties(inp: LpInput) -> list[float]:
    n = len(inp.prices_eur_per_mwh)
    if inp.risk_mode != "conservative" or not inp.forecast_uncertainty_sigma:
        return [0.0] * n
    sigma = inp.forecast_uncertainty_sigma[:n]
    if len(sigma) < n:
        sigma.extend([sigma[-1] if sigma else 0.0] * (n - len(sigma)))
    return [max(0.0, 2.0 * float(value)) for value in sigma]


def _validate_solution(
    charge: list[float],
    discharge: list[float],
    soc: list[float],
    inp: LpInput,
    soc_min: float,
    soc_max: float,
) -> list[str]:
    violations: list[str] = []
    tolerance = 1e-4
    for t, (chg, dis) in enumerate(zip(charge, discharge, strict=False)):
        if chg > tolerance and dis > tolerance:
            violations.append(f"simultaneous_charge_discharge:{t}")
        if chg - inp.twin.power_mw > tolerance:
            violations.append(f"charge_power_limit:{t}")
        if dis - inp.twin.power_mw > tolerance:
            violations.append(f"discharge_power_limit:{t}")
    for t, value in enumerate(soc):
        if value < soc_min - tolerance or value > soc_max + tolerance:
            violations.append(f"soc_bound:{t}")
    return violations


def _empty_output(
    status: SolveStatus,
    started: float,
    n: int = 0,
    initial_soc: float = 0.0,
) -> LpOutput:
    return LpOutput(
        charge_mw=[0.0] * n,
        discharge_mw=[0.0] * n,
        soc_mwh=[initial_soc] * (n + 1 if n else 0),
        cycle_count=0.0,
        expected_revenue_eur=0.0,
        degradation_cost_eur=0.0,
        feasibility_violations=[],
        solve_status=status,
        solve_time_ms=_elapsed_ms(started),
    )


def _round(value: float) -> float:
    return round(float(value), 6)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _elapsed_ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 3)


if __name__ == "__main__":
    payload = json.load(sys.stdin)
    result = solve_dispatch(LpInput.model_validate(payload))
    print(result.model_dump_json(indent=2))
