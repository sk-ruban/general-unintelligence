# Control Room Demo Solidification

**Status:** Proposed  
**Parent vision:** `dev_docs/designs/20260429-1123-battery_intelligence_os_product_vision.md`  
**Implementation target:** `components/cockpit-client.tsx`, `lib/battery-dispatch.ts`, `lib/convex-signals.ts`

---

## 1. Purpose

The current dashboard already has the right demo spine:

```text
HEnEx DAM prices + curve context + external signals + battery twin -> feasible charge/discharge/idle schedule
```

The immediate goal is not to add more modules. The immediate goal is to make the current Control Room feel complete, truthful, and defensible in a 5-minute hackathon demo.

The Control Room should answer, without needing another page:

1. What should the battery do tomorrow?
2. Why is that schedule economically meaningful?
3. Why is it physically feasible?
4. Which inputs are real, cached, demo-backed, or missing?
5. What are the main caveats?

---

## 2. Product stance

This should be presented as a **constraint-aware battery decision cockpit**, not a full forecasting platform.

The strongest pitch line is:

> We are not selling a price forecast. We are showing how a battery operator can turn limited external data into a feasible, explainable schedule before they have years of battery telemetry.

That means the Control Room should prioritize:

- decision clarity;
- feasibility proof;
- source transparency;
- operator confidence;
- limited but credible robustness signals.

It should not imply we have already built a full model lab, trading desk, or production optimizer.

---

## 3. Current strengths to preserve

### 3.1 Dashboard shell

Keep the existing dark operational cockpit aesthetic, dense panels, sidebar navigation, right rail, command palette, and resizable layout. It already feels more like an operations product than a notebook.

### 3.2 Control Room components

Keep:

- recommended plan hero;
- 96-interval action timeline;
- DAM MCP price chart;
- market curve depth panel;
- SoC trajectory;
- expected daily value;
- degradation cost;
- equivalent cycles;
- dispatch row details;
- explanation cards.

### 3.3 Backend/data grounding

Keep:

- HEnEx DAM price archive as the operational price source;
- market curves as the market-structure proof point;
- Open-Meteo, TTF, and EEX as contextual signals;
- deterministic local/static fallback behavior;
- battery twin configuration and deterministic dispatch.

---

## 4. Problems to fix

### 4.1 The demo currently has dead-end promises

Some UI labels imply behavior that is not actually implemented:

- `Sync Model`;
- `Live Mode`;
- `forecast risk`;
- `scarcity ensemble`;
- confidence labels that are not tied to a calculation.

For the first demo pass, every visible claim should either be backed by current data or renamed to a truthful demo concept.

### 4.2 The Control Room does not visibly close the loop

The user can see the recommendation, but the causal chain is scattered:

```text
price -> schedule -> SoC -> value
```

The UI should make that chain obvious in one viewport.

### 4.3 Feasibility proof is too implicit

The SoC curve exists, but the operator should not have to infer that constraints are respected. The UI needs a clear feasibility block:

- SoC bounds respected;
- no simultaneous charge and discharge;
- power limits respected;
- cycle policy respected;
- degradation cost included;
- reserve buffer preserved.

### 4.4 Source status is too far from the recommendation

Data Health exists as a page, but the first Control Room view should include a compact input provenance strip so judges can immediately understand what the schedule used.

---

## 5. Proposed Control Room changes

## 5.1 Replace the hero with a decision header

Current hero:

```text
Recommended Plan: Charge during low-price surplus windows...
```

Proposed structure:

```text
Tomorrow's Battery Plan
Charge: MTU 12-28
Discharge: MTU 70-83
Idle: all remaining intervals
Decision basis: DAM spread clears efficiency loss and degradation cost while SoC remains inside operating band.
```

The copy should be generated from the actual dispatch schedule, not hardcoded.

### UI fields

- `Charge window`
- `Discharge window`
- `Idle intervals`
- `Expected value`
- `Degradation-adjusted value`
- `Equivalent cycles`
- `Feasibility status`

### Acceptance criteria

- The header still works when there is no charge window or no discharge window.
- The status does not claim success when the dispatch array is empty.
- The recommendation copy mentions the exact asset config currently selected.

---

## 5.2 Add a feasibility proof panel

Add a compact panel directly below or beside the SoC trajectory.

### Checks

```text
SoC min/max respected
Power limit respected
No simultaneous charge/discharge
Cycle policy respected
Reserve buffer preserved
Degradation cost applied
```

### Display

Use a six-row checklist with small status tags:

- `Pass`
- `Review`
- `Missing`

For the MVP, these can be computed from the existing dispatch schedule and battery twin config.

### Implementation notes

Add a helper:

```ts
validateDispatchFeasibility(dispatch, twin)
```

Return:

```ts
{
  status: "pass" | "review" | "missing";
  checks: Array<{
    id: string;
    label: string;
    status: "pass" | "review" | "missing";
    detail: string;
  }>;
}
```

### Acceptance criteria

- If SoC exceeds configured min/max, the UI shows `Review`.
- If the dispatch array is empty, the UI shows `Missing`.
- The checklist is visible without opening the detailed dispatch table.

---

## 5.3 Make input provenance visible in the Control Room

Add a row called `Input Stack` or `Decision Inputs`.

### Cards

1. `HEnEx DAM`
   - role: operational price signal;
   - status: Convex/static fallback;
   - detail: date range and row count.

2. `HEnEx Curves`
   - role: market depth / fragility context;
   - status: loaded or unavailable for selected MTU;
   - detail: curve points.

3. `Open-Meteo`
   - role: solar/wind/load weather context;
   - status: cached/live/missing;
   - detail: fetch timestamp or fallback.

4. `TTF / EEX`
   - role: fuel and forward context;
   - status: cached/live/missing;
   - detail: latest selected values.

### Acceptance criteria

- A judge can tell within 10 seconds which inputs are real, cached, fallback, or missing.
- The cards do not imply unsupported sources such as IPTO are connected.

---

## 5.4 Remove or rename dead controls

### `Sync Model`

Options:

1. Remove it for the demo.
2. Rename to `Refresh Signals` only if it actually refreshes the external signal panels.
3. Rename to `Recompute Schedule` if it only recomputes local state.

Recommendation: remove it until it performs a real action.

### `Live Mode`

Rename to `Demo Data Mode` or `Latest DAM View` unless live HEnEx sync is actually running.

### Model-related copy

Avoid claiming a model is trained. Use:

```text
Scheduler: deterministic quantile heuristic
```

instead of:

```text
Model synced / active ensemble / trained model
```

---

## 6. What not to build in this pass

Do not build:

- a separate full Signal Engine page;
- a full Model Lab;
- model training;
- many scenario templates;
- a long source browser;
- LLM-generated explanations;
- exportable reports.

These create breadth but weaken the demo if they are not clearly tied to the charge/discharge decision.

---

## 7. Demo flow after this pass

### Step 1: Recommendation

Show the decision header.

Script:

> The system recommends charging in low-price surplus intervals, discharging during the evening scarcity window, and staying idle where the spread does not survive efficiency and degradation costs.

### Step 2: Feasibility

Show the SoC trajectory and feasibility proof.

Script:

> Because we do not have rich battery operating history, the digital twin is the guardrail. The schedule is only useful if it respects SoC, power, reserve, cycles, and degradation constraints.

### Step 3: Evidence

Show price chart, curve depth, and input provenance.

Script:

> The decision uses HEnEx DAM prices as the operational signal, curves for market depth, and weather/fuel/forward context to explain why the opportunity exists.

### Step 4: Caveats

Show Data Health or the inline source status.

Script:

> The demo is deterministic and fallback-safe. Missing live sources degrade into explicit status instead of silently breaking the schedule.

---

## 8. Acceptance criteria

The Control Room pass is complete when:

- the first viewport clearly states the recommended charge/discharge/idle plan;
- all plan windows are generated from the actual dispatch schedule;
- the UI visibly proves feasibility against the battery twin;
- input source status is visible near the recommendation;
- no visible button or label implies unimplemented model behavior;
- `pnpm typecheck` passes;
- `pnpm test` passes.

---

## 9. Success definition

This pass succeeds if the judge can understand the full product loop without leaving the Control Room:

```text
Limited external data -> deterministic battery scheduler -> feasible SoC path -> explainable operating plan
```

The Control Room should feel like a complete MVP, not the landing page for several unfinished modules.
