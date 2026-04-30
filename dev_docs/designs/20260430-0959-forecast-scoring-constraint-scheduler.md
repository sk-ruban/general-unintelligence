# Forecast Scoring and Constraint Scheduler

**Status:** Final draft for implementation planning  
**Parent vision:** `dev_docs/designs/20260429-1123-battery_intelligence_os_product_vision.md`  
**Related docs:** `dev_docs/designs/20260430-0943-control-room-demo-solidification.md`, `dev_docs/designs/20260430-0944-decision-confidence-robustness-strip.md`, `dev_docs/designs/20260430-0945-focused-scenario-comparison-panel.md`, `dev_docs/designs/20260430-0946-battery-digital-twin-implementation.md`  
**Implementation target:** `lib/battery-dispatch.ts`, `lib/types.ts`, new `lib/forecast-scoring.ts`, new `lib/constraint-scheduler.ts`, optional new tests under `tests/`

---

## 1. Purpose

This document defines the missing decision engine between the existing market/signal data and the dashboard's charge/discharge/idle schedule.

The product should not choose between "ML model" and "optimizer" as competing approaches. The correct design is a hybrid:

```text
market, curve, weather, fuel, and asset inputs
-> forecast/scoring layer
-> risk-adjusted interval values
-> constraint-aware scheduler
-> feasible 96-MTU battery plan
```

The forecasting/scoring layer estimates opportunity and uncertainty. The scheduler converts those estimates into a physically feasible plan.

This is the minimum credible architecture for the hackathon brief because the deliverable asks for both:

- use of relevant data sources and forecasting inputs;
- feasible battery schedules that respect technical and operational constraints under data scarcity.

---

## 2. Scope Boundaries

This doc deliberately avoids repeating features already specified elsewhere.

| Area | Existing owner | This doc's involvement |
|---|---|---|
| Control Room layout | `20260430-0943-control-room-demo-solidification.md` | Supplies schedule, reason codes, and feasibility facts |
| Decision confidence strip | `20260430-0944-decision-confidence-robustness-strip.md` | Supplies metric inputs and objective breakdowns |
| Scenario comparison | `20260430-0945-focused-scenario-comparison-panel.md` | Provides a scheduler that can be rerun under perturbed inputs |
| Battery Twin Builder | `20260430-0946-battery-digital-twin-implementation.md` | Consumes derived optimizer constraints from the twin |
| DAM/Convex/weather/fuel data backends | Existing source-specific design docs | Consumes normalized frontend/backend data; does not redesign ingestion |

The purpose here is the decision core only.

---

## 3. Current State

The current implementation has a useful baseline:

- `buildDispatchSchedule(prices, twin)` emits a 96-interval charge/discharge/idle schedule.
- It respects basic SoC bounds, max charge/discharge power, round-trip efficiency, and degradation cost.
- The Control Room already visualizes action timeline, SoC path, expected value, degradation cost, and dispatch rows.

The gap is that the scheduler is a local quantile heuristic:

```text
price <= low quantile  -> charge
price >= high quantile -> discharge
otherwise              -> idle
```

That is good enough as a baseline comparator. It is not enough to claim a robust battery optimization framework because it does not:

- use weather, gas, EEX, or curve inputs in the decision calculation;
- optimize across the full day as one coupled sequence;
- handle terminal SoC, reserve headroom, throughput, or cycle policy;
- expose a clear objective breakdown;
- distinguish scarce-spec assumptions from known asset facts;
- prove why a profitable-looking interval was skipped for future feasibility.

---

## 4. Design Principle

Do not ask a regression model or XGBoost model to directly operate the battery.

Use models to estimate interval opportunity:

- expected price;
- price regime;
- charge attractiveness;
- discharge attractiveness;
- spread confidence;
- curve fragility;
- solar surplus fit;
- thermal scarcity pressure;
- downside risk.

Then use a deterministic scheduler to choose the feasible action sequence.

This matters because a battery schedule is sequential. A local action changes future SoC. A model can say "MTU 72 looks valuable for discharge," but only a scheduler can decide whether to save energy for MTU 72 instead of discharging earlier.

---

## 5. Architecture

## 5.1 Data flow

```text
DAM prices
DAM aggregated curves
Open-Meteo weather scores
TTF gas proxy
EEX Greek forward context
Battery twin constraints
Operator policy
        |
        v
Forecast/scoring layer
        |
        v
96 interval opportunity table
        |
        v
Constraint scheduler
        |
        v
Dispatch schedule + objective breakdown + feasibility report + reason codes
```

## 5.2 New modules

```text
lib/forecast-scoring.ts
lib/constraint-scheduler.ts
```

Keep `lib/battery-dispatch.ts` as a compatibility wrapper during migration:

```ts
export function buildDispatchSchedule(prices, config) {
  return buildBaselineQuantileSchedule(prices, config);
}
```

Then add the new path:

```ts
export function buildOptimizedDispatch(input: OptimizationInput): OptimizationResult;
```

---

## 6. Forecast and Scoring Layer

## 6.1 Purpose

The scoring layer turns raw inputs into interval-level decision features. It does not enforce battery constraints. It produces the opportunity table the scheduler consumes.

## 6.2 MVP approach

Start with a deterministic transparent score. Do not block the demo on model training infrastructure.

For each MTU:

```ts
type ForecastInterval = {
  interval: MarketInterval;
  observedPriceEurPerMwh: number;
  expectedPriceEurPerMwh: number;
  chargeScore: number;
  dischargeScore: number;
  idleScore: number;
  priceConfidence: number;
  curveFragility: number | null;
  solarSurplusScore: number | null;
  thermalScarcityScore: number | null;
  riskPenaltyEurPerMwh: number;
  featureContributions: Array<{
    feature: string;
    direction: "charge" | "discharge" | "idle" | "risk";
    weight: number;
    value: number;
    contribution: number;
  }>;
};
```

## 6.3 Feature definitions

### Price position

Use DAM price percentile within the selected day or forecast horizon.

- Low percentile supports charge.
- High percentile supports discharge.
- Middle percentile supports idle.

### Spread opportunity

Estimate whether the current interval is likely to pair with later profitable discharge or earlier cheap charge.

MVP approximation:

```text
future_high_price - current_price
current_price - prior_low_price
```

This is not the final scheduler result. It is a model feature.

### Curve fragility

Use available aggregated curve depth and price range as a confidence/risk feature.

High fragility does not automatically prevent dispatch. It increases the risk penalty or lowers confidence.

### Solar surplus score

Use Open-Meteo solar availability and midday/low-price alignment as a charge-support feature.

This should remain a proxy. Do not claim measured curtailment unless ENTSO-E/IPTO curtailment or RES data is added.

### Thermal scarcity score

Use TTF fuel-cost proxy and evening/high-price alignment as a discharge-support feature.

EEX Greek power context should be treated as forward/regime context, not as direct next-MTU price truth.

## 6.4 ML upgrade path

After the deterministic scorer works, add a small model layer behind the same interface.

Candidate targets:

- `expectedPriceEurPerMwh`;
- `pricePercentile`;
- `highPriceRegime`;
- `chargeScore`;
- `dischargeScore`;
- `riskPenaltyEurPerMwh`.

Model families:

- linear/ridge regression as transparent baseline;
- gradient boosting or XGBoost-style model if dependency and training data are available;
- no neural model for the hackathon path.

Evaluation should use decision quality, not only forecast error:

- realized dispatch value;
- missed profitable intervals;
- infeasible schedule count;
- degradation-adjusted value;
- robustness under scenario perturbation.

---

## 7. Constraint Scheduler

## 7.1 Purpose

The scheduler chooses the best feasible action sequence across 96 MTUs.

It must respect battery constraints even when the forecast/scoring layer is noisy or incomplete.

## 7.2 MVP algorithm

Use dynamic programming over discretized SoC.

Why DP:

- deterministic and auditable;
- easy to implement without solver dependencies;
- naturally handles sequential SoC coupling;
- easy to explain in the pitch;
- sufficient for one-day 96-MTU schedules.

LP/MILP can be a future replacement if we need continuous power decisions, binary mode constraints, or more complex market products.

## 7.3 State

```ts
type SchedulerState = {
  mtuIndex: number;
  socMwh: number;
  throughputMwh: number;
};
```

For the MVP, discretize SoC to a configurable step:

```text
socStepMwh = 0.5 or 1.0
```

Throughput can be tracked exactly in the path summary first. If daily throughput limits are strict, include a coarser throughput bucket in the DP state.

## 7.4 Actions

At each interval evaluate:

```ts
type SchedulerAction = "charge" | "idle" | "discharge";
```

Each action maps to a power/MWh amount. MVP can use max feasible charge/discharge power for simplicity:

- charge at max feasible power when charge is chosen;
- discharge at max feasible power when discharge is chosen;
- idle at zero.

Future upgrade: evaluate partial power levels:

```text
0%, 25%, 50%, 75%, 100%
```

## 7.5 Hard constraints

The scheduler must enforce:

- SoC minimum and maximum;
- initial SoC;
- max charge MW;
- max discharge MW;
- no simultaneous charge/discharge;
- interval duration;
- charge efficiency;
- discharge efficiency;
- availability by interval;
- reserve headroom/footroom if configured.

## 7.6 Soft constraints and penalties

The objective should include:

- degradation cost;
- risk penalty;
- market fragility penalty;
- terminal SoC penalty;
- throughput/cycle policy penalty;
- optional reserve policy penalty.

MVP objective:

```text
maximize
  discharge_revenue
  - charge_energy_cost
  - degradation_cost
  - risk_penalty
  - curve_fragility_penalty
  - terminal_soc_penalty
```

## 7.7 Output

```ts
type OptimizationResult = {
  schedule: DispatchPoint[];
  objective: {
    grossRevenueEur: number;
    chargeCostEur: number;
    degradationCostEur: number;
    riskPenaltyEur: number;
    fragilityPenaltyEur: number;
    terminalSocPenaltyEur: number;
    netValueEur: number;
  };
  feasibility: DispatchFeasibilityReport;
  inputs: {
    scorer: "deterministic-v1" | "linear" | "xgboost";
    scheduler: "dp-v1" | "baseline-quantile";
    socStepMwh: number;
  };
  reasonCodes: IntervalReasonCode[];
};
```

---

## 8. Types

## 8.1 Optimization input

```ts
type OptimizationInput = {
  intervals: ForecastInterval[];
  battery: OptimizerBatteryConstraints;
  objectiveWeights: ObjectiveWeights;
  policy: SchedulerPolicy;
};
```

## 8.2 Battery constraints

The Battery Twin implementation owns the richer twin UI and template library. The optimizer only needs the derived constraints.

```ts
type OptimizerBatteryConstraints = {
  capacityMwh: number;
  minSocMwh: number;
  maxSocMwh: number;
  initialSocMwh: number;
  targetEndSocMwh?: number;
  reserveHeadroomMwh?: number;
  reserveFootroomMwh?: number;
  maxChargeMw: number;
  maxDischargeMw: number;
  chargeEfficiency: number;
  dischargeEfficiency: number;
  degradationCostEurPerMwh: number;
  maxDailyThroughputMwh?: number;
  maxCyclesPerDay?: number;
  availabilityByMtu?: Record<number, boolean>;
};
```

## 8.3 Objective weights

```ts
type ObjectiveWeights = {
  revenue: number;
  degradation: number;
  risk: number;
  marketFragility: number;
  terminalSoc: number;
  throughput: number;
};
```

## 8.4 Policy

```ts
type SchedulerPolicy = {
  mode: "conservative" | "balanced" | "aggressive";
  socStepMwh: number;
  intervalHours: number;
  allowPartialPower: boolean;
};
```

---

## 9. Explanation Model

Every dispatch row should have structured explanation fields, not only prose.

```ts
type IntervalReasonCode = {
  mtu: number;
  action: DispatchAction;
  primaryReason:
    | "low_price_charge"
    | "high_price_discharge"
    | "future_value_preserved"
    | "spread_too_weak"
    | "soc_floor_binding"
    | "soc_ceiling_binding"
    | "reserve_binding"
    | "availability_blocked"
    | "risk_penalty_too_high"
    | "terminal_soc_preserved";
  supportingSignals: string[];
  bindingConstraints: string[];
  economicBreakdown: {
    energyValueEur: number;
    degradationCostEur: number;
    riskPenaltyEur: number;
    netContributionEur: number;
  };
};
```

The UI can then render truthful copy:

```text
Idle because the spread is positive but the optimizer preserves SoC for a higher-confidence evening discharge window.
```

This is more credible than saying every idle interval simply fails a price threshold.

---

## 10. Data Scarcity Handling

The scheduler must still run when asset data is incomplete.

The Battery Twin layer should provide defaults and confidence labels. The scheduler should consume only the derived constraints and expose which values were assumed.

For scarce-spec mode:

- use conservative SoC bounds;
- use conservative RTE;
- apply a nonzero degradation cost;
- include reserve headroom;
- prefer balanced or conservative policy;
- show lower data confidence;
- avoid over-precise reason text.

The key claim:

> We can produce feasible schedules without rich telemetry because the optimizer uses a transparent constraint envelope derived from public specs, archetypes, and operator overrides.

---

## 11. Implementation Plan

## Step 1: Rename the current scheduler as baseline

Create:

```text
buildBaselineQuantileSchedule
```

Keep existing behavior intact. The baseline remains useful for comparison and regression tests.

## Step 2: Add forecast scoring

Create `lib/forecast-scoring.ts`.

Inputs:

- DAM prices;
- curve stats if available;
- external signal panels or normalized signal values;
- current battery/twin policy where needed for cost thresholds.

Output:

- `ForecastInterval[]`.

## Step 3: Add derived optimizer constraints

Map existing `BatteryTwinConfig` to `OptimizerBatteryConstraints`.

At first, derive:

- symmetric charge/discharge efficiency from round-trip efficiency;
- min/max/initial SoC from existing fields;
- degradation cost from existing field;
- no availability limits;
- no target terminal SoC unless configured.

## Step 4: Implement DP scheduler

Create `lib/constraint-scheduler.ts`.

Implement:

- SoC grid creation;
- feasible transition generation;
- objective scoring;
- backtracking;
- schedule output.

## Step 5: Add feasibility validation

Add a reusable validator:

```ts
validateDispatchFeasibility(schedule, constraints)
```

This should power Control Room claims and tests.

## Step 6: Add reason codes

Generate reason codes during backtracking or as a post-processing pass.

Reason codes must be based on actual constraints and objective terms.

## Step 7: Wire the Control Room behind a feature switch

Temporarily support:

```text
baseline quantile
optimized DP
```

Default to optimized once tests pass.

## Step 8: Update tests

Add focused tests before UI work expands.

---

## 12. Test Plan

Add tests for:

1. Empty price/signal input returns missing feasibility, not a fake pass.
2. Schedule never violates SoC bounds.
3. Schedule never exceeds charge/discharge MW.
4. High degradation cost increases idle behavior.
5. Terminal SoC target changes late-day dispatch.
6. Reserve headroom prevents full discharge.
7. Missing weather/gas/curve inputs still produce a feasible schedule from DAM and twin constraints.
8. Scarce-spec conservative policy produces lower-risk schedules than aggressive policy.
9. Negative or low midday prices trigger charging only if SoC capacity exists.
10. A locally profitable interval can be skipped when future interval value is higher.
11. Feasibility validator catches intentionally malformed schedules.
12. Baseline and optimized schedulers produce comparable output shapes for the UI.

---

## 13. Acceptance Criteria

The feature is complete when:

- the code exposes a baseline scheduler and an optimized scheduler;
- the optimized scheduler consumes scored intervals, not only raw prices;
- scheduler output includes objective breakdown and feasibility report;
- every visible "feasible" claim is tied to validation;
- missing non-price signals degrade confidence but do not break scheduling;
- scarce-spec defaults can produce a conservative feasible schedule;
- tests cover physical constraints and at least one future-value preservation case;
- the Control Room can show why charge, discharge, and idle actions were selected from structured facts.

---

## 14. Pitch Framing

Use this language:

> ML estimates the opportunity. The optimizer enforces reality.

Longer version:

> The model layer combines DAM prices, curve depth, weather, fuel, and forward-market context into risk-adjusted interval scores. The scheduler then chooses the best feasible 96-MTU battery path under SoC, power, efficiency, degradation, reserve, and scarce-spec constraints.

Avoid claiming:

- production-grade market bidding;
- perfect price forecasting;
- real telemetry calibration before SCADA/BMS data exists;
- exact curtailment measurement without a curtailment source;
- full MILP if the implementation is DP.

The deliverable should be judged as a realistic optimization framework under limited asset information, not as a generic price forecast notebook.

