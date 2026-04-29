# Battery Intelligence OS Branding

**Purpose:** guide UI design, visual identity, product copy, and text-to-UI generation for the hackathon system.

**Primary source docs:**

- `dev_docs/designs/20260429-1123-battery_intelligence_os_product_vision.md`
- `docs/battery_digital_twin_research_and_hackathon_application.md`
- `dev_docs/designs/20260429-1232-dam_convex_data_backend_design.md`
- `dev_docs/designs/20260429-1232-eex-market-data-hub-convex-design.md`
- `dev_docs/designs/20260429-1239-open-meteo-convex-weather-backend-design.md`
- `dev_docs/designs/20260429-1240-ice-ttf-convex-dashboard-data-design.md`

---

## 1. Brand Position

Battery Intelligence OS is an operator-grade decision cockpit for battery owners and energy teams entering volatile, data-scarce power markets.

It is not a generic analytics dashboard and not a price-forecast notebook. It should feel like a professional control room that converts fragmented market, system, weather, fuel, carbon, and asset signals into explainable charge, discharge, or idle decisions for a specific battery asset.

The strongest positioning line:

> Battery Intelligence OS turns uncertain market and asset data into feasible, explainable battery actions.

The brand should communicate four ideas at once:

1. **Operational confidence:** "What should the battery do tomorrow?"
2. **Market intelligence:** "Which signals explain the opportunity?"
3. **Physical realism:** "Is this schedule feasible for this asset?"
4. **Planning under uncertainty:** "What changes under shock scenarios?"

---

## 2. Product Personality

The interface should feel:

- **Precise:** every number has a source, unit, interval, and timestamp.
- **Calm under pressure:** volatility is visible, but the UI does not panic.
- **Analyst-grade:** dense enough for professionals, never toy-like.
- **Auditable:** recommendations come with reasons, confidence, constraints, and caveats.
- **Action-oriented:** the center of gravity is the battery plan, not the chart gallery.
- **European energy-market native:** use Europe/Athens time, EUR/MWh, MW, MWh, MTU 1-96, DAM, TTF, EUA, RES, SoC, and BESS terminology.

The product should not feel:

- like a climate-tech landing page;
- like a generic BI template;
- like a spreadsheet wrapper;
- like a black-box AI assistant;
- like a crypto trading terminal;
- like a consumer smart-home energy app.

---

## 3. Naming System

Use **Battery Intelligence OS** as the product name in the hackathon UI.

Use **Odyceo** only as a maker or team mark if a brand mark is needed. Do not make "Odyceo" the main dashboard headline unless the product direction changes.

Preferred module names:

- **Control Room** - daily action plan and operator summary.
- **Market Intelligence** - DAM, curves, system, fuel, carbon, and weather context.
- **Signal Engine** - proprietary battery-relevant metrics.
- **Battery Twin** - asset configuration, SoC, efficiency, degradation, and constraints.
- **Model Lab** - model comparison by decision quality.
- **Scenario Planner** - gas shock, carbon shock, heatwave, solar surplus, low-wind, battery duration comparisons.
- **Data Health** - freshness, coverage, missingness, source reliability, parsing status.

Avoid generic labels like "Dashboard", "Analytics", "Predictions", and "AI Insights" as primary navigation.

---

## 4. Visual Identity

### Core Metaphor

The visual metaphor is **grid control room plus battery digital twin**.

Use visual cues from:

- power-market terminals;
- grid operation dashboards;
- flight-deck instrumentation;
- industrial telemetry;
- market-intelligence platforms.

Do not use generic renewable imagery such as green leaves, globe graphics, solar panels as decorative stock art, or cartoon batteries.

### Layout Character

The UI should be dense, modular, and scan-first:

- left vertical icon navigation;
- compact top bar with product name, selected market day, timezone, and data mode;
- main work area with resizable panels or clear split panes;
- right rail for action tape, risks, and source status;
- charts and tables in tight panels with strong headers;
- no marketing hero inside the product surface.

Panels should be functional instruments, not decorative cards. Use compact headers, source labels, units, timestamps, and small status indicators.

### Shape Language

- Prefer squared or lightly rounded surfaces, 0-6 px radius.
- Use thin borders, subtle fills, and clear grid lines.
- Avoid pill-heavy SaaS styling.
- Avoid oversized rounded cards.
- Avoid floating glass blobs, soft gradient orbs, and decorative background art.
- Use icons for tools and navigation, with labels available through tooltips or section headers.

---

## 5. Color System

The product should sit on a dark graphite operational surface, with color used semantically. Avoid a one-note cyan-on-black interface by reserving each color for a specific job.

### Base Palette

| Role | Token | Hex | Usage |
| --- | --- | --- | --- |
| App background | `bg-void` | `#050506` | Main viewport background |
| Panel background | `bg-panel` | `#090B0E` | Instrument panels and rails |
| Raised panel | `bg-raised` | `#101419` | Selected controls, active table rows |
| Border | `line-muted` | `rgba(255,255,255,0.10)` | Dividers and panel outlines |
| Primary text | `text-main` | `#E6EDF3` | Important labels and values |
| Secondary text | `text-muted` | `#8B949E` | Metadata and hints |
| Disabled text | `text-faint` | `#545C66` | Unavailable states |

### Semantic Palette

| Role | Token | Hex | Usage |
| --- | --- | --- | --- |
| Intelligence cyan | `signal-cyan` | `#67E8F9` | Selected nav, live data, active signal |
| Charge green | `charge-green` | `#34D399` | Charge actions, renewable absorption, healthy data |
| Discharge amber | `discharge-amber` | `#F59E0B` | Discharge actions, scarcity, value capture |
| Risk red | `risk-red` | `#F87171` | Constraint breach, stale data, high risk |
| Weather blue | `weather-blue` | `#60A5FA` | Weather and RES proxy signals |
| Fuel violet | `fuel-violet` | `#A78BFA` | TTF, EUA, forward-market context |
| Neutral zinc | `neutral-zinc` | `#A1A1AA` | Idle states and low-signal intervals |

### Color Rules

- Charge is green.
- Discharge is amber.
- Idle is neutral.
- Live and selected states are cyan.
- Risk, missing data, and hard violations are red.
- Weather and renewable drivers can use blue.
- Fuel, carbon, and forward-market context can use violet.
- Never use color alone to communicate action; pair it with text, icon, or pattern.

---

## 6. Typography

Use a sober professional stack:

- Primary UI: **Inter** or equivalent neutral sans.
- Data values, MTUs, timestamps, units, and compact tables: **IBM Plex Mono** or equivalent technical monospace.

Typography should be compact:

- Product name: 13-15 px, semibold, uppercase or title case.
- Panel title: 11-13 px, semibold, uppercase.
- Metric value: 14-20 px depending on density.
- Table body: 11-12 px.
- Metadata: 10-11 px.

Use tabular numbers. Avoid negative letter spacing. Avoid oversized display headings inside the app.

---

## 7. Data Visualization

The UI should make the 96-interval Greek DAM day legible.

Preferred chart patterns:

- 96-interval action tape: charge, discharge, idle blocks by MTU.
- DAM price line with low/high markers and optional confidence bands.
- SoC trajectory as a clear line or area chart.
- Market curve depth chart with buy/sell distinction.
- Flexibility Value Index heatmap across MTUs.
- Scenario comparison using side-by-side deltas.
- Data-health matrix by source and freshness.

Every chart should expose:

- source;
- selected date;
- timezone;
- unit;
- freshness or fetch time where relevant;
- whether the data is live, cached, static, manual, or demo.

Avoid chart decoration that makes the values harder to read. Do not use 3D charts.

---

## 8. UI Content Priorities

The Control Room should answer these questions in order:

1. What is the recommended plan?
2. When should the battery charge, discharge, or stay idle?
3. What is the expected value after degradation and risk?
4. Is the schedule physically feasible?
5. Which signals drove the decision?
6. What could go wrong?
7. How does the plan change under conservative, balanced, or aggressive risk mode?

The first screen should include:

- recommended action summary;
- 96-interval action timeline;
- price forecast or selected DAM series;
- SoC trajectory;
- degradation-adjusted value;
- source/data health status;
- next actions in a right rail.

The first screen should not lead with:

- generic KPI cards only;
- a chatbot;
- a marketing intro;
- a model-training form;
- a giant map;
- ungrounded AI-generated prose.

---

## 9. Copy and Tone

Use plain operational language. Keep copy short, specific, and tied to evidence.

Good copy:

- "Charge during solar-surplus window."
- "Discharge during evening scarcity."
- "Idle: spread does not cover degradation and forecast risk."
- "Medium confidence: curve depth is thin near clearing price."
- "Schedule feasible under current SoC and power limits."
- "Data source stale: TTF context older than 60 minutes."

Avoid:

- "Unlock your energy potential."
- "AI-powered sustainability for tomorrow."
- "Revolutionizing the grid."
- "Optimize everything with one click."
- "The model thinks..."

Use confidence language carefully:

- High: disclosed, fresh, or directly measured.
- Medium: supported by pattern or current proxy.
- Low: inferred, synthetic, or sparse.
- Unknown: customer-provided or unavailable.

---

## 10. Interaction Principles

Controls should match operator workflows:

- Use segmented controls for risk mode: Conservative, Balanced, Aggressive.
- Use date pickers or dropdowns for market day selection.
- Use sliders for scenario shocks: gas +40%, carbon +20%, load +10%, temperature +5 C.
- Use compact numeric inputs for battery twin configuration.
- Use toggles for constraints: reserve SoC, degradation-aware, availability window.
- Use tables when inspection matters.
- Use command palette for jumping between modules, not for replacing the UI.

Important state handling:

- Loading states should show what source is hydrating.
- Empty states should say what data is missing and what fallback is active.
- Demo/static data should be labeled honestly.
- Risk modes should visibly change schedules and metrics.
- Manual fallback data should never look identical to live source data.

---

## 11. Iconography

Use restrained line icons. Prefer lucide icons already present in the app.

Suggested mapping:

- Control Room: `Gauge`
- Market Intelligence: `Activity`
- Signal Engine: `RadioTower` or `Radar`
- Battery Twin: `BatteryCharging`
- Model Lab: `GitCompare` or `BrainCircuit`
- Scenario Planner: `Braces` or `SlidersHorizontal`
- Data Health: `Database`
- Search/command: `Search`
- Live signal: small pulse/dot indicator

Avoid decorative icon collages.

---

## 12. Motion

Motion should communicate operational change, not entertain.

Use motion for:

- panel transitions between modules;
- hover/focus on actionable controls;
- action timeline updates when risk mode changes;
- live data pulse on freshness indicators;
- scenario delta transitions.

Avoid:

- bouncing elements;
- excessive particle effects;
- looping decorative animations;
- animated backgrounds.

---

## 13. UI Anti-Patterns to Avoid

- A landing-page hero instead of the cockpit.
- Light consumer dashboard styling.
- Green sustainability cliches.
- Overly rounded cards and pills.
- Full-width low-density KPI rows with no operating decision.
- Vague "AI insights" without source facts.
- Recommendations without feasibility, confidence, or risk.
- Forecast accuracy metrics without battery-operational metrics.
- Battery modeled as a single magic MWh number.
- Hidden data freshness and source caveats.

---

## 14. Text-to-UI Generator Prompt

Use this prompt to generate a distinct product UI concept from the brand system. It should not mirror the current repository implementation or simply restyle the existing cockpit.

```text
Design a fresh, production-quality web app interface for "Battery Intelligence OS", an operator-grade battery decision cockpit for the Greek electricity market.

Important creative direction:
Do not copy an existing dashboard layout from the current product. Do not default to a generic left-sidebar SaaS shell. Create a distinct interface concept that feels purpose-built for battery operation: part grid control room, part market-intelligence terminal, part digital-twin simulator.

Product thesis:
This is not a generic price forecast dashboard. It is a battery intelligence and planning cockpit that turns fragmented market, system, weather, fuel, carbon, asset, and shock signals into explainable charge, discharge, or idle decisions under uncertainty. The core user question is: "Should this battery charge, discharge, or stay idle tomorrow, and why?"

Target users:
Battery operators, energy traders, asset managers, executives, and quant/data teams working with BESS assets in Greece. They need feasible schedules, confidence, SoC paths, degradation-aware economics, scenario comparisons, and source transparency.

Build the first screen as an original operating surface, not a marketing landing page and not a conventional KPI dashboard.

Interface concept:
- Full-screen dark operational workspace named "Tomorrow Dispatch Board".
- A thin mission header across the top with product name, selected asset, market date, Europe/Athens timezone, market phase, and global source-confidence state.
- The central element should be a wide "96-MTU Decision Runway": a horizontal day timeline split into 15-minute intervals, with charge, discharge, and idle bands, confidence texture, price markers, SoC overlay, and risk annotations.
- Place a compact "Decision Brief" directly above or beside the runway: one clear recommendation, expected value, degradation-adjusted value, feasibility state, and confidence.
- Surround the runway with asymmetric intelligence zones, not equal generic cards:
  - a "Signal Constellation" cluster for Flexibility Value Index, Charge Attractiveness, Discharge Scarcity, Curtailment Absorption, Spread Robustness, and Market Fragility;
  - a "Twin Cutaway" panel showing nameplate capacity, usable capacity, AC-dispatchable capacity, SoC window, reserve buffer, efficiency losses, and cycle budget;
  - a "Market Stack" strip showing HEnEx DAM, market curve depth, Open-Meteo weather/RES proxy, TTF gas, EUA carbon, and Greek power futures;
  - a "Scenario Stack" with gas shock, carbon shock, heatwave, solar surplus, low-wind week, and 2h vs 4h asset comparison;
  - an "Evidence Ledger" area that lists source freshness, data mode, confidence level, and why each major recommendation was made.
- Navigation should be integrated into the workspace as tabs, mode chips, or a command deck. Avoid a normal app sidebar unless it is visually reinterpreted as an operator mode selector.
- Use functional panels with thin borders, compact headers, source labels, units, and timestamps.
- Use square or lightly rounded panels, not big rounded SaaS cards.

Control Room content:
- Recommendation summary: "Charge during solar-surplus window, discharge during evening scarcity, stay idle where spreads do not cover degradation and forecast risk."
- Risk mode control: Conservative, Balanced, Aggressive, with visible schedule deltas when switching modes.
- 96-interval MTU decision runway with charge, discharge, idle, review, and constrained states.
- DAM price curve in EUR/MWh, integrated with the runway rather than shown as a disconnected chart.
- SoC trajectory in MWh and percent, visually tied to battery constraints.
- Expected value, degradation-adjusted value, throughput, equivalent cycles, reserve headroom, and constraint status.
- Action explanations for the next few decisions with why, confidence, and caution text.
- Key risk callouts: thin market curve depth, stale source, weak spread robustness, SoC reserve pressure, high battery stress.

Distinctive UI moments:
- Show the battery as a technical capacity stack, not a decorative battery icon: DC nameplate, warranted usable, operational usable, AC-dispatchable, reserve locked.
- Show market uncertainty as texture or confidence bands on the MTU runway.
- Show scenario impacts as small before/after schedule overlays, not just KPI deltas.
- Show recommendations as evidence-backed operating cards: action, interval, reason, confidence, source, caveat.
- Include a source-mode badge for every data family: live, cached, static, manual, demo, missing.

Data-viz rules:
- Make the 96 Greek DAM 15-minute MTUs visually legible.
- Always label units: EUR/MWh, MW, MWh, percent, MTU.
- Always show source and freshness: live, cached, static, manual, or demo.
- Pair color with labels/icons so action states are not color-only.
- Avoid 3D charts, decorative gradients, stock renewable imagery, generic climate-tech visuals, and generic admin-dashboard composition.

Tone and copy:
- Use operational, evidence-based copy.
- Examples:
  - "Charge: solar surplus and low residual load."
  - "Discharge: evening scarcity and robust spread."
  - "Idle: spread does not cover degradation and forecast risk."
  - "Medium confidence: market curve depth is thin near clearing price."
  - "Feasible under current SoC and reserve constraints."
- Avoid marketing slogans like "unlock your energy potential" or vague "AI-powered insights."

Important product details to reflect:
- Greek Day-Ahead Market at 15-minute MTU resolution.
- Data scarcity in early standalone Greek BESS operation.
- Digital twin as the bridge between scarce asset specs and feasible schedules.
- Distinguish nameplate capacity, usable capacity, and AC-dispatchable capacity.
- Optimizer should be deterministic and auditable; natural language explanations are generated from structured facts.

Deliver a high-fidelity, original dashboard mockup that looks ready for a hackathon demo and credible to energy-market professionals. The result should feel like a new design direction for the product, not a direct reference to any existing codebase screen.
```
