# Focused Scenario Comparison Panel

**Status:** Proposed next feature  
**Depends on:** Control Room demo solidification, Decision Confidence and Robustness Strip  
**Implementation target:** `components/cockpit-client.tsx`, `lib/battery-dispatch.ts`, optional new `lib/scenario-comparison.ts`

---

## 1. Purpose

The product vision includes a Scenario Planner, but a full planner would be too large for the current demo. The next feature should be a focused scenario comparison panel that proves one thing:

> Even with limited battery telemetry, the battery twin can stress-test schedules under plausible market regimes and show whether the recommendation changes.

This should wrap up the demo without adding a bulky scenario workbench.

---

## 2. Product question

The panel should answer:

> What happens to the schedule if market conditions shift?

It should compare a small number of scenarios against the base dispatch:

1. `Base Case`
2. `Gas Shock`
3. `Solar Surplus`
4. Optional: `4h Battery`

The panel should not try to forecast the future. It should stress-test the schedule using deterministic perturbations.

---

## 3. Why this matters for the hackathon

The challenge is explicitly about robust battery optimization under data scarcity. Scenario comparison is the cleanest way to demonstrate robustness without claiming production-grade forecasting.

The story is:

```text
We may not have rich battery telemetry yet.
But we do have market data, context signals, and asset specs.
So we can simulate feasible schedules and test them under plausible regimes.
```

---

## 4. Scenario set

## 4.1 Base Case

Uses the current selected DAM price series and battery twin.

### Output

- existing dispatch schedule;
- expected value;
- degradation cost;
- equivalent cycles;
- charge/discharge windows;
- feasibility status.

---

## 4.2 Gas Shock

### Purpose

Represents higher thermal generation marginal cost and stronger evening scarcity.

### MVP perturbation

Increase prices during high-price/evening intervals.

Example:

```text
if hour >= 18 and hour <= 22:
  price += 35 EUR/MWh
else if price is already in top quartile:
  price += 20 EUR/MWh
```

### Expected behavior

- discharge windows may expand or become more valuable;
- schedule value should increase if enough SoC is available;
- battery stress may increase.

---

## 4.3 Solar Surplus

### Purpose

Represents renewable-heavy midday compression and curtailment absorption value.

### MVP perturbation

Decrease midday prices and optionally increase evening ramp.

Example:

```text
if hour >= 10 and hour <= 16:
  price -= 25 EUR/MWh
if hour >= 19 and hour <= 21:
  price += 10 EUR/MWh
```

### Expected behavior

- charge windows should concentrate around midday;
- spread coverage may improve;
- curtailment fit should improve.

---

## 4.4 4h Battery

### Purpose

Shows business-planning value without needing a full strategic planning module.

### MVP perturbation

Keep prices unchanged, but modify the battery twin:

```text
capacityMwh = maxDischargeMw * 4
maxSocMwh = capacityMwh * 0.95
minSocMwh = capacityMwh * 0.10
initialSocMwh = capacityMwh * 0.45
```

### Expected behavior

- more energy can be shifted;
- value may increase;
- cycles and stress should be compared to the base case.

### Optional

If four scenarios make the UI crowded, defer this and ship only Base / Gas Shock / Solar Surplus.

---

## 5. Panel design

The panel should be compact and comparison-first.

### Top row

Scenario cards:

```text
Base Case       EUR value   cycles   stress   status
Gas Shock       EUR value   delta    cycles   status
Solar Surplus   EUR value   delta    cycles   status
4h Battery      EUR value   delta    cycles   status
```

### Middle row

Mini action timelines for each scenario.

Use the same 96-interval color encoding:

- green: charge;
- amber: discharge;
- neutral: idle.

### Bottom row

Short executive summary:

```text
Gas shock increases evening discharge value by X%.
Solar surplus moves charging earlier and improves curtailment fit.
Base schedule remains feasible under all simulated scenarios.
```

This can be deterministic template text from scenario outputs.

---

## 6. Implementation model

Create:

```text
lib/scenario-comparison.ts
```

Suggested exports:

```ts
type ScenarioId = "base" | "gas-shock" | "solar-surplus" | "four-hour";

type ScenarioComparison = {
  id: ScenarioId;
  label: string;
  description: string;
  prices: DamPricePoint[];
  twin: BatteryTwinConfig;
  dispatch: DispatchPoint[];
  summary: {
    valueEur: number;
    degradationCostEur: number;
    throughputMwh: number;
    equivalentCycles: number;
    chargeWindow: string;
    dischargeWindow: string;
    valueDeltaEur: number;
    valueDeltaPercent: number | null;
  };
  feasibilityStatus: "pass" | "review" | "missing";
};
```

Functions:

```ts
buildScenarioComparisons(prices, twin): ScenarioComparison[]
perturbGasShock(prices): DamPricePoint[]
perturbSolarSurplus(prices): DamPricePoint[]
buildFourHourTwin(twin): BatteryTwinConfig
```

Reuse:

- `buildDispatchSchedule`;
- dispatch summarization;
- feasibility validation from the Control Room solidification pass.

---

## 7. Where it should live

Preferred placement:

- Add as a panel inside the existing `Scenarios` view, but make it feel complete.
- Add a compact summary card to the Control Room that links or switches to `Scenario Check`.

Alternative:

- Put the focused scenario panel at the bottom of the Control Room and remove the separate `Scenario Planner` nav label.

Recommendation:

Keep `Scenario Planner` as a nav item, but rename visible copy to:

```text
Scenario Check
```

This avoids implying a full scenario-planning platform.

---

## 8. Non-goals

Do not build:

- arbitrary custom scenario creation;
- sliders for every variable;
- saved scenarios;
- stochastic simulations;
- Monte Carlo;
- LLM-generated reports;
- real gas-to-power dispatch modelling;
- production PnL validation.

The feature should remain deterministic and explainable.

---

## 9. Demo script

> Because the asset has limited telemetry, we use the digital twin to stress-test the plan. Under a gas shock, evening scarcity becomes more valuable. Under a solar surplus day, charging shifts toward the midday renewable window. The point is not that we know the exact future. The point is that the schedule remains feasible and the operator can see how the recommendation changes.

---

## 10. Acceptance criteria

The feature is complete when:

- the scenario page compares at least Base, Gas Shock, and Solar Surplus;
- each scenario shows a mini action timeline;
- each scenario shows expected value, delta vs base, cycles, and feasibility status;
- scenario outputs are generated by rerunning the scheduler, not by multiplying the final value only;
- the scenario copy clearly says these are deterministic stress tests, not forecasts;
- `pnpm typecheck` passes;
- `pnpm test` passes.

---

## 11. Success definition

This feature succeeds if it lets the pitch close the robustness loop:

```text
Base operating plan -> deterministic stress test -> changed schedule/value/stress -> still feasible under the battery twin
```

That is enough to substantiate the challenge requirement without overbuilding a full scenario-planning product.
