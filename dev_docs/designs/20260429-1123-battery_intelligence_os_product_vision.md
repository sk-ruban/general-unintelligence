# Battery Intelligence OS — Product Vision & System Blueprint

**Working names:** Battery Intelligence OS, FlexPilot, GridFlex Copilot, Battery Mission Control  
**Hackathon context:** Battery Optimization in the Greek Electricity Market  
**Primary user wedge:** Battery owners/operators entering the Greek electricity market under data scarcity  
**Longer-term expansion:** Multi-asset, multi-market flexibility intelligence and business-planning platform

---

## 1. Product thesis

The product should **not** be positioned as “another Day-Ahead Market price forecaster.” That lane is crowded, difficult to validate in a 5-minute pitch, and likely to be overrepresented by other teams.

The product should be positioned as:

> **A battery intelligence and planning cockpit that turns fragmented market, system, weather, fuel, carbon, asset, and shock signals into explainable battery decisions and business planning insights under uncertainty.**

The operational question remains simple:

> **Should this battery charge, discharge, or stay idle — and why?**

But the product answer is broader:

1. What is happening in the market?
2. Which signals matter for battery value?
3. Is this opportunity robust or fragile?
4. Which model should be trusted in this regime?
5. What does the battery digital twin say is feasible?
6. What happens under alternative scenarios?
7. How should the operator act tomorrow?
8. How should the business plan for changing market regimes?

This creates a stronger product story than a pure optimization notebook.

---

## 2. Why this product exists

Greece’s electricity market is moving into a new phase: increasing renewable penetration, higher variability, curtailment pressure, stronger price volatility, and the first standalone batteries entering the Day-Ahead Market in test mode. The Day-Ahead Market now operates at 15-minute Market Time Unit resolution from 1 October 2025, meaning battery schedules must reason over 96 intervals per day rather than 24 hourly periods.

At the same time, battery-specific historical telemetry is scarce. Operators may have market, weather, and system data, but they do not yet have years of mature battery operating history. Therefore, a system cannot rely purely on historical battery behavior. It must combine external intelligence, asset specifications, synthetic simulation, constraint-aware scheduling, and uncertainty-aware decision support.

The product’s central response to data scarcity is:

> **Use the richest possible external intelligence layer plus a battery digital twin to make feasible, explainable, confidence-rated decisions before the asset has years of operating history.**

---

## 3. One-liner

> **Kpler-style market intelligence, specialized into an actionable battery operating layer.**

A broader commercial version:

> **Battery Intelligence OS helps energy companies operate and plan battery assets in volatile, data-scarce markets by aggregating external signals, creating proprietary flexibility metrics, configuring fit-for-purpose models, simulating battery behavior, and producing explainable charge/discharge decisions.**

---

## 4. Strategic positioning

### What this product is

- A **battery decision cockpit**.
- A **market intelligence dashboard** for battery value.
- A **model workbench** for configurable forecasting and scenario analysis.
- A **battery digital twin** for data-scarce asset simulation.
- A **business planning tool** for volatile market regimes.
- A **trust layer** between uncertain forecasts and real operating decisions.

### What this product is not

- Not merely a price forecast.
- Not a generic BI dashboard.
- Not a claim that one hackathon model has the best PnL.
- Not a black-box LLM that magically dispatches batteries.
- Not a full Kpler clone.
- Not a full trading desk or market-bidding system in v1.

### Main differentiation

Many teams will likely build:

> DAM prices → model → schedule → expected PnL.

This product instead builds:

> Data fabric → battery-relevant signals → configurable model lab → battery digital twin → scenario-aware optimization → operator cockpit → business-planning insights.

---

## 5. Target users and jobs to be done

### User 1: Battery operator / trader

**Primary job:** Decide how to operate the battery tomorrow.  
**Needs:** Feasible schedule, reasons, confidence, risk warnings, SoC path, degradation impact.

Key questions:

- When should we charge?
- When should we discharge?
- Which intervals are risky?
- Does the spread cover efficiency losses and degradation?
- What happens if prices deviate from forecast?

### User 2: Asset manager

**Primary job:** Understand whether the asset is being used economically and safely.  
**Needs:** Degradation-aware metrics, cycle count, performance vs expected, forecast error, intervention flags.

Key questions:

- Are we over-cycling the asset?
- Which decisions were robust?
- How much value came from reliable opportunities versus fragile ones?
- Are constraints being respected?

### User 3: Executive / strategy team

**Primary job:** Plan battery strategy under changing market conditions.  
**Needs:** Scenario analysis, business-planning metrics, model comparison, market-regime view.

Key questions:

- How valuable is flexibility this week/month/season?
- What happens under a gas shock, heatwave, low-wind week, or solar curtailment surge?
- Should we prefer 2-hour or 4-hour storage?
- Is the opportunity structural or temporary?

### User 4: Developer / quant / data scientist

**Primary job:** Build, test, compare, and govern models.  
**Needs:** Model registry, feature sets, experiment tracking, standardized metrics, no-leakage validation.

Key questions:

- Which model family works best for the current regime?
- Which features matter?
- Is the model robust under scenario perturbations?
- Is the model producing operationally useful schedules, not only low forecast error?

---

## 6. Product architecture

The system has seven product layers.

```text
┌───────────────────────────────────────────────────────────────┐
│ 7. Executive / Operator Dashboard                              │
│    Control Room · Model Lab · Twin · Scenarios · Data Health   │
├───────────────────────────────────────────────────────────────┤
│ 6. Explanation & Monitoring Layer                              │
│    Action cards · risk flags · model cards · data freshness    │
├───────────────────────────────────────────────────────────────┤
│ 5. Optimizer & Scenario Scheduler                              │
│    charge/discharge/idle · SoC · constraints · risk appetite   │
├───────────────────────────────────────────────────────────────┤
│ 4. Model Lab                                                   │
│    baselines · XGBoost/GBM · linear · neural · ensembles       │
├───────────────────────────────────────────────────────────────┤
│ 3. Battery Digital Twin                                        │
│    SoC · power limits · efficiency · degradation · simulation  │
├───────────────────────────────────────────────────────────────┤
│ 2. Signal Engine                                               │
│    FVI · curtailment · scarcity · fragility · regime shifts    │
├───────────────────────────────────────────────────────────────┤
│ 1. Data Fabric                                                 │
│    HEnEx · IPTO · Open-Meteo · ENTSO-E · TTF · EUA · shocks    │
└───────────────────────────────────────────────────────────────┘
```

---

## 7. Product pillars

## Pillar A — Data Fabric

The Data Fabric aggregates and normalizes external data into a canonical 15-minute time grid.

### Why it matters

Battery-specific data is scarce, so the product must compensate with external market, system, weather, fuel, carbon, and shock signals.

### Core principles

- Use **Europe/Athens** timezone for business-facing views.
- Store raw ingested files separately from normalized feature tables.
- Normalize all time-series data to a canonical 15-minute MTU grid.
- Support both API ingestion and manual CSV/XLSX fallback.
- Do not let a broken external API break the demo; maintain a deterministic demo dataset.
- Track data freshness, missingness, source reliability, and parsing status.

### Canonical data categories

1. Market prices
2. Market curves
3. Market volumes
4. System load
5. RES forecasts and actuals
6. Interconnection / cross-border signals
7. Weather forecasts and historical weather
8. Fuel prices
9. Carbon prices
10. Gas storage / LNG context
11. Geopolitical and exogenous shock indicators
12. Battery asset specifications
13. Synthetic battery telemetry

---

## 8. External data sources

## 8.1 HEnEx — Greek Day-Ahead Market and Intraday market data

**Purpose:** Main market price and market-structure source.

**Use for:**

- DAM prices.
- Aggregated volumes per Market Time Unit.
- Aggregated buy/sell curves.
- Market statistics.
- Post-market data.
- Block order results where useful.

**Why it matters:**

The DAM price is the main economic signal for battery arbitrage. Aggregated buy/sell curves are especially valuable because they allow the product to move beyond raw price and estimate whether a price is robust or fragile.

**Implementation notes:**

- Build a `HEnExAdapter` that can scrape/download XLSX files from Day-Ahead Market publications.
- Parse market results into canonical `market_prices` and `market_volumes` tables.
- Parse aggregated buy/sell curves into `market_curves`.
- Include manual XLSX/CSV upload fallback for hackathon reliability.
- Use curve data to calculate Market Fragility Score.

**Source URL:** https://www.enexgroup.gr/markets-publications-el-day-ahead-market

---

## 8.2 IPTO / ADMIE — Greek system data

**Purpose:** Greek transmission-system fundamentals.

**Use for:**

- Load forecasts.
- RES forecasts.
- ISP forecasts.
- ATC / interconnection capacity where available.
- System load.
- RES injections.
- Energy balance.
- Unit availability.
- Outages / maintenance / significant events where available.

**Why it matters:**

Battery value depends on system conditions, not only prices. High RES + low demand can create low prices or curtailment risk. High load + low RES can create scarcity and discharge opportunities.

**Implementation notes:**

- Build an `IPTOAdapter` for ISP Forecast pages and selected data-type pages.
- Prioritize load forecast and RES forecast ingestion.
- Normalize forecasts to 15-minute intervals.
- Preserve publication timestamp and forecast version.
- Add manual CSV/XLSX import fallback.

**Source URLs:**

- https://www.admie.gr/en/data-type/isp-forecast
- https://www.admie.gr/en/market/market-statistics/detail-data

---

## 8.3 Open-Meteo — weather forecasts and historical weather

**Purpose:** Weather features for demand, solar, and wind behavior.

**Use for:**

- Temperature.
- Wind speed at 10m and 100m.
- Wind direction.
- Cloud cover.
- Shortwave radiation.
- Direct normal irradiance.
- Diffuse radiation.
- Precipitation.
- Historical forecast comparisons.

**Why it matters:**

Weather drives both demand and renewable supply. Solar-heavy midday charging windows and wind-driven price collapses need weather context.

**Implementation notes:**

- Build `OpenMeteoAdapter` with configurable locations.
- Use multiple Greek regions or representative coordinates.
- Aggregate by simple mean or weighted regional profile for MVP.
- Use forecast API for upcoming schedules and historical/historical-forecast API for model training.

**Source URLs:**

- https://open-meteo.com/en/docs
- https://open-meteo.com/en/docs/historical-weather-api
- https://open-meteo.com/en/docs/historical-forecast-api

---

## 8.4 ICE Endex — Dutch TTF Natural Gas Futures

**Purpose:** European gas benchmark and thermal generation cost proxy.

**Use for:**

- Gas price signal.
- Fuel-shock scenario inputs.
- Thermal marginal-cost proxy.
- Regime-shift detection.

**Why it matters:**

Greek power prices are affected by fuel costs, especially during low-renewable or high-demand periods when thermal generation is marginal.

**Implementation notes:**

- Official ICE data may require licensing or may be difficult to access programmatically.
- Implement `TTFAdapter` as a pluggable adapter:
  - official source where credentials exist;
  - manual CSV fallback;
  - demo synthetic series for hackathon.
- Avoid hard dependency on paid data for demo reliability.

**Source URL:** https://www.ice.com/products/27996665/Dutch-TTF-Natural-Gas-Futures/data

---

## 8.5 EEX — EUA carbon allowances and Greek power futures context

**Purpose:** Carbon cost signal for fossil generation and forward-market context for Greek power.

**Use for:**

- EUA price signal.
- Carbon shock scenario inputs.
- Thermal marginal-cost proxy.
- Scarcity and regime metrics.
- Greek power futures as a forward-curve context signal.
- Report and LLM-analysis context for explaining broader market conditions.

**Why it matters:**

Carbon prices affect thermal generation economics and can influence electricity prices during periods when fossil generation sets the marginal price.

EEX also exposes Greek power futures, such as Greek Power Base Month, Quarter, and Year products. These are not the operational dispatch price series for the battery scheduler, but they are useful context for reports, scenario narratives, and LLM-powered analysis because they show what the forward market is implying about future Greek baseload price levels.

**Implementation notes:**

- Build `EEXEUAAdapter` with manual CSV fallback.
- Optionally build an `EEXGreekPowerFuturesAdapter` for forward-curve context.
- Support official EEX data if credentials/licensing are available.
- Include demo EUA time series if external access is unavailable.
- Treat EEX data as context and scenario input; do not use it as the primary source for tomorrow's battery dispatch schedule.
- Use HEnEx DAM and intraday market data as the primary Greek operational price source.

**Source URLs:**

- https://www.eex.com/en/markets/environmental-markets/eu-ets-spot-futures-options
- https://www.eex.com/en/market-data/market-data-hub

---

## 8.6 ENTSO-E Transparency Platform — European power-system context

**Purpose:** Pan-European electricity-market context.

**Use for:**

- Cross-border flows.
- Generation.
- Load.
- Transmission.
- Balancing.
- Outages.
- Congestion management.
- Neighboring bidding-zone prices.

**Why it matters:**

Greek prices and flexibility value can be influenced by cross-border conditions, interconnection constraints, and regional scarcity or surplus.

**Implementation notes:**

- Build `EntsoeAdapter` with optional API token.
- Use `entsoe-py` or direct API calls.
- Make adapter optional in MVP; fall back to demo data if token is absent.

**Source URLs:**

- https://www.entsoe.eu/data/transparency-platform/
- https://transparency.entsoe.eu/

---

## 8.7 GIE AGSI / ALSI — European gas storage and LNG context

**Purpose:** Gas-system stress and fuel-risk context.

**Use for:**

- EU gas storage filling level.
- LNG terminal inventory/send-out context.
- Fuel-risk and geopolitical-shock indicators.

**Why it matters:**

Gas system tightness can influence TTF prices, thermal generation economics, and electricity price regimes.

**Implementation notes:**

- Optional adapter for AGSI/ALSI API.
- For hackathon, manual CSV or mock gas storage series is acceptable.
- Use this primarily for scenario and regime indicators, not core dispatch.

**Source URL:** https://www.gie.eu/agsi-and-alsi-transparency-platforms/

---

## 8.8 GDELT — geopolitical and news event signals

**Purpose:** Exogenous shock monitoring.

**Use for:**

- Geopolitical stress indicators.
- Energy-security event mentions.
- Conflict / sanctions / supply-chain narratives.
- News intensity around gas, LNG, oil, power infrastructure, shipping routes.

**Why it matters:**

The product should not claim to predict wars. Instead, it should detect shock signals and allow stress-testing of battery strategy under changed market conditions.

**Implementation notes:**

- Optional `GDELTAdapter` for broad event/news intensity.
- Use only coarse metrics in MVP:
  - `geopolitical_news_intensity`
  - `energy_security_news_intensity`
  - `fuel_supply_news_intensity`
- Keep this clearly separate from deterministic forecasts.

**Source URLs:**

- https://www.gdeltproject.org/
- https://www.gdeltproject.org/data.html

---

## 8.9 Copernicus / ERA5 — climate and reanalysis data

**Purpose:** Long-run weather/climate historical context.

**Use for:**

- Historical weather reanalysis.
- Extreme-weather scenario generation.
- Long-term planning features.

**Why it matters:**

Open-Meteo is sufficient for MVP. Copernicus/ERA5 is useful for longer-term business planning and richer climate-regime analysis.

**Implementation notes:**

- Optional future adapter.
- Do not block MVP on Copernicus access.

**Source URLs:**

- https://cds.climate.copernicus.eu/
- https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels

---

## 8.10 ACER / REMIT / urgent market messages

**Purpose:** Market integrity, outage, and inside-information context.

**Use for:**

- Outage/event disclosures.
- Transmission/generation disruptions.
- Market monitoring context.
- Future regulatory/compliance layer.

**Why it matters:**

Urgent market messages and outage disclosures can help explain sudden price movement or forecast failure.

**Implementation notes:**

- Treat as optional and future-facing.
- For MVP, expose this as a placeholder “Market Events” source.

**Source URLs:**

- https://www.acer.europa.eu/remit/data-collection
- https://www.acer-remit.eu/

---

## 9. Proprietary battery-relevant metrics

The product should create a small set of memorable proprietary metrics. These metrics are the “intelligence layer” that makes the dashboard feel differentiated.

Do not present 20 metrics in the pitch. Build many if useful, but lead with three to five.

## 9.1 Flexibility Value Index — FVI

**Purpose:** Overall value of battery flexibility for each interval.

**Interpretation:** High FVI means the system expects battery optionality to be valuable around that interval.

**Inputs:**

- Forecast DAM price.
- Forecast price spread.
- Price volatility.
- Residual load.
- RES forecast.
- Curtailment signal.
- Scarcity signal.
- Fuel/carbon stress.
- Market fragility.
- Battery headroom and SoC.

**Example formula:**

```text
FVI_t = weighted_sum(
  normalized_spread_opportunity_t,
  scarcity_score_t,
  curtailment_absorption_score_t,
  residual_load_stress_t,
  fuel_carbon_stress_t,
  -market_fragility_penalty_t,
  battery_headroom_t
)
```

## 9.2 Charge Attractiveness Score

**Purpose:** How attractive it is to charge in an interval.

**Inputs:**

- Low forecast price.
- High RES forecast.
- Low residual load.
- Curtailment risk.
- Sufficient SoC headroom.
- Market robustness.

**Interpretation:** High score means “charging now is likely sensible.”

## 9.3 Discharge Scarcity Score

**Purpose:** How attractive it is to discharge in an interval.

**Inputs:**

- High forecast price.
- High residual load.
- Low RES forecast.
- High fuel/carbon stress.
- Interconnection constraints.
- Sufficient SoC.
- Market robustness.

**Interpretation:** High score means “the system likely values discharge now.”

## 9.4 Market Fragility Score

**Purpose:** Whether a DAM price is robust or sensitive to small market changes.

**Primary input:** HEnEx aggregated buy/sell curves.

**Possible approach:**

- Estimate local slope around the clearing point.
- Steeper slope means small demand/supply changes may create larger price changes.
- Combine with volume, historical volatility, and forecast uncertainty.

**Fallback if curve data is unavailable:**

- Use volatility, price jumps, low liquidity/volume, and unusual residual load as proxy.

## 9.5 Curtailment Absorption Score

**Purpose:** Whether battery charging aligns with renewable surplus or curtailment risk.

**Inputs:**

- High RES forecast.
- Low demand / low residual load.
- Low or negative price.
- Historical curtailment proxy.
- Solar radiation and wind features.

**Interpretation:** High score means “charging helps absorb surplus renewable energy.”

## 9.6 Spread Robustness Score

**Purpose:** Whether a proposed charge/discharge spread survives uncertainty.

**Inputs:**

- Forecast price distribution.
- Efficiency loss.
- Degradation cost.
- Scenario perturbations.

**Interpretation:** High score means “the trade is robust, not a fragile optimization artifact.”

## 9.7 Regime Shift Indicator

**Purpose:** Detect whether today resembles known historical regimes or is out-of-distribution.

**Possible regimes:**

- Normal.
- Solar surplus.
- Wind surplus.
- Evening scarcity.
- Fuel shock.
- Carbon shock.
- Interconnection-constrained.
- Extreme weather.
- Unknown / out-of-distribution.

**Implementation:**

- Start with rule-based classification.
- Later add clustering or anomaly detection over normalized features.

## 9.8 Battery Stress Score

**Purpose:** Quantify how physically aggressive a schedule is.

**Inputs:**

- Depth of discharge.
- Equivalent cycles.
- SoC extremes.
- Power ramps.
- Temperature risk if available.
- Throughput.

**Interpretation:** High score means “schedule may be profitable but harsh on the asset.”

---

## 10. Battery digital twin

The battery digital twin is non-negotiable. It is the product’s direct answer to data scarcity.

## 10.1 Why it matters

Because there is limited historical operating data from standalone Greek batteries, the product must simulate battery behavior from specifications and physics-informed constraints.

The digital twin lets the product:

- Generate feasible synthetic battery telemetry.
- Validate schedules before deployment.
- Estimate SoC trajectory.
- Estimate cycle count and degradation impact.
- Stress-test schedules under scenarios.
- Compare battery sizes and durations.
- Support planning before the asset has operational history.

## 10.2 Battery specification inputs

Minimum MVP config:

```yaml
asset_id: demo_bess_001
name: Demo 100MW / 200MWh BESS
power_mw: 100
energy_mwh: 200
duration_hours: 2
initial_soc_pct: 50
min_soc_pct: 10
max_soc_pct: 90
round_trip_efficiency_pct: 88
charge_efficiency_pct: 94
discharge_efficiency_pct: 94
max_charge_mw: 100
max_discharge_mw: 100
max_cycles_per_day: 1.5
degradation_cost_eur_per_mwh_throughput: 3.0
reserve_soc_pct: 10
availability_pct: 100
```

## 10.3 State variables

For each 15-minute interval:

- SoC MWh.
- SoC percentage.
- Charge MW.
- Discharge MW.
- Net power MW.
- Throughput MWh.
- Round-trip efficiency losses.
- Equivalent cycle count.
- Degradation cost.
- Constraint violations.
- Operating mode: charge / discharge / idle / review.

## 10.4 Constraints

The twin and optimizer must respect:

- SoC minimum and maximum.
- Energy capacity.
- Charge power limit.
- Discharge power limit.
- Round-trip efficiency.
- No simultaneous charge and discharge.
- Reserve SoC buffer.
- Maximum daily equivalent cycles.
- Optional ramp limits.
- Optional availability windows.

## 10.5 Degradation model

Start simple:

```text
throughput_mwh_t = charge_mwh_t + discharge_mwh_t
degradation_cost_t = throughput_mwh_t * degradation_cost_eur_per_mwh_throughput
equivalent_cycles_day = total_discharge_mwh_day / usable_capacity_mwh
```

Future extensions:

- Depth-of-discharge-dependent degradation.
- Temperature-dependent degradation.
- Calendar aging.
- State-of-health estimation from telemetry.

---

## 11. Model Lab

The Model Lab is inspired by configurable model-training platforms: users can choose model families, feature sets, targets, scenarios, and evaluation metrics. The objective is not to create arbitrary model combinatorics for its own sake, but to provide model governance under changing market conditions.

## 11.1 What the Model Lab should do

- Let users configure forecast targets.
- Let users choose feature sets.
- Let users choose model families.
- Train models on aligned data.
- Compare models using both statistical and battery-operational metrics.
- Produce model cards.
- Allow scenario testing.
- Feed forecasts and uncertainty into the optimizer.

## 11.2 Forecast targets

- DAM price.
- Price spread opportunity.
- Charge attractiveness.
- Discharge scarcity.
- Flexibility Value Index.
- Curtailment risk.
- Market fragility.
- Regime class.

## 11.3 Feature sets

- Market-only.
- Market + calendar.
- Market + system.
- Market + weather.
- Market + system + weather.
- Full fundamentals: market + system + weather + fuel + carbon + cross-border + shock signals.

## 11.4 Model families

MVP:

- Naive seasonal baseline.
- Linear regression / ridge regression.
- Gradient boosting / random forest.
- XGBoost if dependency is available.
- Simple neural model only if fast to implement.
- Ensemble blend of baseline + tree model.

Future:

- Quantile regression.
- Probabilistic neural networks.
- Temporal fusion transformer.
- Reinforcement learning for multi-market continuous decisioning.
- LLM-assisted analyst workflows.

## 11.5 Evaluation metrics

Do not evaluate only forecast error.

Use two categories.

### Forecast metrics

- MAE.
- RMSE.
- Weighted MAE during high-value intervals.
- Calibration of uncertainty bands.
- Directional accuracy for price spreads.

### Battery-operational metrics

- Opportunity capture.
- Spread robustness.
- Feasibility score.
- Constraint violation count.
- Degradation-adjusted value.
- Equivalent cycles.
- Schedule stability under scenarios.
- Operator review count.

## 11.6 Governance output

Each trained model should produce a model card:

- Model family.
- Training date.
- Data sources used.
- Feature set.
- Forecast horizon.
- Evaluation window.
- Performance metrics.
- Known weaknesses.
- Recommended use case.
- Current regime suitability.

---

## 12. Optimizer and scheduler

The optimizer converts forecasts, signals, and digital-twin constraints into a feasible 15-minute schedule.

## 12.1 Decision variables

For each interval:

- charge MW.
- discharge MW.
- idle flag.
- SoC MWh.
- operating mode.

## 12.2 Objective

The optimization objective should be risk-aware and degradation-aware:

```text
maximize expected_revenue
       - degradation_cost
       - risk_penalty
       - market_fragility_penalty
       - constraint_violation_penalty
```

Where:

```text
expected_revenue_t = price_t * (discharge_mwh_t - charge_mwh_t)
```

## 12.3 Constraints

- SoC dynamics.
- SoC min/max.
- Power limits.
- No simultaneous charge and discharge.
- Efficiency losses.
- Cycle limits.
- Reserve SoC.
- Optional availability.

## 12.4 Risk modes

The product should expose three operator modes:

1. **Conservative** — only high-confidence opportunities.
2. **Balanced** — default risk-adjusted schedule.
3. **Aggressive** — captures more upside with higher forecast/fragility risk.

The dashboard should visibly show how the schedule changes when the user toggles risk mode.

---

## 13. Scenario and business-planning layer

The product should include scenario planning because the business value is not only daily scheduling. It is planning under changing regimes.

## 13.1 Scenario examples

- Gas shock: TTF +40%.
- Carbon shock: EUA +20%.
- Heatwave: load +10%, temperature +5°C.
- Low-wind week.
- Solar surplus day.
- Interconnector constraint.
- Fuel-market disruption.
- Extreme RES curtailment day.
- Market volatility spike.
- 2-hour vs 4-hour battery comparison.
- Conservative vs aggressive cycling policy.

## 13.2 Scenario outputs

- Change in schedule.
- Change in Flexibility Value Index.
- Change in expected value.
- Change in degradation-adjusted value.
- Change in battery stress.
- Change in operator-review flags.
- Regime classification.

---

## 14. Dashboard product experience

The dashboard should feel like a polished business/operations product, not an academic notebook.

## 14.1 Page 1 — Control Room

**Core question:** What should the battery do tomorrow?

Key widgets:

- Tomorrow’s battery plan summary.
- 96-interval action timeline.
- Price forecast curve.
- SoC trajectory.
- Charge/discharge/idle blocks.
- Confidence bands.
- Risk mode toggle.
- Action cards.
- Key risks.
- Degradation-adjusted value.
- Constraint status.

Example hero copy:

> Recommended plan: charge during solar-surplus window, discharge during evening scarcity, stay idle where spreads do not cover degradation and forecast risk.

## 14.2 Page 2 — Market Intelligence

**Core question:** What is happening in the market and system?

Key widgets:

- DAM prices.
- Load forecast.
- RES forecast.
- Residual load.
- Fuel/carbon context.
- Greek power forward-curve context.
- Weather drivers.
- Cross-border context.
- Curtailment risk.
- Scarcity score.
- Market fragility score.
- Data-source freshness.

## 14.3 Page 3 — Signal Engine

**Core question:** Which intervals are valuable, risky, or fragile?

Key widgets:

- Flexibility Value Index heatmap.
- Charge Attractiveness Score.
- Discharge Scarcity Score.
- Curtailment Absorption Score.
- Spread Robustness Score.
- Regime classification.

## 14.4 Page 4 — Battery Digital Twin

**Core question:** What does the asset simulation say is feasible?

Key widgets:

- Asset config form.
- SoC simulation.
- Efficiency losses.
- Equivalent cycles.
- Degradation cost.
- Constraint validation.
- Synthetic telemetry preview.
- Battery stress score.

## 14.5 Page 5 — Model Lab

**Core question:** Which model should we trust for this regime?

Key widgets:

- Select forecast target.
- Select feature set.
- Select model family.
- Train / compare models.
- Model leaderboard.
- Forecast vs actual.
- Battery-operational metrics.
- Model card.
- Regime suitability.

## 14.6 Page 6 — Scenario Planner

**Core question:** What happens if the world changes?

Key widgets:

- Scenario templates.
- Shock sliders.
- Battery-size selector.
- Schedule comparison.
- Value comparison.
- Risk comparison.
- Executive summary.

## 14.7 Page 7 — Data Health

**Core question:** Can we trust today’s inputs?

Key widgets:

- Source status.
- Last update.
- Missingness.
- Parsing success.
- Data drift.
- Manual override/import panel.

---

## 15. LLM / copilot role

The LLM should not be the mathematical optimizer. The optimizer should be deterministic and auditable.

The LLM or explanation layer should act as:

- Analyst.
- Narrator.
- Report generator.
- Query interface.
- Action-card explainer.

MVP can use deterministic templates without an LLM. Optional LLM integration can generate natural-language summaries only from structured facts provided by the backend.

Example user queries:

- Why are we charging at 12:00?
- Why did aggressive mode discharge more than balanced mode?
- Which source is driving the scarcity score?
- What changed compared with yesterday?
- What would happen under a gas shock?

---

## 16. Kpler baseline and comparison

Kpler is a useful benchmark for category, tone, and ambition: broad market intelligence, proprietary datasets, forecasts, and decision-support tooling. However, the hackathon product should not claim parity with Kpler.

The comparison should be:

> **Kpler tells analysts where the market is moving. Battery Intelligence OS tells a battery operator how to act with a specific asset.**

Baseline inspiration from Kpler:

- Data-rich professional dashboard.
- Proprietary curves and metrics.
- Forecasting and market intelligence.
- Scenario-aware insights.
- Real-time and historical signals.

Differentiation:

- Battery-specific digital twin.
- Charge/discharge/idle decisions.
- SoC and degradation awareness.
- Constraint validation.
- Confidence-rated action cards.
- Model Lab focused on battery-operational metrics.
- Planning for data-scarce battery markets.

---

## 17. MVP scope for hackathon

The MVP must be ambitious in story but disciplined in execution.

## 17.1 Must-have

1. Polished dashboard shell.
2. Deterministic demo dataset.
3. Data-source cards for all planned sources.
4. Working Open-Meteo ingestion or mocked weather data.
5. HEnEx/IPTO manual CSV/XLSX ingestion or parsed demo files.
6. Canonical 15-minute time grid.
7. Battery digital twin.
8. At least three proprietary metrics:
   - Flexibility Value Index.
   - Market Fragility Score.
   - Curtailment Absorption Score.
9. At least two model options:
   - baseline.
   - tree/gradient boosting or linear.
10. Working optimizer or robust heuristic scheduler.
11. Risk modes: conservative, balanced, aggressive.
12. Action timeline and SoC curve.
13. Explanation cards.
14. Scenario planner with at least three scenarios.
15. Data health panel.

## 17.2 Nice-to-have

1. ENTSO-E API integration.
2. Live HEnEx/IPTO scraping.
3. GDELT shock signals.
4. GIE gas storage signal.
5. Model training UI.
6. LLM-generated executive summaries.
7. Advanced curve-based fragility from HEnEx buy/sell curves.
8. Exportable report.

## 17.3 Explicitly out of scope for MVP

1. Real trading/bidding execution.
2. Real-time dispatch control.
3. Full ancillary-services optimization.
4. Perfect PnL validation.
5. Full Kpler-level market intelligence parity.
6. Fully trained RL dispatch agent.
7. Production-grade battery degradation model.

---

## 18. Demo choreography for 5-minute pitch

## Minute 1 — Problem

“Greek batteries are entering a volatile, renewable-heavy market with limited battery operating history. A price forecast alone is not enough. Operators need a cockpit that tells them what to do, why, and how confident the system is.”

## Minute 2 — Product overview

Show the architecture:

> Data Fabric → Signal Engine → Digital Twin → Model Lab → Optimizer → Dashboard.

## Minute 3 — Control Room demo

Show tomorrow’s plan:

- Charge midday.
- Discharge evening.
- Idle when spreads are weak.
- SoC curve.
- Confidence and risk flags.

## Minute 4 — Differentiators

Show:

- Digital twin.
- Flexibility Value Index.
- Market Fragility Score.
- Scenario/risk toggle.
- Model Lab comparison.

## Minute 5 — Business value

Close with:

> “We are not selling a forecast. We are selling adaptive battery intelligence — a way to operate and plan batteries under data scarcity, volatility, and changing market regimes.”

---

## 19. Success criteria

The product succeeds if a judge can understand in under 60 seconds:

1. What the battery should do tomorrow.
2. Why it should do it.
3. How confident the system is.
4. What could go wrong.
5. How the plan changes under scenarios.
6. How the digital twin makes decisions feasible under data scarcity.
7. Why this is more than a price forecast.

---

## 20. Recommended final positioning

> **Battery Intelligence OS is a configurable decision cockpit for battery operators entering volatile, data-scarce power markets. It aggregates market, system, weather, fuel, carbon, and shock signals; converts them into battery-specific flexibility metrics; uses a digital twin to simulate feasible operation; lets users compare model families; and produces explainable charge/discharge schedules and business-planning scenarios.**
