# Battery Digital Twin Implementation

**Status:** Proposed feature design  
**Parent vision:** `dev_docs/designs/20260429-1123-battery_intelligence_os_product_vision.md`  
**Research basis:** `docs/battery_digital_twin_research_and_hackathon_application.md`  
**Implementation target:** `components/cockpit-client.tsx`, `lib/types.ts`, `lib/battery-dispatch.ts`, new `lib/battery-twin.ts`

---

## 1. Purpose

The battery digital twin should become the product's clearest answer to the hackathon's data-scarcity constraint.

The point is not to claim we know every real battery parameter. The point is to show that we can start from partial public/project information, choose a reasonable template, expose assumptions clearly, let operators override those assumptions, and feed the resulting technical envelope into the scheduler as constraints.

In product terms:

> The digital twin turns scarce battery information into an explicit, configurable constraint model for feasible charge/discharge scheduling.

In implementation terms:

```text
asset template + operator overrides + research-backed defaults
-> derived battery twin
-> optimizer constraints
-> schedule, SoC path, value, stress, and feasibility proof
```

---

## 2. Why this matters

The hackathon brief is not only about DAM prices. It asks for a realistic battery optimization framework that can produce feasible and economically meaningful schedules with limited asset-specific telemetry.

The twin is the bridge between those constraints:

- limited real battery operating history;
- public or customer-provided MW/MWh specs;
- uncertain supplier and degradation data;
- external market/weather/fuel signals;
- a 96-interval 15-minute dispatch day;
- technical limits that must be respected by the schedule.

The twin lets us say:

> Even when the asset is new and telemetry is scarce, the optimizer still respects a defensible battery operating envelope.

---

## 3. Core research insights to encode

## 3.1 Capacity is a stack, not one number

The research note's most useful finding is the PPC Amyntaio / Trina Storage example:

```text
PPC public project capacity: 50 MW / 200 MWh
Trina disclosed nameplate capacity: about 244 MWh
Contracted-to-nameplate ratio: 200 / 244 = 0.82
```

This means the twin should never treat headline MWh as a universal capacity number.

The UI and optimizer should separate:

```text
DC nameplate energy
-> warranted / contracted usable energy
-> operational usable energy after SoC buffers and state-of-health assumptions
-> AC market-dispatchable energy after conversion and auxiliary losses
```

This should be a visible dashboard feature called **Capacity Stack**.

---

## 3.2 Greek templates are reasonable but uncertain

Research supports these defaults:

- Greece first-wave auction assets are usually close to **2-hour LFP liquid-cooled BESS**.
- Greece third-auction/former-coal-region assets are often **4-hour systems**.
- PPC Melitis 1: **48 MW / 96 MWh**, liquid-cooled LFP.
- PPC Ptolemaida 4: **50 MW / 100 MWh**, liquid-cooled LFP.
- PPC Amyntaio: **50 MW / 200 MWh**, Trina Elementa 2, 60 cabinets, 8 PCS/MV skid enclosures, about 244 MWh nameplate.
- METLEN-Karatzis Thessaly: **330 MW / 790 MWh**, about 2.39h, supplier not publicly verified.

These should be templates, not hardcoded truths. Every inferred value should carry a confidence level.

---

## 3.3 Support-scheme obligations are useful constraints

Greek storage support-scheme obligations from the research note can become compliance checks:

- full-cycle performance at commercial operation at least 80%;
- active/standby own energy consumption not above 15% of guaranteed capacity daily;
- availability of capacity equal to 93% on biennial average basis;
- maximum injection capacity and discharge duration fixed during support period;
- no second-life equipment;
- ability to participate as an independent balancing-services entity.

For the MVP, these are mostly visual checks and soft constraints. They should be shown as compliance indicators, not overclaimed as contract enforcement.

---

## 4. Product scope

## 4.1 What we should build now

Build a **Battery Twin Builder** inside the existing Battery Twin view.

It should include:

- template selector;
- project profile summary;
- configurable number inputs and sliders;
- capacity stack visualization;
- parameter confidence table;
- optimizer constraint preview;
- feasibility and compliance checks;
- clear notes for which values are public facts, inferred defaults, or operator overrides.

## 4.2 What this feature should feed

The twin should feed:

- `buildDispatchSchedule`;
- Control Room feasibility proof;
- Decision Confidence / robustness metrics;
- Scenario comparison;
- future optimizer upgrade.

## 4.3 What not to build yet

Do not build:

- a high-fidelity electrochemical cell model;
- real BMS/SCADA ingestion;
- thermal CFD or rack-level simulation;
- warranty/legal compliance engine;
- stochastic degradation model;
- production-grade MILP if it blocks the demo.

The MVP should be a credible engineering and product scaffold, not a research simulator.

---

## 5. UI design

## 5.1 Battery Twin view layout

Replace the current thin `Battery Twin Specs` panel with a fuller but still demo-focused layout:

```text
Battery Twin
├── Template Selector
├── Asset Configuration Controls
├── Capacity Stack
├── Optimizer Constraint Preview
├── Confidence & Missing Specs
└── Twin Output / Dispatch Impact
```

The view should feel like a configuration cockpit, not a form-heavy settings page.

---

## 5.2 Template selector

Use a segmented/list selector with templates:

1. `Generic Greece 2h LFP`
2. `Generic Greece 4h LFP`
3. `PPC Amyntaio / Trina Elementa 2`
4. `METLEN-Karatzis Thessaly`
5. `PPC Melitis 1`
6. `PPC Ptolemaida 4`
7. `Jinko SunTera-style`
8. `Sungrow PowerTitan-style`
9. `BYD MC Cube-T-style`
10. `Custom Asset`

Each template card should show:

- power / energy;
- duration;
- chemistry;
- cooling;
- confidence;
- source basis.

Example:

```text
METLEN-Karatzis Thessaly
330 MW / 790 MWh · 2.39h
LFP + liquid cooling inferred
Supplier unknown publicly
Confidence: medium headline, low internal configuration
```

---

## 5.3 Configurable controls

Use dials, sliders, selectors, and numeric inputs. The point is to let a company override assumptions quickly.

### Required controls

| Control | Type | Purpose |
|---|---|---|
| Rated AC power | number input | Max injection/withdrawal |
| Contracted usable energy | number input | Market/customer usable MWh |
| Nameplate DC energy | number input | Installed physical capacity |
| Duration | derived, read-only | Energy / power sanity check |
| Chemistry | selector | LFP, NMC, unknown |
| Cooling | selector | liquid, air, unknown |
| Round-trip efficiency | slider | AC-to-AC economics |
| Min SoC | slider | Lower energy bound |
| Max SoC | slider | Upper energy bound |
| Reserve SoC | slider | Headroom/footroom for balancing/readiness |
| Initial SoC | slider | Starting state |
| Max charge power | number input | Charging limit |
| Max discharge power | number input | Discharging limit |
| Max cycles per day | slider | Cycling policy |
| Degradation cost | number input | Economic cycle penalty |
| Availability | slider | Derating / outage assumption |
| Auxiliary load mode | selector | off, simple, heat-aware |
| Market phase | selector | test mode, commercial operation |

### Secondary controls

These can be collapsed:

- PCS efficiency;
- transformer efficiency;
- standby auxiliary load;
- active cooling load;
- ramp rate;
- state-of-health;
- operating temperature limit;
- terminal SoC policy;
- balancing reserve duration;
- support-scheme obligations.

---

## 5.4 Capacity Stack visualization

This is the highest-value visual.

Show a funnel or stepped bar:

```text
244 MWh DC nameplate
-> 200 MWh contracted usable
-> 160 MWh operational SoC window at 10-90%
-> 142 MWh AC dispatchable after RTE/auxiliary estimate
```

For METLEN-Karatzis, show uncertainty:

```text
790 MWh reported energy
-> nameplate DC unknown, estimated 880-960 MWh if reported energy is contracted usable
-> operational window depends on selected SoC policy
-> AC dispatchable depends on RTE assumption
```

### Rules

- If nameplate is known, show exact value.
- If nameplate is unknown, estimate from a configurable usable-to-nameplate ratio.
- Label estimates clearly.
- Use confidence tags on each layer.

---

## 5.5 Optimizer Constraint Preview

Add a panel that converts the twin into constraints.

Example:

```text
Energy bounds
10.0 MWh <= SoC <= 90.0 MWh

Power bounds
0 <= charge <= 50 MW
0 <= discharge <= 50 MW

Efficiency
charge η = 93.8%
discharge η = 93.8%
AC-to-AC RTE = 88.0%

Cycle policy
Equivalent cycles <= 1.5/day

Terminal rule
Final SoC >= initial SoC - 5 MWh
```

This directly substantiates the claim that the twin is used by the optimizer.

---

## 5.6 Parameter confidence table

Show a table:

| Parameter | Value | Confidence | Basis |
|---|---:|---|---|
| Rated power | 50 MW | High | public project disclosure |
| Contracted energy | 200 MWh | High | public project disclosure |
| Nameplate energy | 244 MWh | High | Trina disclosure |
| Chemistry | LFP | High | public manufacturer/project disclosure |
| RTE | 88-94% | Medium | template/vendor range |
| Degradation cost | 4 EUR/MWh | Low | demo economic proxy |
| Warranty throughput | unknown | Unknown | customer needed |

This makes data scarcity explicit rather than hidden.

---

## 5.7 Missing critical specs

For scarce-spec assets, list missing items:

- supplier;
- nameplate DC energy;
- PCS count;
- warranty throughput;
- guaranteed availability terms;
- auxiliary load;
- thermal derating curve;
- BMS SoC calibration;
- exact RTE measurement boundary.

Add short copy:

```text
The schedule remains feasible under conservative defaults, but these parameters would improve confidence.
```

---

## 6. Data model

Current `BatteryTwinConfig` is too small:

```ts
type BatteryTwinConfig = {
  capacityMwh: number;
  maxChargeMw: number;
  maxDischargeMw: number;
  roundTripEfficiency: number;
  minSocMwh: number;
  maxSocMwh: number;
  initialSocMwh: number;
  degradationCostEurPerMwh: number;
};
```

Keep this as the optimizer-compatible core, but add a richer twin model.

## 6.1 Proposed types

```ts
type ConfidenceLevel = "high" | "medium" | "low" | "unknown";

type BatteryTwinTemplateId =
  | "generic-greece-2h-lfp"
  | "generic-greece-4h-lfp"
  | "ppc-amyntaio-trina"
  | "metlen-karatzis-thessaly"
  | "ppc-melitis-1"
  | "ppc-ptolemaida-4"
  | "jinko-suntera"
  | "sungrow-powertitan"
  | "byd-mc-cube-t"
  | "custom";

type BatteryTwinProfile = {
  id: BatteryTwinTemplateId;
  name: string;
  sourceBasis: string[];
  owner?: string;
  operator?: string;
  country: string;
  region?: string;
  marketPhase: "test-mode" | "commercial" | "unknown";
  chemistry: "LFP" | "NMC" | "unknown";
  cooling: "liquid" | "air" | "unknown";
  manufacturer?: string;
  platform?: string;
  confidence: Record<string, ConfidenceLevel>;
};

type BatteryTwinParameters = {
  ratedPowerMwAc: number;
  contractedUsableEnergyMwh: number;
  nameplateEnergyMwhDc: number | null;
  usableToNameplateRatioEstimate: number;
  minSocPct: number;
  maxSocPct: number;
  reserveSocPct: number;
  initialSocPct: number;
  roundTripEfficiencyAc: number;
  maxChargePowerMw: number;
  maxDischargePowerMw: number;
  maxCyclesPerDay: number;
  degradationCostEurPerMwhThroughput: number;
  availabilityPct: number;
  stateOfHealthPct: number;
  auxiliaryMode: "off" | "simple" | "heat-aware";
  standbyAuxiliaryMw: number;
  activeAuxiliaryMw: number;
  rampRateMwPerMin: number | null;
  terminalSocPolicy: "none" | "minimum-return" | "equal-start";
};

type CapacityStack = {
  nameplateMwhDc: number | null;
  nameplateEstimated: boolean;
  contractedUsableMwh: number;
  operationalWindowMwh: number;
  availableAfterSohMwh: number;
  acDispatchableMwhEstimate: number;
  nameplateToUsableGap: number | null;
};

type OptimizerBatteryConstraints = {
  capacityMwh: number;
  minSocMwh: number;
  maxSocMwh: number;
  initialSocMwh: number;
  maxChargeMw: number;
  maxDischargeMw: number;
  chargeEfficiency: number;
  dischargeEfficiency: number;
  roundTripEfficiency: number;
  degradationCostEurPerMwh: number;
  maxCyclesPerDay: number;
  availabilityDerate: number;
  reserveSocMwh: number;
  terminalSocPolicy: BatteryTwinParameters["terminalSocPolicy"];
};
```

---

## 7. Template examples

## 7.1 Generic Greece 2h LFP

```ts
{
  id: "generic-greece-2h-lfp",
  name: "Generic Greece 2h LFP",
  sourceBasis: [
    "Greece first storage auction pattern",
    "PPC Melitis/Ptolemaida disclosures",
    "RAEWW support-scheme obligations",
  ],
  chemistry: "LFP",
  cooling: "liquid",
  ratedPowerMwAc: 50,
  contractedUsableEnergyMwh: 100,
  nameplateEnergyMwhDc: null,
  usableToNameplateRatioEstimate: 0.85,
  roundTripEfficiencyAc: 0.89,
  minSocPct: 10,
  maxSocPct: 90,
  reserveSocPct: 10,
  maxCyclesPerDay: 1.5,
  availabilityPct: 93,
}
```

## 7.2 Generic Greece 4h LFP

```ts
{
  id: "generic-greece-4h-lfp",
  name: "Generic Greece 4h LFP",
  sourceBasis: [
    "Greece third storage auction pattern",
    "PPC Amyntaio project",
    "RAEWW support-scheme obligations",
  ],
  chemistry: "LFP",
  cooling: "liquid",
  ratedPowerMwAc: 50,
  contractedUsableEnergyMwh: 200,
  nameplateEnergyMwhDc: null,
  usableToNameplateRatioEstimate: 0.85,
  roundTripEfficiencyAc: 0.89,
  minSocPct: 10,
  maxSocPct: 90,
  reserveSocPct: 10,
  maxCyclesPerDay: 1.25,
  availabilityPct: 93,
}
```

## 7.3 PPC Amyntaio / Trina Elementa 2

```ts
{
  id: "ppc-amyntaio-trina",
  name: "PPC Amyntaio / Trina Elementa 2",
  sourceBasis: [
    "PPC project disclosure",
    "Trina Storage project disclosure",
    "Research note capacity-stack finding",
  ],
  manufacturer: "Trina Storage",
  platform: "Elementa 2",
  chemistry: "LFP",
  cooling: "liquid",
  ratedPowerMwAc: 50,
  contractedUsableEnergyMwh: 200,
  nameplateEnergyMwhDc: 244,
  usableToNameplateRatioEstimate: 200 / 244,
  roundTripEfficiencyAc: 0.89,
  minSocPct: 10,
  maxSocPct: 90,
  reserveSocPct: 10,
  maxCyclesPerDay: 1.25,
  availabilityPct: 93,
  hardware: {
    batteryCabinets: 60,
    pcsMvSkids: 8,
  },
}
```

## 7.4 METLEN-Karatzis Thessaly

```ts
{
  id: "metlen-karatzis-thessaly",
  name: "METLEN-Karatzis Thessaly",
  sourceBasis: [
    "METLEN/Karatzis public project disclosure",
    "Regional LFP/liquid-cooled BESS pattern",
    "Candidate supplier archetypes from research note",
  ],
  owner: "METLEN 49%, Karatzis 51%",
  operator: "METLEN M Renewables",
  chemistry: "unknown",
  cooling: "unknown",
  ratedPowerMwAc: 330,
  contractedUsableEnergyMwh: 790,
  nameplateEnergyMwhDc: null,
  usableToNameplateRatioEstimate: 0.85,
  roundTripEfficiencyAc: 0.89,
  minSocPct: 10,
  maxSocPct: 90,
  reserveSocPct: 10,
  maxCyclesPerDay: 1.25,
  availabilityPct: 93,
  confidence: {
    ratedPowerMwAc: "high",
    contractedUsableEnergyMwh: "high",
    manufacturer: "unknown",
    chemistry: "medium",
    cooling: "medium",
    nameplateEnergyMwhDc: "low",
    degradationCost: "low",
  },
}
```

---

## 8. Derived calculations

## 8.1 Capacity stack

```ts
function buildCapacityStack(params: BatteryTwinParameters): CapacityStack {
  const nameplate =
    params.nameplateEnergyMwhDc ??
    params.contractedUsableEnergyMwh / params.usableToNameplateRatioEstimate;

  const operationalWindow =
    params.contractedUsableEnergyMwh *
    ((params.maxSocPct - params.minSocPct) / 100);

  const availableAfterSoh =
    operationalWindow * (params.stateOfHealthPct / 100);

  const acDispatchable =
    availableAfterSoh * Math.sqrt(params.roundTripEfficiencyAc);

  return {
    nameplateMwhDc: nameplate,
    nameplateEstimated: params.nameplateEnergyMwhDc === null,
    contractedUsableMwh: params.contractedUsableEnergyMwh,
    operationalWindowMwh: operationalWindow,
    availableAfterSohMwh: availableAfterSoh,
    acDispatchableMwhEstimate: acDispatchable,
    nameplateToUsableGap:
      nameplate > 0
        ? 1 - params.contractedUsableEnergyMwh / nameplate
        : null,
  };
}
```

## 8.2 Optimizer constraints

```ts
function toOptimizerConstraints(params: BatteryTwinParameters): OptimizerBatteryConstraints {
  const capacityMwh = params.contractedUsableEnergyMwh * (params.stateOfHealthPct / 100);
  const minSocMwh = capacityMwh * (params.minSocPct / 100);
  const maxSocMwh = capacityMwh * (params.maxSocPct / 100);
  const initialSocMwh = capacityMwh * (params.initialSocPct / 100);
  const efficiency = Math.sqrt(params.roundTripEfficiencyAc);
  const availabilityDerate = params.availabilityPct / 100;

  return {
    capacityMwh,
    minSocMwh,
    maxSocMwh,
    initialSocMwh,
    maxChargeMw: params.maxChargePowerMw * availabilityDerate,
    maxDischargeMw: params.maxDischargePowerMw * availabilityDerate,
    chargeEfficiency: efficiency,
    dischargeEfficiency: efficiency,
    roundTripEfficiency: params.roundTripEfficiencyAc,
    degradationCostEurPerMwh: params.degradationCostEurPerMwhThroughput,
    maxCyclesPerDay: params.maxCyclesPerDay,
    availabilityDerate,
    reserveSocMwh: capacityMwh * (params.reserveSocPct / 100),
    terminalSocPolicy: params.terminalSocPolicy,
  };
}
```

---

## 9. Scheduler integration

## 9.1 Near-term integration

The current scheduler can keep its heuristic shape, but should accept derived constraints from the richer twin.

Current:

```ts
buildDispatchSchedule(prices, twin)
```

Near-term:

```ts
const constraints = toOptimizerConstraints(activeTwin.parameters);
const dispatch = buildDispatchSchedule(prices, constraints);
```

`BatteryTwinConfig` can be expanded or mapped from `OptimizerBatteryConstraints`.

## 9.2 Constraints the current scheduler should respect

Must have:

- min SoC;
- max SoC;
- max charge power;
- max discharge power;
- round-trip efficiency;
- degradation cost;
- no simultaneous charge/discharge;
- initial SoC.

Should add:

- max cycles per day;
- terminal SoC policy;
- reserve SoC;
- availability derate.

Future:

- ramp limits;
- auxiliary load;
- thermal derating;
- forecast risk penalty;
- balancing reserve constraints.

---

## 10. Dispatch feasibility checks

The twin should generate a feasibility report for the Control Room.

```ts
type TwinFeasibilityCheck = {
  id: string;
  label: string;
  status: "pass" | "review" | "missing";
  detail: string;
};
```

Checks:

1. `SoC bounds`
2. `Power limits`
3. `No simultaneous charge/discharge`
4. `Cycle policy`
5. `Reserve SoC`
6. `Terminal SoC`
7. `Availability derate`
8. `Auxiliary load estimate`
9. `Capacity stack completeness`

These checks make the digital twin visible in the optimization result.

---

## 11. Demo assets

Use two demo assets to tell the story.

## 11.1 Scarce-spec asset: METLEN-Karatzis Thessaly

Purpose:

> Show that the platform still creates a feasible schedule when only headline public information exists.

Known:

- 330 MW;
- 790 MWh;
- Thessaly;
- METLEN / Karatzis ownership;
- METLEN operator;
- expected Q2 2026 completion in public reporting.

Unknown / inferred:

- supplier;
- nameplate DC energy;
- PCS count;
- warranty throughput;
- exact RTE;
- auxiliary load;
- BMS/thermal derating.

UI story:

```text
Known project facts -> inferred Greece LFP template -> configurable assumptions -> feasible schedule
```

## 11.2 Known-spec asset: PPC Amyntaio / Trina Elementa 2

Purpose:

> Show how the twin becomes more precise when supplier details exist.

Known:

- 50 MW;
- 200 MWh contracted;
- about 244 MWh nameplate;
- Trina Elementa 2;
- 60 cabinets;
- 8 PCS/MV skids;
- liquid-cooled LFP;
- 10-year service agreement in public reporting.

UI story:

```text
Known supplier/project facts -> precise capacity stack -> higher confidence constraints
```

---

## 12. Interaction model

## 12.1 Template-first editing

The operator starts from a template, then edits assumptions.

Flow:

1. Select template.
2. Review known/inferred/unknown fields.
3. Adjust dials and number inputs.
4. Watch capacity stack update.
5. Watch optimizer constraints update.
6. Recompute schedule.
7. Review feasibility and value impact.

## 12.2 Dirty-state behavior

If the user edits template defaults, show:

```text
Modified from Generic Greece 4h LFP
```

Provide a `Reset template` button.

## 12.3 Presets

Provide small operating policy presets:

- `Conservative`: SoC 15-85%, higher degradation cost, terminal SoC return.
- `Balanced`: SoC 10-90%, default degradation, reserve retained.
- `Aggressive`: SoC 5-95%, lower reserve, higher cycle allowance.

These are not full risk modes yet. They are battery operating policies that update twin constraints.

---

## 13. Visual acceptance criteria

The feature is visually complete when:

- the Battery Twin page is not just six numeric fields;
- the selected template is obvious;
- Capacity Stack is visible and understandable;
- every estimated value is labelled as estimated;
- the UI shows high/medium/low/unknown confidence;
- changing a dial updates both the capacity stack and scheduler output;
- the Control Room can show that its schedule uses the selected twin.

---

## 14. Technical acceptance criteria

The implementation is complete when:

- templates exist as typed data in `lib/battery-twin.ts`;
- a selected template can produce the existing optimizer-compatible config;
- Control Room dispatch updates when the selected twin changes;
- feasibility checks are derived from the dispatch and twin constraints;
- tests cover capacity-stack math, template-to-constraint mapping, and scheduler respect for updated bounds;
- `pnpm typecheck` passes;
- `pnpm test` passes.

---

## 15. Demo script

### Part 1: Data scarcity

> For the METLEN-Karatzis asset, public information gives us 330 MW and 790 MWh, but not the supplier, nameplate DC capacity, warranty throughput, or exact thermal model. Instead of pretending those are known, the twin starts from a Greek LFP storage template and marks uncertain parameters explicitly.

### Part 2: Capacity stack

> Headline MWh is not enough. The optimizer needs to know what is physically installed, what is contractually usable, what is available inside the SoC window, and what reaches the AC market after losses.

### Part 3: Constraints

> The schedule is generated inside this operating envelope: SoC limits, power limits, efficiency, degradation cost, reserve SoC, and availability assumptions.

### Part 4: Known-spec reference

> When we switch to PPC Amyntaio, supplier information improves the twin. We know it is a Trina Elementa 2 deployment with about 244 MWh nameplate supporting 200 MWh contracted capacity, so confidence improves and the capacity stack becomes more precise.

---

## 16. Success definition

The digital twin feature succeeds if it makes this claim defensible:

```text
Battery Intelligence OS can produce feasible schedules under asset-data scarcity because the optimizer is constrained by a transparent, configurable, research-backed battery twin.
```

It should make the product feel more serious without making the demo wider than necessary.
