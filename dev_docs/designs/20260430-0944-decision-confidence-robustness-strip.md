# Decision Confidence and Robustness Strip

**Status:** Proposed next feature  
**Depends on:** Control Room demo solidification  
**Implementation target:** `components/cockpit-client.tsx`, `lib/battery-dispatch.ts`, optional new `lib/decision-confidence.ts`

---

## 1. Purpose

The product vision calls for a Signal Engine with proprietary metrics such as Flexibility Value Index, Market Fragility Score, Curtailment Absorption Score, and Spread Robustness Score.

Building a full Signal Engine page now risks over-expanding the demo. The better next feature is a compact **Decision Confidence and Robustness Strip** inside the Control Room.

This gives us the differentiated intelligence story without creating another unfinished module.

---

## 2. Product question

The strip should answer:

> Is today's recommended battery schedule robust enough to trust, or is it a fragile price-spread artifact?

It should sit close to the recommendation and explain the quality of the plan, not merely show more market data.

---

## 3. Feature shape

Add a horizontal strip of five compact score cards:

1. `Spread Coverage`
2. `Market Fragility`
3. `Curtailment Fit`
4. `Battery Stress`
5. `Data Confidence`

Each card should show:

- score or label;
- status tone;
- one-line explanation;
- optional interval count or source detail.

Example:

```text
Spread Coverage
Strong
Discharge windows clear efficiency and degradation thresholds.
```

---

## 4. Metric definitions

These are MVP deterministic metrics. They do not need model training.

## 4.1 Spread Coverage

### Purpose

Measures whether selected discharge windows earn enough above charge windows to justify round-trip losses and degradation cost.

### Inputs

- selected day DAM prices;
- dispatch schedule;
- battery twin round-trip efficiency;
- degradation cost.

### MVP calculation

```text
avg_discharge_price - avg_charge_price - degradation_cost - efficiency_loss_proxy
```

Where:

```text
efficiency_loss_proxy = avg_discharge_price * (1 - round_trip_efficiency)
```

### Labels

- `Strong`: margin >= 20 EUR/MWh
- `Moderate`: margin >= 8 EUR/MWh
- `Weak`: margin > 0 EUR/MWh
- `Fail`: margin <= 0 EUR/MWh

---

## 4.2 Market Fragility

### Purpose

Uses HEnEx aggregated curve depth as a proxy for how sensitive the clearing price may be to small volume shifts.

### Inputs

- aggregated curve points for selected MTU;
- optional backend `curveFragility` summary if exposed;
- fallback: curve point count and price range.

### MVP calculation

If full curve fragility is not available in the frontend:

```text
curve_depth_score = min(1, curve_points / 150)
price_range_score = clamp((high_curve_price - low_curve_price) / 300)
fragility = 1 - (0.65 * curve_depth_score) + (0.35 * price_range_score)
```

### Labels

- `Low`: robust / broad depth
- `Medium`: acceptable sensitivity
- `High`: fragile clearing region
- `Missing`: no curve data for selected MTU

### Copy rule

Do not claim exact market impact. Phrase as:

> Curve depth suggests this interval is more/less sensitive to volume shifts.

---

## 4.3 Curtailment Fit

### Purpose

Shows whether charge windows align with renewable surplus conditions.

### Inputs

- charge intervals;
- Open-Meteo solar availability score if available;
- low DAM price intervals;
- midday interval concentration.

### MVP calculation

```text
midday_charge_share = charge_mwh_between_10_and_16 / total_charge_mwh
low_price_charge_share = charge_mwh_at_low_price / total_charge_mwh
weather_bonus = solarAvailabilityScore if available else 0.5
curtailment_fit = weighted_sum(midday_charge_share, low_price_charge_share, weather_bonus)
```

### Labels

- `High`: charging aligns with solar/low-price surplus;
- `Medium`: charging partly aligns;
- `Low`: charging is mostly unrelated to surplus windows;
- `Missing`: no charge schedule.

---

## 4.4 Battery Stress

### Purpose

Shows whether the proposed schedule is physically aggressive.

### Inputs

- throughput;
- equivalent cycles;
- SoC min/max proximity;
- charge/discharge power usage.

### MVP calculation

```text
stress = weighted_sum(
  equivalent_cycles / max_cycles_policy,
  soc_extreme_share,
  high_power_interval_share
)
```

### Labels

- `Low`: normal operating stress;
- `Medium`: acceptable but worth monitoring;
- `High`: aggressive cycling or SoC extremes;
- `Missing`: no dispatch.

### Important

This is not a production degradation model. Use the label:

```text
Battery Stress (MVP)
```

or include a tooltip:

```text
Heuristic score based on cycles, SoC extremes, and power usage.
```

---

## 4.5 Data Confidence

### Purpose

Shows whether the decision is supported by enough current/demo-backed inputs.

### Inputs

- DAM price data status;
- curve data status;
- Open-Meteo status;
- TTF/EEX status;
- dispatch availability.

### MVP calculation

Assign weights:

```text
HEnEx DAM prices: 40%
Battery twin config: 20%
Curves: 15%
Weather: 15%
Fuel/forward context: 10%
```

Missing non-critical context should reduce confidence but not invalidate the schedule.

### Labels

- `High`: DAM + twin + at least two context feeds available;
- `Medium`: DAM + twin available, partial context;
- `Low`: DAM fallback only;
- `Missing`: no schedule.

---

## 5. UI behavior

Place the strip immediately below the decision header and above the timeline.

Suggested layout:

```text
Decision Header
Decision Confidence Strip
96-Interval Timeline
Price / Curve / SoC Panels
Evidence Cards
```

Each card should be compact and operational:

- no large marketing copy;
- no long explanations;
- no nested cards;
- clear green/amber/red/outline status.

---

## 6. Implementation plan

### Step 1: Add derived helper

Create:

```text
lib/decision-confidence.ts
```

Exports:

```ts
buildDecisionConfidence({
  dispatch,
  prices,
  curves,
  curveStats,
  signals,
  twin,
  health,
}): DecisionConfidenceCard[]
```

### Step 2: Render strip

Add:

```ts
<DecisionConfidenceStrip cards={confidenceCards} />
```

inside `ControlRoom`.

### Step 3: Remove overclaiming signal labels

The existing right rail can keep a summary, but should not be the only place where FVI-like logic appears.

### Step 4: Add tests

Add unit tests for:

- empty schedule;
- strong spread schedule;
- missing curve data;
- high battery stress;
- partial data confidence.

---

## 7. Non-goals

Do not build:

- full Signal Engine page;
- model training;
- interval-level forecast generation;
- LLM explanations;
- more than five metrics;
- source-specific deep drilldowns.

---

## 8. Demo script

> The schedule is not just a price arbitrage output. We score whether it is robust: does the spread clear losses, is the clearing price fragile, does charging align with renewable surplus, is the battery being stressed, and are the inputs fresh enough to trust?

This gives the judges a clear answer to the core challenge:

> Can we produce feasible and economically meaningful schedules under data scarcity?

---

## 9. Acceptance criteria

The feature is complete when:

- the Control Room shows five robustness cards near the recommendation;
- each score is derived from current data or explicit fallback logic;
- missing data is shown honestly;
- no card claims model training or live telemetry;
- the scores update when the selected day or battery twin changes;
- tests cover the derived scoring helper;
- `pnpm typecheck` and `pnpm test` pass.
