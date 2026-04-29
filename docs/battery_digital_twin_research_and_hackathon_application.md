# Battery Digital Twin Research & Hackathon Application Guide

**Project context:** Battery Optimization in the Greek Electricity Market  
**Product direction:** Battery Intelligence OS — a market-intelligence, digital-twin, model-lab, and battery-decision cockpit for data-scarce BESS operation.  
**Prepared for:** Hackathon product/design/engineering handoff  
**Last updated:** 2026-04-29

---

## 0. Executive summary

The most defensible product direction is not “a better price forecast.” The hackathon brief is explicitly framed around **battery optimization under data scarcity**, where participants may use market, system, weather, and fuel/carbon signals, but do not have a mature history of standalone battery telemetry in Greece.

The digital twin should therefore remain a core product pillar:

> **A progressively calibrated battery digital twin that starts from scarce public information, manufacturer archetypes, tender obligations, and customer-provided specs, then improves as SCADA/BMS telemetry becomes available.**

The key research conclusion is that there is enough public information to build a credible BESS twin scaffold, but not enough to know every exact supplier, BMS, cell, PCS, thermal, warranty, or degradation parameter for many Greek assets. This is not a weakness. It is the problem the product solves.

The product should treat battery specs as layered and uncertain:

```text
Public project data
+ Manufacturer archetypes
+ Tender / support-scheme obligations
+ Customer configuration sheet
+ Market/system/weather signals
+ Synthetic telemetry where needed
+ Future SCADA/BMS telemetry
= Living battery digital twin
= Better scheduling, monitoring, warranty compliance, degradation-aware planning, and business intelligence
```

The strongest practical insight from the research is the **nameplate-vs-contracted capacity gap**. PPC Amyntaio is publicly described as a 50 MW / 200 MWh project, but Trina Storage disclosed that the project will use about **244 MWh nameplate capacity** to deliver **200 MWh contracted capacity**. That means a serious optimizer should not treat headline MWh as a single universal number. It should separate:

```text
DC nameplate energy
≠ warranted usable energy
≠ operational usable energy
≠ market-dispatchable AC energy
```

This one concept can become a standout dashboard feature and optimization constraint.

---

## 1. Research caveats and confidence levels

This research is built from public sources: organizer brief, corporate press releases, manufacturer product pages/datasheets, energy-market news, regulatory presentations, and research papers/reports. Some values are hard facts; others are reasoned defaults.

Use the following confidence language in the product and pitch:

| Confidence level | Meaning | Example |
|---|---|---|
| **High** | Publicly disclosed by project owner, regulator, or manufacturer | METLEN-Karatzis project reported as 330 MW / 790 MWh |
| **Medium** | Strongly supported by regional/project pattern, but not asset-specific | Greek first-wave BESS likely LFP and liquid-cooled |
| **Low** | Inferred from analogues or supplier relationship, not directly verified | METLEN Thessaly supplier may resemble Jinko/Trina/Sungrow archetype |
| **Unknown** | Must be customer-provided | Warranty throughput, PCS count, BMS settings, exact thermal derating curve |

The digital twin should show these confidence levels explicitly.

---

## 2. Hackathon brief implications

The organizer brief frames the problem as follows:

- Greece has rising renewable penetration, surplus RES periods, curtailment pressure, and stronger day-ahead/intraday volatility.
- Standalone batteries are just beginning to enter the Greek market, so historical battery operating data is scarce.
- The Day-Ahead Market now matters at **15-minute Market Time Unit** resolution.
- The task is not merely market forecasting; it is to design a robust battery optimization framework that decides when a battery should charge, discharge, or remain idle while respecting technical and operational constraints.
- Participants are expected to work with limited battery specifications and external signals rather than a rich telemetry history.

**Product implication:** a digital twin is the bridge between scarce asset data and feasible schedules.

**Implementation implication:** the optimizer should not simply trade price spreads. It should trade only when a spread survives efficiency loss, degradation cost, SoC constraints, auxiliary consumption, availability, warranty/compliance limits, and forecast risk.

**Source:** Hackathon brief uploaded by user: `Hackathon_final.docx.pdf`.

---

## 3. What we know about Greece’s BESS wave

### 3.1 Greece’s first standalone BESS entered the market in test mode

Public reporting says Greece’s first standalone batteries entered the Day-Ahead Market in test mode in April 2026. During the testing period, batteries are paid for energy supplied but do not face imbalance penalties; full market rules apply once commercial operations begin. Reporting also indicated about **300 MW** of battery storage capacity ready for energisation and a national target of up to **1.1 GW** installed battery capacity by the end of the year.

**Product implications:**

- Early operational data will not necessarily reflect full commercial risk because imbalance-penalty exposure may change after test mode.
- The digital twin should support a **market-phase flag**:
  - `test_mode_no_imbalance_penalty`
  - `commercial_operation_full_market_rules`
- A dashboard should distinguish between “economic simulation under test conditions” and “commercial operation under full market exposure.”

**Sources:** Renewables Now, Balkan Green Energy News. See source ledger [S1], [S2].

---

### 3.2 Greece’s first storage auction: 411.8 MW, mostly 2-hour assets

Greece’s first standalone BESS tender allocated **411.8 MW** across **12 projects** from **7 developers**. Public regulatory material and reporting show that these were largely two-hour assets or assets with minimum two-hour discharge duration.

Examples from public reporting and regulatory presentation:

| Developer / entity | Project power | Implied energy | Duration pattern |
|---|---:|---:|---:|
| HELLENiQ Renewables | 50 MW + 25 MW + 25 MW | 100 MWh + 50 MWh + 50 MWh | 2h |
| PPC Renewables | 50 MW + 48 MW | 100 MWh + 96 MWh | 2h |
| Intra Energy | 50 MW + 25 MW + 25 MW | 100 MWh + 50 MWh + 50 MWh | 2h |
| Aenaos Energy Systems / Mytilineos-linked | 48 MW | 96 MWh | 2h |
| Energy Bank | 50 MW | 100 MWh | 2h |

**Default digital-twin inference:**

```text
Greece first-wave auction BESS = 2-hour, grid-scale lithium-ion BESS,
likely LFP, likely liquid-cooled, around 0.5C at rated discharge.
```

This should be an archetype, not a hard-coded assumption.

**Sources:** RAEWW/ERRA presentation, Energy-Storage News, Balkan Green Energy News, Renewables Now. See [S3], [S4], [S5], [S6].

---

### 3.3 Greek tender/support technical obligations are directly useful as twin constraints

A RAEWW/ERRA presentation on Greece’s storage support scheme lists technical obligations for selected BESS. These are extremely valuable for the digital twin because they provide constraints even when supplier telemetry is missing.

Key obligations from the support scheme include:

| Obligation | Digital-twin interpretation |
|---|---|
| Maximum injection capacity and discharge duration cannot be modified during investment/operating aid period | Treat rated power and committed duration as fixed contractual attributes |
| Full-cycle performance must be at least 80% at commercial operation | Minimum performance / round-trip efficiency compliance floor |
| Active/standby own energy consumption must not exceed 15% of guaranteed capacity daily | Auxiliary-load daily limit and alert |
| Must be able to participate as an independent Balancing Services entity | Balancing-readiness metric and SoC reserve logic |
| Availability of capacity equal to 93% on a biennial average basis | Availability-budget and compliance metric |
| Used or second-life equipment prohibited | Asset-quality flag; no second-life degradation assumptions |

**Product implication:** these should become built-in compliance checks in the dashboard and soft/hard constraints in the optimizer.

**Source:** RAEWW/ERRA presentation, technical obligations slide. See [S3].

---

### 3.4 Greece’s third storage auction: 188.9 MW, mostly 4-hour systems

Greece’s third standalone storage auction selected **188.9 MW** across nine projects, reportedly located in Western Macedonia and Megalopoli/former coal regions. Public reporting says the selected projects are **four-hour** systems.

Representative examples reported publicly include:

| Project / entity | Power | Energy | Duration |
|---|---:|---:|---:|
| PPC Renewables | 50 MW | 200 MWh | 4h |
| HELLENiQ Renewables | 25 MW | 100 MWh | 4h |
| Enerkoplan | 25 MW | 100 MWh | 4h |
| Ardassa Energy | 18 MW | 72 MWh | 4h |

**Product implication:** Greece has at least two relevant templates:

1. **2-hour LFP liquid-cooled BESS template** — short arbitrage, peak shaving, fast response.
2. **4-hour LFP liquid-cooled BESS template** — longer energy shifting, renewable absorption, more reserve planning.

**Sources:** Balkan Green Energy News, PV Magazine, Renewables Now. See [S7], [S8], [S9].

---

## 4. METLEN-specific findings

### 4.1 METLEN-Karatzis Thessaly: largest planned standalone BESS in Greece

METLEN and Karatzis Group announced a joint venture for a **330 MW / 790 MWh** standalone BESS in Thessaly. Public materials state:

- METLEN stake: **49%**
- Karatzis stake: **51%**
- Project size: **330 MW / 790 MWh**
- Duration: about **2.39 hours**
- Location: Thessaly, Greece
- Expected completion: **Q2 2026**
- Total investment: about **€170 million**
- METLEN will undertake construction, operation, maintenance, and energy management through M Renewables
- The public sources found do **not** verify the exact supplier/manufacturer for this Greek project

**Digital-twin implications:**

| Parameter | Value / inference |
|---|---:|
| Rated power | 330 MW |
| Reported energy | 790 MWh |
| Duration | 790 / 330 = 2.39h |
| Chemistry | LFP assumed, not verified |
| Cooling | Liquid-cooled assumed, not verified |
| Supplier | Unknown publicly |
| Digital-twin confidence | High for headline MW/MWh; low for internal configuration |

The unusual part is the **2.39-hour duration**, which is neither the clean 2h nor 4h template. The product should support arbitrary MW/MWh ratios.

**Sources:** METLEN press release, Karatzis press release, Balkan Green Energy News, Naftemporiki. See [S10], [S11], [S12], [S13].

---

### 4.2 METLEN’s wider BESS activity gives useful supplier and design clues

METLEN has a broader European and international storage footprint.

#### Jinko ESS + METLEN framework

Jinko ESS announced a framework agreement with METLEN for more than **3 GWh** of utility-scale BESS across Chile and Europe. This followed a **1.6 GWh** Chile project involving Jinko ESS as system supplier.

**Inference:** this does not prove Jinko is the supplier for the Thessaly project, but Jinko should be one of the candidate manufacturer archetypes for METLEN-linked assets.

#### PPC + METLEN regional JV

METLEN and PPC announced a joint venture to develop, construct, and operate up to **1,500 MW / 3,000 MWh** of battery projects across Romania, Bulgaria, and Italy. The systems are publicly described as **two-hour, liquid-cooled, LFP battery systems**.

**Inference:** METLEN’s regional commercial architecture appears strongly aligned with two-hour LFP liquid-cooled BESS. This supports using `Generic_2h_LFP_Liquid_Cooled` as a high-confidence starting archetype for many METLEN regional projects, while keeping the exact supplier configurable.

**Sources:** JinkoSolar/Jinko ESS, METLEN, Renewables Now. See [S14], [S15], [S16].

---

## 5. PPC and other Greek projects with stronger hardware visibility

### 5.1 PPC Melitis 1 and Ptolemaida 4

PPC Group announced two BESS projects in Western Macedonia:

| Project | Power | Energy | Duration | Technology disclosed |
|---|---:|---:|---:|---|
| Melitis 1 | 48 MW | 96 MWh | 2h | Liquid-cooled LFP |
| Ptolemaida 4 | 50 MW | 100 MWh | 2h | Liquid-cooled LFP |

PPC describes these as liquid-cooled LFP systems, reinforcing the Greek first-wave template.

**Sources:** PPC Group, Naftemporiki, PPC 2026 update. See [S17], [S18], [S19].

---

### 5.2 PPC Amyntaio: best public Greek reference twin

PPC’s Amyntaio project is one of the most useful cases because both the project owner and the manufacturer have disclosed meaningful technical details.

PPC describes Amyntaio as:

- **50 MW / 200 MWh**
- Four-hour discharge capability
- Liquid-cooled LFP technology
- Located in Amyntaio, Western Macedonia

Trina Storage disclosed more detailed system information:

- Turnkey AC solution based on Trina’s Elementa platform
- **60 Elementa 2 battery cabinets**
- **8 integrated PCS & MV skid enclosures**
- Nameplate capacity of about **244 MWh**
- Contracted capacity of **200 MWh**
- Scope includes DC battery cabinets, PCS, MV skids, and power plant controller
- 10-year long-term service agreement covering maintenance, remote monitoring, spare-parts management, performance guarantees, and availability guarantees

#### Critical finding: nameplate-to-contracted ratio

```text
Contracted capacity = 200 MWh
Nameplate capacity ≈ 244 MWh
Usable/contracted-to-nameplate ratio ≈ 200 / 244 = 0.82
```

**Product implication:** this should become a central digital-twin feature called **Capacity Stack**:

```text
Nameplate DC capacity
→ Warranted usable capacity
→ Operational usable capacity after SoC buffers / degradation / derating
→ Market-dispatchable AC capacity after conversion and auxiliary losses
```

**Sources:** PPC Group, Trina Storage, Energy-Storage News, PV Europe. See [S20], [S21], [S22], [S23].

---

## 6. Manufacturer archetypes relevant to Greece and neighboring markets

The goal is not to perfectly identify every supplier in Greece. The goal is to create a library of plausible, configurable, manufacturer-inspired templates that can initialize a digital twin when asset-specific data is scarce.

### 6.1 Trina Storage — Elementa 2 / Elementa platform

**Relevance:** directly relevant to Greece through PPC Amyntaio.

Public product/project information indicates:

- LFP chemistry
- 4–5 MWh class Elementa 2 system configurations
- 1500 V DC architecture
- Liquid cooling
- Temperature difference target around **≤2.5°C**
- Energy efficiency claims above **95%** in some product materials
- 306Ah / 314Ah class LFP cells depending configuration
- Project-level deployment in Greece with 60 cabinets and 8 PCS/MV skids for Amyntaio

**Digital-twin defaults:**

| Parameter | Trina-style default |
|---|---|
| Chemistry | LFP |
| Cabinet/block energy | 4–5 MWh class |
| Cooling | Liquid cooling |
| Thermal uniformity | ΔT ≤2.5°C target |
| Efficiency | Vendor energy-efficiency claim >95%; AC-to-AC should be separately modeled |
| Service model | LTSA, remote monitoring, performance/availability guarantees possible |

**Sources:** Trina Elementa 2 datasheet/product pages, Trina Amyntaio release. See [S21], [S24], [S25].

---

### 6.2 Jinko ESS — SunTera

**Relevance:** strongly relevant to METLEN because of the 3 GWh framework agreement, though not confirmed for METLEN’s Greek Thessaly project.

Public product information indicates:

- SunTera utility ESS
- **5.01 MWh / 20 ft** configuration
- Liquid cooling
- LFP chemistry
- Cycle life claim around **10,000 cycles**
- Round-trip efficiency claim around **94%**
- 314Ah LFP cells in product material
- Some product/news material references 0.5P continuous charge/discharge and IP55/C4/C5 corrosion resistance

**Digital-twin defaults:**

| Parameter | Jinko-style default |
|---|---|
| Chemistry | LFP |
| Cell class | 314Ah LFP |
| Container energy | ~5.01 MWh / 20 ft |
| RTE | 94% vendor claim; define measurement boundary |
| Cycle life | 10,000 cycles vendor claim |
| Cooling | Liquid cooling |
| Protection | IP55 / corrosion resistance in some product materials |

**Sources:** Jinko ESS product page, Jinko datasheets, Jinko/METLEN release. See [S14], [S26], [S27], [S28].

---

### 6.3 Sungrow — PowerTitan 2.0

**Relevance:** important Southeast Europe benchmark, especially Romania.

Public product information indicates:

- Liquid-cooled utility BESS
- About **5 MWh** battery integrated with about **2.5 MW PCS** in a 20-foot container in PowerTitan 2.0 materials
- AC Block design
- System solutions from 2 to 8 hours
- Operating environment from **-30°C to 50°C** in public product material
- A reported round-trip efficiency around **89.5%** in Sungrow PowerTitan 2.0 public material
- Rack-level/string PCS control enabling individual charge/discharge management

**Digital-twin defaults:**

| Parameter | Sungrow-style default |
|---|---|
| Chemistry | LFP inferred from product family / market context |
| Container energy | ~5 MWh |
| PCS integration | Integrated battery + PCS AC Block |
| Full-power duration | ~2h at 2.5 MW / 5 MWh block |
| Cooling | Liquid cooling |
| Operating temperature | -30°C to 50°C |
| AC-side RTE | ~89.5% public claim |

**Sources:** Sungrow product pages/releases, Energy-Storage News regional deal. See [S29], [S30], [S31], [S32].

---

### 6.4 BYD — MC Cube-T

**Relevance:** regional benchmark through Bulgaria and Eastern Europe.

Public product information indicates:

- MC Cube-T utility-scale BESS
- Nominal energy configurations around **5,010 kWh** and **6,012 kWh**
- Nominal power around **2,506 kW** and **3,006 kW**
- Liquid cooling
- IP55 rating
- LFP/Blade Battery context in BYD energy-storage product family

**Digital-twin defaults:**

| Parameter | BYD-style default |
|---|---|
| Chemistry | LFP / Blade Battery context depending product |
| Block energy | ~5–6 MWh class |
| Nominal power | ~2.5–3 MW class |
| Cooling | Liquid cooling |
| Protection | IP55 |
| Regional relevance | Bulgaria / Eastern Europe |

**Sources:** BYD MC Cube-T page, ContourGlobal Bulgaria project. See [S33], [S34].

---

### 6.5 CATL — TENER / EnerOne

**Relevance:** global benchmark, not necessarily confirmed for Greek assets.

Public product information indicates:

- CATL TENER: **6.25 MWh** system with claimed five-year zero degradation and safety features
- CATL EnerOne: LFP-based outdoor liquid-cooling system using 280Ah cells, up to **10,000 cycles**, and cell temperature difference controlled within about **3°C**

**Digital-twin defaults:**

| Parameter | CATL-style default |
|---|---|
| Chemistry | LFP |
| Block energy | 3–6.25 MWh depending product generation |
| Cycle life | Up to 10,000-cycle class in EnerOne materials |
| Cooling | Liquid cooling |
| Thermal uniformity | ~3°C cell temperature difference in EnerOne material |
| Strategic note | Benchmark for latest high-density utility BESS |

**Sources:** CATL TENER announcement, CATL EnerOne announcement. See [S35], [S36].

---

### 6.6 Pomega / Kontrolmatik — Turkey / regional LFP supply

**Relevance:** regional supplier/manufacturing benchmark for Turkey and broader Southeast Europe.

Public information indicates:

- Pomega operates Turkey’s first private-sector LFP cell gigafactory
- Kontrolmatik describes Pomega systems using prismatic LFP technology
- Public corporate material references annual production capacity around **3 GWh**, with expansion roadmap

**Digital-twin relevance:**

| Parameter | Pomega/Turkey relevance |
|---|---|
| Chemistry | LFP |
| Supply-chain role | Regional / Turkey-based LFP cell and ESS manufacturing |
| Use case | Hybrid renewables-plus-storage and grid storage |
| Product role | Cells, modules, ESS systems |

**Sources:** Pomega, Kontrolmatik, ONE/Pomega announcement. See [S37], [S38], [S39].

---

## 7. Neighboring and regional procurement benchmarks

### 7.1 Bulgaria

Bulgaria is a highly relevant neighboring benchmark.

Key public findings:

- Bulgaria’s RESTORE support scheme awarded grants for **82 standalone battery storage projects** totaling about **9.71 GWh**.
- ContourGlobal inaugurated a **202 MW / 500 MWh** standalone BESS at Maritsa East 3, one of the largest in Bulgaria and Eastern Europe.
- The ContourGlobal project has about **2.5h duration**.
- BYD appears relevant to the Maritsa East 3 project through BYD/ContourGlobal public materials and regional reporting.

**Digital-twin insight:** Bulgaria gives a regional template for large standalone BESS participating in energy markets, often around 2–2.5h duration.

**Sources:** Balkan Green Energy News, Energy-Storage News, ContourGlobal, Renewables Now. See [S40], [S34], [S41], [S42].

---

### 7.2 Romania

Romania is a strong regional benchmark for large storage rollout.

Key public findings:

- The European Commission approved a **€150 million** Romanian state-aid scheme to support at least **2,174 MWh** of new standalone storage.
- Sungrow and ENEVO announced a **1 GWh** BESS agreement in Romania using Sungrow PowerTitan 2.0 systems.

**Digital-twin insight:** Romania provides a strong benchmark for large, liquid-cooled, LFP-style, containerized BESS deployments in Southeast Europe, especially Sungrow-type architectures.

**Sources:** European Commission, Energy-Storage News. See [S43], [S32].

---

### 7.3 Italy

Italy is an important benchmark for business model and capacity-backed storage.

Key public findings:

- Terna’s first MACSE auction procured **10 GWh** of storage capacity in Southern Italy and the islands.
- Public reporting says awarded capacity is lithium-ion based, with contracts around **15 years**, and expected operation by 2028.
- METLEN announced a seven-year physical tolling agreement with Dolomiti Energia for a **25 MW / 75 MWh** BESS in Apulia, Italy.

**Digital-twin insight:** Italy is useful for tolling contracts, capacity-market design, revenue-floor modeling, and 3-hour BESS templates.

**Sources:** Terna, Reuters, METLEN, Renewables Now. See [S44], [S45], [S46], [S47].

---

### 7.4 Turkey

Turkey is less directly comparable to Greece’s DAM optimization problem, but useful for regional manufacturing and hybrid renewables-plus-storage templates.

Key public findings:

- Pomega/Kontrolmatik are relevant LFP supply-chain players.
- Turkey has wind-plus-storage and large-storage project development signals, including regional supplier activity.

**Digital-twin insight:** Turkey can be included as an expansion-market archetype for LFP cell sourcing, hybrid asset configurations, and regional supply-chain risk.

**Sources:** Pomega, Kontrolmatik, Energy-Storage News, Reuters. See [S37], [S38], [S48], [S49].

---

## 8. Recommended digital-twin architecture

The digital twin should not be one generic battery model. It should be a hierarchy.

### 8.1 Level 1 — universal battery physics and constraints

These apply to every BESS:

| Parameter | Why it matters |
|---|---|
| Rated AC power | Maximum market injection/withdrawal |
| Nameplate DC energy | Physical installed capacity |
| Warranted usable energy | Contractual usable capacity |
| Operational usable energy | What optimizer can actually use after buffers/derating |
| Charge efficiency | Cost of charging |
| Discharge efficiency | Delivered MWh to grid |
| AC-to-AC round-trip efficiency | Market economics |
| SoC min/max | Safety, degradation, warranty |
| C-rate | Power relative to energy capacity |
| Ramp rate | Balancing/ancillary suitability |
| Auxiliary load | Cooling, controls, standby losses |
| Availability | Outage and derating risk |
| Degradation | Economic cost of cycling and calendar aging |
| Thermal state | Safety, derating, degradation |
| Cycle count / throughput | Warranty and asset-life tracking |

---

### 8.2 Level 2 — manufacturer archetype

The archetype is inferred from public manufacturer/product data or customer input.

| Archetype | Typical characteristics |
|---|---|
| `Trina_Elementa_2` | LFP, 4–5 MWh class, liquid cooling, ΔT≤2.5°C target, Greek Amyntaio reference |
| `Jinko_SunTera_G2` | LFP, 5.01 MWh / 20 ft, liquid cooling, 94% RTE claim, 10,000-cycle claim |
| `Sungrow_PowerTitan_2` | 5 MWh + 2.5 MW AC Block, liquid cooling, AC-side RTE around 89.5%, broad regional relevance |
| `BYD_MC_Cube_T` | 5–6 MWh class, 2.5–3 MW class, liquid cooling, IP55, Bulgaria relevance |
| `CATL_TENER_EnerOne` | 6.25 MWh TENER benchmark; EnerOne LFP, 10,000-cycle class, liquid cooling |
| `Pomega_LFP` | Turkey/regional LFP supplier archetype |
| `Generic_Greece_2h_LFP_Liquid` | First-wave Greek auction default |
| `Generic_Greece_4h_LFP_Liquid` | Third-auction/former-coal-region default |

---

### 8.3 Level 3 — project-specific configuration

This is what the customer or project owner should provide.

```yaml
asset:
  name:
  owner:
  country:
  grid_node:
  commercial_operation_date:
  market_phase: test_mode_no_imbalance_penalty | commercial_operation_full_rules

power_energy:
  rated_power_mw_ac:
  contracted_usable_energy_mwh:
  nameplate_energy_mwh_dc:
  duration_hours:
  point_of_interconnection_import_limit_mw:
  point_of_interconnection_export_limit_mw:

technology:
  chemistry:
  manufacturer:
  product_platform:
  container_count:
  battery_cabinet_count:
  pcs_count:
  mv_skid_count:
  transformer_count:
  cooling_type:

operating_envelope:
  min_soc_pct:
  max_soc_pct:
  reserve_soc_pct:
  max_charge_power_mw:
  max_discharge_power_mw:
  ramp_rate_mw_per_min:
  operating_temperature_min_c:
  operating_temperature_max_c:
  thermal_derating_curve:

efficiency_losses:
  round_trip_efficiency_ac:
  charge_efficiency:
  discharge_efficiency:
  pcs_efficiency:
  transformer_efficiency:
  auxiliary_load_kw_active:
  auxiliary_load_kw_standby:

warranty_compliance:
  warranty_years:
  warranted_cycles:
  warranted_throughput_mwh:
  end_of_life_capacity_pct:
  availability_target_pct:
  full_cycle_performance_floor_pct:
  daily_aux_consumption_limit_pct_of_guaranteed_capacity:
  augmentation_plan:
```

---

### 8.4 Level 4 — live calibrated twin

Once telemetry exists, the twin should calibrate using:

| Telemetry | Calibration use |
|---|---|
| Actual SoC | Correct state and SoC model drift |
| AC import/export | Settlement alignment |
| DC voltage/current | Electrical behavior and efficiency inference |
| PCS status | Conversion losses and derating |
| Battery temperature | Thermal stress and derating |
| Rack/module temperature spread | Thermal uniformity and aging risk |
| BMS alarms | Availability/safety risk |
| Auxiliary consumption | Cooling/standby model |
| Throughput | Degradation/warranty usage |
| Availability events | Availability-budget tracking |

---

## 9. Digital-twin templates

### 9.1 Greece 2-hour auction BESS default

```yaml
template_name: Greece_2h_Auction_BESS_Default
source_basis:
  - Greece first storage auction pattern
  - PPC Melitis/Ptolemaida disclosures
  - RAEWW technical obligations
chemistry: LFP_assumed
cooling: liquid_cooled_assumed
rated_power_mw_ac: customer_provided
contracted_usable_energy_mwh: rated_power_mw_ac * 2
duration_hours: 2
max_c_rate: 0.5
round_trip_efficiency_range:
  conservative_system_ac: 0.85
  typical_system_ac: 0.89
  optimistic_vendor: 0.94
soc_min_default: 0.10
soc_max_default: 0.90
reserve_soc_default: 0.10
availability_target: 0.93
full_cycle_performance_floor: 0.80
auxiliary_consumption_limit_reference: daily_own_consumption_lte_15pct_guaranteed_capacity
second_life_allowed: false
balancing_services_required: true
digital_twin_confidence:
  headline_duration: high
  chemistry_cooling: medium
  supplier_specific_specs: low
```

---

### 9.2 Greece 4-hour coal-region BESS default

```yaml
template_name: Greece_4h_Coal_Region_BESS_Default
source_basis:
  - Greece third auction pattern
  - PPC Amyntaio project
  - RAEWW technical obligations
chemistry: LFP_assumed
cooling: liquid_cooled_assumed
rated_power_mw_ac: customer_provided
contracted_usable_energy_mwh: rated_power_mw_ac * 4
duration_hours: 4
max_c_rate: 0.25
round_trip_efficiency_range:
  conservative_system_ac: 0.85
  typical_system_ac: 0.89
  optimistic_vendor: 0.94
soc_min_default: 0.10
soc_max_default: 0.90
reserve_soc_default: 0.10
availability_target: 0.93
full_cycle_performance_floor: 0.80
auxiliary_consumption_limit_reference: daily_own_consumption_lte_15pct_guaranteed_capacity
balancing_services_required: true
digital_twin_confidence:
  headline_duration: high
  chemistry_cooling: medium
  supplier_specific_specs: low
```

---

### 9.3 METLEN-Karatzis Thessaly 330 MW / 790 MWh

```yaml
template_name: METLEN_Karatzis_Thessaly_330MW_790MWh
source_basis:
  - METLEN press release
  - Karatzis press release
  - regional METLEN/PPC and METLEN/Jinko context
rated_power_mw_ac: 330
reported_energy_mwh: 790
duration_hours: 2.3939
chemistry: LFP_assumed_not_verified
cooling: liquid_cooled_assumed_not_verified
supplier: unknown_publicly
owner_structure:
  metlen: 0.49
  karatzis: 0.51
operator: METLEN_M_Renewables
expected_completion: Q2_2026
investment_eur: 170_000_000
grant_dependency: no_additional_grants_or_tax_relief_reported
candidate_archetypes:
  - Generic_Greece_2h_LFP_Liquid
  - Jinko_SunTera_G2
  - Trina_Elementa_2
  - Sungrow_PowerTitan_2
round_trip_efficiency_range:
  conservative_system_ac: 0.85
  typical_system_ac: 0.89
  optimistic_vendor: 0.94
gross_nameplate_energy_mwh:
  default_unknown: true
  suggested_range_if_reported_790_is_usable: 900_to_970
capacity_stack_confidence:
  reported_power_energy: high
  supplier_specific_configuration: low
  nameplate_energy: low
  internal_losses: low
```

Note: the 900–970 MWh gross-nameplate range is an inference, not a fact. It is inspired by the PPC Amyntaio ratio where about 244 MWh nameplate supports 200 MWh contracted capacity.

---

### 9.4 PPC Amyntaio / Trina Elementa 2 reference twin

```yaml
template_name: PPC_Amyntaio_Trina_Elementa2
source_basis:
  - PPC Group Amyntaio announcement
  - Trina Storage Amyntaio announcement
rated_power_mw_ac: 50
contracted_usable_energy_mwh: 200
nameplate_energy_mwh: 244
duration_hours_contracted: 4
supplier: Trina_Storage
platform: Elementa_2
battery_cabinets: 60
pcs_mv_skids: 8
chemistry: LFP
cooling: liquid_cooled
service_agreement_years: 10
includes:
  - dc_battery_cabinets
  - pcs
  - mv_skids
  - power_plant_controller
  - remote_monitoring
  - spare_parts_management
  - performance_guarantees
  - availability_guarantees
usable_to_nameplate_ratio: 0.8197
digital_twin_confidence:
  headline_power_energy: high
  supplier: high
  nameplate_energy: high
  cabinet_skid_counts: high
```

This should be the platform’s **known-spec reference twin**.

---

### 9.5 PPC Melitis / Ptolemaida 2h LFP examples

```yaml
template_name: PPC_Melitis_1_48MW_96MWh
rated_power_mw_ac: 48
reported_energy_mwh: 96
duration_hours: 2
chemistry: LFP
cooling: liquid_cooled
supplier: unknown_publicly
confidence:
  headline_power_energy: high
  chemistry_cooling: high
  supplier_specific_specs: low
```

```yaml
template_name: PPC_Ptolemaida_4_50MW_100MWh
rated_power_mw_ac: 50
reported_energy_mwh: 100
duration_hours: 2
chemistry: LFP
cooling: liquid_cooled
supplier: unknown_publicly
confidence:
  headline_power_energy: high
  chemistry_cooling: high
  supplier_specific_specs: low
```

---

## 10. Pitfalls and important metrics most teams may miss

### 10.1 Headline MWh is not the same as usable MWh

A project described as 200 MWh may have more nameplate energy installed. PPC Amyntaio is the clearest case: about 244 MWh nameplate for 200 MWh contracted capacity.

**Metric to build:** `Nameplate-to-Usable Gap`

```text
nameplate_to_usable_gap = 1 - contracted_usable_mwh / nameplate_mwh_dc
```

**Dashboard card:**

```text
Capacity Stack
244 MWh DC nameplate
→ 200 MWh contracted usable
→ 160 MWh operational window at 10–90% SoC
→ ~142–150 MWh AC market-dispatchable after losses
```

---

### 10.2 AC-side and DC-side ratings differ

Markets settle AC energy at the grid point. Batteries store DC energy. Losses occur across cells, racks, DC cabling, PCS/inverter, transformers, auxiliary load, HVAC/cooling, and standby operation.

**Metric to build:** `AC/DC Loss Ledger`

```text
grid_import_mwh
→ stored_dc_mwh
→ discharged_dc_mwh
→ grid_export_mwh
```

---

### 10.3 Round-trip efficiency is not one universal number

Vendor claims vary by measurement boundary. Some claims refer to cell/block efficiency; others refer to AC-to-AC system RTE. The optimizer should use AC-to-AC economics, while the digital twin can track sub-component losses.

**Metric to build:** `Effective RTE Today`

```text
effective_rte_today = grid_export_mwh / grid_import_mwh
```

It should vary with:

- charge/discharge power level,
- ambient temperature,
- auxiliary load,
- SoC,
- PCS efficiency,
- transformer efficiency,
- derating events.

---

### 10.4 Auxiliary consumption and cooling load matter

Greek support-scheme material references daily own-consumption limits. In Greece, summer cooling load can be economically meaningful.

**Metric to build:** `Auxiliary Load Share`

```text
aux_load_share = daily_auxiliary_mwh / guaranteed_capacity_mwh
```

**Constraint option:**

```text
daily_auxiliary_mwh <= 0.15 * guaranteed_capacity_mwh
```

Use this as a compliance metric or soft alert, not necessarily a hard optimizer constraint unless the specific support contract applies.

---

### 10.5 Thermal behavior matters even for LFP

LFP is generally favorable for stationary storage, but high-density 5 MWh-class containers still require careful thermal management and fire-risk controls. Manufacturer materials emphasize liquid cooling, thermal uniformity, gas/smoke/heat detection, fire suppression, IP ratings, and corrosion resistance.

**Metrics to build:**

- `Thermal Stress Index`
- `Thermal Uniformity Score`
- `High-SoC Heat Exposure Hours`
- `Emergency Derating Flag`

Example:

```text
thermal_stress_index = weighted_sum(
  ambient_temperature_excess,
  battery_temperature_excess,
  high_soc_hours,
  high_c_rate_hours,
  rack_temperature_spread
)
```

---

### 10.6 Calendar aging happens while idle

Scheduling models often penalize cycling but ignore calendar aging. A better degradation proxy includes:

```text
daily_degradation_cost =
  throughput_degradation_cost
+ high_soc_calendar_penalty
+ high_temperature_penalty
+ high_c_rate_penalty
+ depth_of_discharge_penalty
```

**Metric to build:** `Degradation Budget Remaining`

---

### 10.7 LFP SoC estimation can be uncertain

LFP batteries can have SoC-estimation challenges due to their flatter voltage curve. Public research on optimal battery bidding under decision-dependent SoC uncertainty argues that neglecting SoC uncertainty can lead to delivery failures in market participation.

**Metric to build:** `SoC Reconciliation Error`

```text
soc_reconciliation_error = actual_bms_soc - predicted_twin_soc
```

When real telemetry is unavailable, simulate SoC uncertainty in stress tests.

---

### 10.8 Availability and warranty are business constraints

Availability and warranty obligations are not engineering footnotes. They directly affect revenue and compliance.

**Metrics to build:**

- `Availability Budget`
- `Warranty Compliance Score`
- `Throughput-to-Warranty Ratio`
- `Equivalent Full Cycles Used`
- `LTSA Breach Risk`

Example:

```text
throughput_to_warranty_ratio = cumulative_throughput_mwh / warranted_throughput_mwh
```

---

### 10.9 Balancing-service readiness matters

Greek-supported batteries may need to participate as independent balancing-services entities. Even if the hackathon demo focuses on DAM scheduling, the twin should preserve headroom/footroom logic.

**Metric to build:** `Balancing Readiness Score`

Relevant state variables:

- upward reserve headroom,
- downward reserve footroom,
- ramp capability,
- SoC reserve,
- telemetry availability,
- power availability,
- current derating.

---

## 11. How to use this knowledge in the hackathon project

### 11.1 Use the digital twin as the main product differentiator

The product should show two asset modes:

1. **Known-spec asset:** PPC Amyntaio / Trina reference twin.
   - Demonstrates how the platform behaves when supplier specs are known.
   - Shows nameplate vs contracted capacity.
   - Shows cabinet/skid counts and high-confidence parameters.

2. **Scarce-spec asset:** METLEN-Karatzis Thessaly twin.
   - Demonstrates how the platform behaves when only MW/MWh and ownership/operator information are public.
   - Uses candidate manufacturer archetypes.
   - Shows parameter confidence and uncertainty ranges.

This creates a strong demo storyline:

> “Here is how the platform works when we know the supplier. Here is how it still produces feasible schedules when we only know headline specs.”

---

### 11.2 Use templates as optimizer constraints

The optimizer should ingest an `AssetTwin` object. The `AssetTwin` turns templates and customer data into constraints.

#### Decision variables per 15-minute interval

Let `t` be each 15-minute MTU, with `Δt = 0.25` hours.

```text
charge_power_t_mw
 discharge_power_t_mw
energy_state_t_mwh
charge_mode_t ∈ {0,1}
discharge_mode_t ∈ {0,1}
```

#### Core objective

```text
maximize Σ_t [price_t * discharge_power_t * Δt
            - price_t * charge_power_t * Δt
            - degradation_cost_t
            - auxiliary_cost_t
            - forecast_risk_penalty_t]
```

#### SoC / energy dynamics

```text
E_{t+1} = E_t
        + η_charge * P_charge_t * Δt
        - (P_discharge_t * Δt) / η_discharge
        - P_aux_t * Δt
```

Where:

```text
η_charge * η_discharge ≈ AC-to-AC RTE
```

If only RTE is known:

```text
η_charge = η_discharge = sqrt(RTE)
```

#### Usable energy constraint

```text
E_min <= E_t <= E_max
```

Where:

```text
E_min = operational_usable_energy_mwh * soc_min
E_max = operational_usable_energy_mwh * soc_max
```

The key is that `operational_usable_energy_mwh` should not automatically equal headline MWh.

A better formulation:

```text
contracted_usable_mwh = customer_or_public_value
nameplate_mwh_dc = known_or_estimated
soh_factor = current_state_of_health_pct
soc_window = soc_max - soc_min
thermal_derating_factor_t = f(ambient_temp, battery_temp, cooling_status)

operational_usable_energy_t = min(
  contracted_usable_mwh,
  nameplate_mwh_dc * soh_factor * soc_window * thermal_derating_factor_t
)
```

#### Power constraints

```text
0 <= P_charge_t <= max_charge_power_mw * availability_t * power_derating_t
0 <= P_discharge_t <= max_discharge_power_mw * availability_t * power_derating_t
```

#### No simultaneous charge/discharge

MILP version:

```text
P_charge_t <= M * charge_mode_t
P_discharge_t <= M * discharge_mode_t
charge_mode_t + discharge_mode_t <= 1
```

LP/heuristic version:

```text
penalize simultaneous charge/discharge heavily
or post-process schedule to remove simultaneous operation
```

#### C-rate constraint

```text
P_discharge_t <= max_c_rate * operational_usable_energy_t
P_charge_t <= max_c_rate * operational_usable_energy_t
```

For templates:

```text
2h BESS -> max_c_rate ≈ 0.5
4h BESS -> max_c_rate ≈ 0.25
```

#### Ramp constraint

```text
|P_discharge_t - P_discharge_{t-1}| <= ramp_rate_mw_per_min * 15
|P_charge_t - P_charge_{t-1}| <= ramp_rate_mw_per_min * 15
```

#### Daily auxiliary consumption compliance

If applicable:

```text
Σ_t P_aux_t * Δt <= 0.15 * guaranteed_capacity_mwh
```

If uncertain, treat as a dashboard warning rather than hard constraint.

#### Availability metric

For the hackathon, model availability as a scenario or derating flag:

```text
availability_t ∈ {0, 0.5, 1.0}
```

Dashboard metric:

```text
availability_budget_used = unavailable_hours / allowed_unavailable_hours
```

#### Balancing reserve constraints

If reserve mode is enabled:

```text
E_t - E_min >= reserve_up_mw * reserve_duration_h / η_discharge
E_max - E_t >= reserve_down_mw * reserve_duration_h * η_charge
```

This prevents the DAM optimizer from emptying/filling the battery in a way that destroys balancing-service readiness.

#### Terminal SoC constraint

To prevent one-day horizon gaming:

```text
E_final >= E_initial - tolerance
```

or:

```text
E_final = E_initial
```

for conservative mode.

---

### 11.3 Use templates as inputs for synthetic data generation

Because real Greek battery telemetry is scarce, the platform can synthesize plausible telemetry and operating histories from templates.

#### Synthetic battery spec generation

If only `P` and `E` are known:

```python
# pseudocode
if supplier_unknown:
    archetype = infer_archetype(owner, country, duration, year, public_relationships)

rte_ac = sample_from_range(archetype.rte_range)
soc_min = archetype.soc_min_default
soc_max = archetype.soc_max_default
nameplate_mwh = estimate_nameplate(contracted_mwh, archetype.usable_to_nameplate_ratio_range)
aux_load = sample_aux_model(archetype, ambient_temperature)
thermal_derating_curve = default_or_sample(archetype)
warranty = default_warranty_proxy(archetype)
```

#### Useful synthetic distributions

| Parameter | Suggested distribution / source logic |
|---|---|
| AC RTE | Sample 0.85–0.94 depending archetype; keep vendor claims separate from system AC RTE |
| SoC min/max | Default 10–90%; scenario 5–95% aggressive, 15–85% conservative |
| Nameplate-to-usable ratio | Use 0.80–0.90 range; PPC Amyntaio reference ≈0.82 |
| Auxiliary load | Base standby + active cooling penalty based on ambient temperature |
| Derating | Trigger at high ambient/battery temp; scenario-based if no telemetry |
| Degradation | Throughput + high SoC + temperature + C-rate proxy |
| Availability | Bernoulli or scheduled derating scenarios; track 93% target where applicable |

#### Synthetic telemetry scenarios

Use real market/weather signals plus synthetic battery behavior:

| Scenario | Purpose |
|---|---|
| Normal day | Baseline scheduling and SoC behavior |
| Solar surplus day | Curtailment/green charging narrative |
| Evening scarcity day | Discharge opportunity and reserve trade-off |
| Heatwave day | Cooling load and thermal derating |
| High-volatility geopolitical/fuel-shock day | Scenario planning and price-risk stress test |
| BMS alarm day | Availability and operator-review workflow |
| SoC drift day | Digital twin reconciliation / uncertainty demo |
| Rack imbalance day | Thermal uniformity and derating demo |

This gives the dashboard depth without pretending to have real telemetry.

---

### 11.4 Use templates to create product metrics

The digital twin should produce metrics that make the dashboard feel more original than a price forecast.

| Metric | Input source | Why it matters |
|---|---|---|
| **Capacity Stack** | Asset template + supplier/customer specs | Separates nameplate, contracted, operational, market-dispatchable capacity |
| **Usable Capacity Confidence** | Parameter confidence levels | Makes data scarcity explicit |
| **Nameplate-to-Usable Gap** | Nameplate and contracted capacity | Prevents over-optimistic scheduling |
| **Effective RTE Today** | Efficiency model + weather/aux load | Computes economics under current conditions |
| **AC/DC Loss Ledger** | Efficiency model | Shows losses from grid import to grid export |
| **Auxiliary Load Share** | Aux model + schedule | Tracks cooling/standby consumption |
| **Thermal Stress Index** | Weather + thermal model | Flags temperature-driven degradation/safety risk |
| **Thermal Uniformity Score** | Telemetry or synthetic rack temps | Captures uneven aging risk |
| **Equivalent Full Cycles** | Throughput / usable capacity | Battery life and warranty proxy |
| **Degradation Budget Remaining** | Cycle/calendar degradation model | Converts operation into asset-life impact |
| **Warranty Compliance Score** | Warranty template | Operator/business confidence |
| **Availability Budget** | Availability target + outage/derating | Tracks compliance with 93%/contract target |
| **Balancing Readiness Score** | SoC, ramp, reserve headroom | Shows ability to support balancing services |
| **Archetype Similarity Score** | Public specs + candidate templates | Explains why the twin chose a template |
| **SoC Reconciliation Error** | Predicted vs actual SoC | Calibrates twin when telemetry arrives |

---

### 11.5 Use templates inside the dashboard UX

The dashboard should not just show charts. It should answer operator questions.

#### Screen 1 — Twin Builder

Inputs:

- project name,
- country,
- power MW,
- energy MWh,
- supplier known/unknown,
- chemistry,
- cooling,
- commercial operation date,
- support scheme / warranty constraints,
- known nameplate vs contracted capacity.

Outputs:

- selected archetype,
- parameter confidence table,
- missing critical specs,
- recommended customer questions.

Example UI card:

```text
METLEN-Karatzis Thessaly Twin
Known: 330 MW / 790 MWh, Q2 2026, METLEN operator
Unknown: supplier, nameplate DC energy, PCS count, warranty throughput
Inferred: LFP liquid-cooled, 2.39h duration, AC RTE range 85–94%
Candidate archetypes: Generic Greece 2h LFP, Jinko SunTera, Trina Elementa 2, Sungrow PowerTitan 2
Twin confidence: 62%
```

---

#### Screen 2 — Capacity Stack

Show a layered funnel:

```text
Gross installed / nameplate capacity
→ Contracted usable capacity
→ Operational SoC window
→ Thermal/availability derated capacity
→ AC market-dispatchable capacity
```

This is a high-wow feature because it teaches the judge something important.

---

#### Screen 3 — Tomorrow’s Battery Plan

Show the 96 intervals for the next-day DAM schedule:

- charge / discharge / idle blocks,
- price forecast,
- SoC path,
- confidence,
- thermal/auxiliary warnings,
- degradation impact,
- reserve readiness.

The action timeline should be driven by the digital twin constraints.

---

#### Screen 4 — Action Explanation Cards

For each charge/discharge window:

```text
Recommended action: Charge 11:15–14:00
Why: low DAM price, high RES/solar surplus, low residual load, SoC headroom
Twin constraints: within 10–90% SoC, no thermal derating, spread covers RTE/degradation
Confidence: high
```

```text
Recommended action: Partial discharge 18:30–20:45
Why: evening scarcity and high price spread
Caution: medium forecast confidence, reserve headroom required, thermal stress elevated
```

---

#### Screen 5 — Scenario / Business Planning Mode

Allow the user to change:

- battery duration: 2h / 2.39h / 3h / 4h,
- RTE assumption,
- SoC limits,
- degradation cost,
- reserve SoC,
- heatwave scenario,
- gas/carbon price shock,
- conservative/balanced/aggressive risk mode,
- supplier archetype.

Show how the schedule and business metrics change.

This turns the product from “schedule generator” into “planning cockpit.”

---

### 11.6 Use templates in the Model Lab

The Model Lab should not only compare price forecasters. It should compare decision pipelines.

Example model configuration:

```yaml
model_run:
  asset_twin: METLEN_Karatzis_Thessaly_330MW_790MWh
  archetype: Generic_Greece_2h_LFP_Liquid
  price_forecast_model: xgboost
  uncertainty_model: quantile_regression
  optimizer: degradation_aware_milp
  risk_mode: balanced
  rte_assumption: typical_system_ac
  soc_window: 10_to_90
  reserve_mode: enabled
```

Evaluate models by battery-relevant metrics:

| Evaluation metric | Why better than raw RMSE |
|---|---|
| Feasibility violations | Judges can understand constraint safety |
| Opportunity capture | Did the model identify useful charge/discharge windows? |
| Degradation-adjusted value | Avoids blind cycling |
| Schedule confidence | Shows uncertainty awareness |
| Capacity-stack validity | Avoids overusing headline MWh |
| Reserve-readiness loss | Measures operational side effects |
| Twin sensitivity | Shows robustness to missing specs |

The pitch should say:

> “We compare models by operational decision quality, not just forecast error.”

---

## 12. Hackathon MVP plan

### 12.1 What to build immediately

Build these modules first:

```text
battery-intelligence-os/
  data/
    archetypes/
      generic_greece_2h_lfp.yaml
      generic_greece_4h_lfp.yaml
      metlen_karatzis_thessaly.yaml
      ppc_amyntaio_trina.yaml
      trina_elementa_2.yaml
      jinko_suntera_g2.yaml
      sungrow_powertitan_2.yaml
      byd_mc_cube_t.yaml
      catl_tener_enerone.yaml
      pomega_lfp.yaml

  src/
    digital_twin/
      asset_config.py
      archetype_loader.py
      battery_state.py
      capacity_stack.py
      efficiency.py
      degradation.py
      thermal.py
      availability.py
      warranty.py
      twin_confidence.py
      synthetic_telemetry.py

    optimization/
      day_ahead_scheduler.py
      constraints.py
      degradation_aware_objective.py
      risk_modes.py

    metrics/
      capacity_stack_metrics.py
      effective_rte.py
      ac_dc_loss_ledger.py
      thermal_stress_index.py
      warranty_compliance.py
      balancing_readiness.py
      soc_reconciliation.py

    app/
      dashboard.py
      pages/
        twin_builder.py
        market_intelligence.py
        battery_plan.py
        model_lab.py
        scenarios.py
```

---

### 12.2 Minimum viable demo assets

Use two demo assets:

#### Asset A — Scarce-spec demo

```yaml
name: METLEN-Karatzis Thessaly
power: 330 MW
energy: 790 MWh
supplier: unknown
archetype: Generic Greece 2h LFP + candidate archetypes
purpose: show data-scarcity resilience
```

#### Asset B — Known-spec reference

```yaml
name: PPC Amyntaio / Trina Elementa 2
power: 50 MW
contracted_energy: 200 MWh
nameplate_energy: 244 MWh
battery_cabinets: 60
pcs_mv_skids: 8
supplier: Trina Storage
purpose: show high-confidence twin and capacity-stack concept
```

---

### 12.3 Minimum viable optimizer

Do not overbuild the optimizer. A basic LP/MILP or even a carefully written heuristic can work if it respects constraints and powers the dashboard.

MVP optimizer features:

- 96-interval schedule for 15-minute DAM resolution,
- charge/discharge/idle output,
- SoC trajectory,
- efficiency losses,
- degradation cost proxy,
- no simultaneous charge/discharge,
- SoC min/max,
- power limits,
- terminal SoC rule,
- reserve SoC option,
- risk mode selector.

Risk modes:

| Mode | Behavior |
|---|---|
| Conservative | Wider SoC buffer, higher degradation penalty, requires high confidence spread |
| Balanced | Default operation |
| Aggressive | Wider operating window, lower risk penalty, captures more marginal spreads |

---

### 12.4 Minimum viable synthetic telemetry

Generate synthetic telemetry for the demo:

```text
timestamp
asset_id
soc_predicted
soc_actual_simulated
power_ac_mw
energy_ac_mwh
battery_temp_c
ambient_temp_c
aux_load_mw
availability_flag
derating_factor
thermal_stress_index
bms_alarm_flag
```

Use this to show:

- SoC reconciliation,
- thermal derating,
- availability warnings,
- dashboard monitoring.

---

### 12.5 Minimum viable dashboard wow moments

The strongest demo sequence:

1. **Open with METLEN-Karatzis scarce-spec twin.**  
   “We only know 330 MW / 790 MWh publicly. The platform chooses archetypes and shows confidence.”

2. **Show Capacity Stack.**  
   “Headline MWh is not enough. We model nameplate, contracted, operational, and AC-dispatchable capacity.”

3. **Generate tomorrow’s schedule.**  
   “The schedule respects SoC, power, efficiency, degradation, reserve, and confidence constraints.”

4. **Switch to PPC Amyntaio known-spec twin.**  
   “When supplier information is known, the twin becomes more precise: 60 cabinets, 8 PCS/MV skids, 244 MWh nameplate for 200 MWh contracted.”

5. **Toggle heatwave or aggressive mode.**  
   Show thermal derating / auxiliary load / degradation budget change.

This is much more memorable than a notebook forecast.

---

## 13. How digital-twin knowledge becomes model inputs

### 13.1 Inputs to forecasting

The battery specs do not directly predict DAM prices, but they do affect **opportunity value**.

Use digital-twin outputs as features for opportunity scoring:

| Feature | Use |
|---|---|
| effective_rte_today | Minimum profitable spread threshold |
| available_energy_mwh | How much opportunity the asset can capture |
| thermal_derating_factor | Reduces dispatch value on hot days |
| reserve_requirement | Reduces available arbitrage capacity |
| degradation_cost_per_mwh | Raises threshold for cycling |
| auxiliary_load_estimate | Adjusts net value |
| risk_mode | Determines spread confidence required |

Example:

```text
minimum_profitable_spread_t =
  price_charge_t * (1 / effective_rte_t - 1)
+ degradation_cost_per_mwh
+ auxiliary_cost_per_mwh
+ risk_premium_t
```

---

### 13.2 Inputs to optimization

The digital twin provides hard and soft constraints.

Hard constraints:

- power limit,
- usable energy limit,
- SoC min/max,
- C-rate,
- no simultaneous charge/discharge,
- terminal SoC,
- interconnection limit.

Soft constraints / penalties:

- degradation,
- high SoC in heat,
- high C-rate,
- forecast risk,
- reduced balancing readiness,
- approaching warranty budget.

Compliance metrics:

- availability target,
- own-consumption limit,
- performance floor,
- fixed injection/duration obligations.

---

### 13.3 Inputs to data synthesis

Templates create synthetic data where real telemetry is unavailable.

Synthetic data can support:

- dashboard demo,
- anomaly detection demo,
- schedule stress testing,
- model-lab comparison,
- training a classifier for “safe / risky schedule,”
- calibrating plausible parameter ranges.

Example synthetic parameter sampling:

```python
asset = load_template("metlen_karatzis_thessaly.yaml")

rte = sample_uniform(0.85, 0.94)
soc_min, soc_max = sample_choice([(0.10, 0.90), (0.15, 0.85), (0.05, 0.95)])
nameplate_ratio = sample_uniform(0.80, 0.90)
nameplate_mwh = asset.reported_energy_mwh / nameplate_ratio
aux_base_mw = sample_fraction(asset.rated_power_mw_ac, 0.001, 0.005)
thermal_sensitivity = sample_uniform(0.0, 0.02)
```

---

### 13.4 Inputs to business planning

The templates also support executive planning:

- What happens if the same project is 2h vs 4h?
- How does RTE affect arbitrage value?
- How does a wider SoC window increase revenue but consume warranty/degradation budget?
- How much nameplate overbuild might be needed to deliver a contracted capacity over time?
- What happens to expected dispatch under heatwave conditions?
- What if imbalance penalties begin after test mode?
- Does a merchant, tolling, or capacity-backed business model change operating strategy?

This is exactly where the product can differentiate from simple forecast dashboards.

---

## 14. Recommended pitch framing

Use this narrative:

> “The hard part is not just forecasting Greek DAM prices. The hard part is making a battery dispatchable when the operator does not yet have years of battery telemetry and may not even have final supplier details in the data room. Our Battery Intelligence OS builds a living digital twin from public project data, manufacturer archetypes, tender obligations, and customer-provided specs. It then turns market, system, weather, and asset signals into explainable charge/discharge/idle actions.”

Key line:

> **“We do not assume the battery is a magic 200 MWh box. We model the stack from nameplate DC capacity to contracted usable capacity to operational AC-dispatchable capacity.”**

This is likely to land well because it is both technically credible and visually demonstrable.

---

## 15. Source ledger

### Hackathon and Greek market context

- **[S0] Hackathon organizer brief** — `Hackathon_final.docx.pdf`, uploaded by user.
- **[S1] Renewables Now — Greece’s first batteries enter day-ahead market in test mode**  
  https://renewablesnow.com/news/greeces-first-batteries-enter-day-ahead-market-in-test-mode-report-1292437/
- **[S2] Balkan Green Energy News — First battery energy storage systems enter Greek electricity market**  
  https://balkangreenenergynews.com/first-battery-energy-storage-systems-enter-greek-electricity-market/
- **[S3] RAEWW / ERRA presentation — The Electricity Storage support scheme in Greece**  
  https://erranet.org/annual-conference/wp-content/uploads/2023/10/G.Loizos_RAEWW_ERRAConference2023.pdf
- **[S4] Energy-Storage News — Greece awards 411MW of BESS across 12 projects**  
  https://www.energy-storage.news/greece-awards-411mw-of-bess-across-12-winning-projects-in-first-tender/
- **[S5] Balkan Green Energy News — Greece selects 12 projects in first battery auction**  
  https://balkangreenenergynews.com/greece-selects-12-projects-in-first-battery-auction-while-ppc-boosts-its-pumped-hydropower-portfolio/
- **[S6] Renewables Now — Greece confirms 412 MW of awards in maiden battery tender**  
  https://renewablesnow.com/news/update-greece-confirms-412-mw-of-awards-in-maiden-battery-tender-831360/
- **[S7] Balkan Green Energy News — Greece awards 188.9 MW in third auction**  
  https://balkangreenenergynews.com/greece-awards-188-9-mw-for-subsidized-battery-storage-in-final-auction/
- **[S8] PV Magazine — Greece awards 189 MW of battery storage in third auction**  
  https://www.pv-magazine.com/2025/03/24/greece-awards-189-mw-of-battery-storage-in-third-auction/
- **[S9] Renewables Now — Greece awards 189 MW in third battery storage auction**  
  https://renewablesnow.com/news/greece-awards-189-mw-in-third-battery-storage-auction-1272699/

### METLEN, PPC, and Greek project-specific sources

- **[S10] METLEN — Strategic agreement between METLEN and Karatzis Group for Greece’s largest standalone storage unit**  
  https://www.metlen.com/news/press-releases/strategic-agreement-between-metlen-and-karatzis-group-for-the-largest-standalone-energy-storage-unit-in-greece/
- **[S11] Karatzis Group — Strategic agreement between Karatzis Group and METLEN**  
  https://www.karatzisgroup.gr/strategic-agreement-between-karatzis-group-and-metlen/
- **[S12] Balkan Green Energy News — Karatzis, Metlen to install Greece’s largest battery**  
  https://balkangreenenergynews.com/karatzis-metlen-to-install-greeces-largest-battery-in-joint-venture/
- **[S13] Naftemporiki — Strategic agreement between METLEN and Karatzis Group**  
  https://www.naftemporiki.gr/english/2017945/strategic-agreement-between-metlen-and-karatzis-group-for-the-largest-standalone-energy-storage-unit-in-greece/
- **[S14] JinkoSolar — Jinko ESS and METLEN sign 3GWh+ strategic BESS partnership**  
  https://www.jinkosolar.com/en/site/newsdetail/2641
- **[S15] METLEN — PPC Group and METLEN develop up to 1,500MW / 3,000MWh storage across Romania, Bulgaria and Italy**  
  https://www.metlen.com/news/press-releases/ppc-group-and-metlen-energy-metals-join-forces-to-develop-up-to-1-500mw-of-energy-storage-projects-across-three-countries/
- **[S16] Renewables Now — PPC, Metlen team up on 1.5 GW of storage**  
  https://renewablesnow.com/news/ppc-metlen-team-up-on-1-5-gw-of-storage-in-romania-bulgaria-italy-1290822/
- **[S17] PPC Group — Two new BESS stations in Northern Greece**  
  https://www.ppcgroup.com/en/investor-relations/announcements/stock-news/stock-news-2025/commencement-of-construction-of-two-new-energy-storage-stations-bess-in-northern-greece/
- **[S18] Naftemporiki — PPC two new BESS under construction in Western Macedonia**  
  https://www.naftemporiki.gr/english/1958358/ppc-two-new-battery-energy-storage-stations-bess-under-construction-in-western-macedonia/
- **[S19] PPC Group — Rapid progress in energy storage projects**  
  https://www.ppcgroup.com/en/investor-relations/announcements/stock-news/stock-news-2026/ppc-group-completes-construction-of-213-gw-photovoltaic-projects-in-northern-greece-rapid-progress-in-energy-storage-projects/
- **[S20] PPC Group — Amyntaio BESS 50 MW / 200 MWh**  
  https://www.ppcgroup.com/en/investor-relations/announcements/stock-news/stock-news-2025/ppc-group-commencement-of-construction-of-a-new-battery-energy-storage-system-bess-in-amyntaio/
- **[S21] Trina Storage — Deal for one of Greece’s largest BESS projects**  
  https://www.trinasolar.com/eu/resources/newsroom/eutrina-storage-signs-deal-one-greeceE28099s-largest-battery-energy-storage-projects/
- **[S22] Energy-Storage News — PPC awards Trina Storage 200MWh BESS project**  
  https://www.energy-storage.news/greece-ppc-awards-trina-storage-with-200mwh-western-macedonia-bess-project-contract/
- **[S23] PV Europe — Trina Storage enters Greek market with 200 MWh project**  
  https://www.pveurope.eu/solar-storage/trina-storage-enters-greek-market-200-mwh-project

### Manufacturer archetypes

- **[S24] Trina Storage Elementa 2 PDF**  
  https://www.trinasolar.com/sites/default/files/storage-elementa2_0.pdf
- **[S25] Trina Storage Elementa 2 Pro product page**  
  https://www.trinasolar.com/sites/en-glb/storage/elementa2-pro.html
- **[S26] JinkoSolar ESS page**  
  https://www.jinkosolar.com/en/site/ess
- **[S27] Jinko ESS SunTera datasheet**  
  https://jinkosolar.eu/wp-content/uploads/2025/05/250429-Jinko-ESS-Suntera-5MWh-Datasheets-Print.pdf
- **[S28] Jinko ESS SunTera 5MWh fire-test / product announcement**  
  https://www.jinkosolar.com/en/site/newsdetail/2866
- **[S29] Sungrow utility energy storage product page**  
  https://www.sungrowpower.com/en/products/utility-energy-storage-system
- **[S30] Sungrow — PowerTitan 2.0 release with 89.5% RTE claim**  
  https://en.sungrowpower.com/newsDetail/3982/sungrow-releases-its-liquid-cooled-energy-storage-system-powertitan-2-0
- **[S31] Sungrow — AC Block / 5 MWh + 2.5 MW container information**  
  https://www.sungrowpower.com/en/newsdetail/sungrow-liquid-cooled-ess-powertitan-2-0-is-set-to-unleash-the-ac-block-era
- **[S32] Energy-Storage News — Sungrow 1GWh BESS supply deal with ENEVO in Romania**  
  https://www.energy-storage.news/sungrow-bags-1gwh-bess-supply-deal-with-enevo-group-in-romania/
- **[S33] BYD Energy — MC Cube-T BESS**  
  https://www.bydenergy.com/en/productDetails/Utility-Scale/MC_Cube-T_BESS
- **[S34] ContourGlobal — 202 MW / 500 MWh BESS in Bulgaria**  
  https://www.contourglobal.com/news/contourglobal-inaugurates-500-mwh-bess-project-in-bulgaria-one-of-the-largest-in-eastern-europe-and-among-the-first-stand-alone-facilities-in-the-country/
- **[S35] CATL — TENER 6.25 MWh, five-year zero degradation claim**  
  https://www.catl.com/en/news/6232.html
- **[S36] CATL — EnerOne LFP, 280Ah, liquid cooling, 10,000 cycles**  
  https://www.catl.com/en/news/935.html
- **[S37] Pomega**  
  https://www.pomega.com/
- **[S38] Kontrolmatik — Energy storage / Pomega systems**  
  https://www.kontrolmatik.com/energy-storage/
- **[S39] ONE + Pomega battery cell manufacturing agreement**  
  https://one.ai/one-partners-with-pomega-for-battery-cell-manufacturing-in-turkiye-to-strengthen

### Neighboring/regional benchmarks

- **[S40] Balkan Green Energy News — Bulgaria grants EUR 587m to 82 battery projects totaling 9.71 GWh**  
  https://balkangreenenergynews.com/bulgaria-grants-eur-587-million-to-82-battery-storage-projects/
- **[S41] Energy-Storage News — Bulgaria commissions 500 MWh BESS at thermal power plant site**  
  https://www.ess-news.com/2026/01/09/bulgaria-commissions-500-mwh-bess-at-thermal-power-plant-site/
- **[S42] Renewables Now — ContourGlobal cuts ribbon on 202-MW battery at Bulgarian thermal site**  
  https://renewablesnow.com/news/contourglobal-cuts-ribbon-on-202-mw-battery-at-bulgarian-thermal-site-1287684/
- **[S43] European Commission — €150m Romanian state aid scheme for storage**  
  https://ec.europa.eu/commission/presscorner/detail/en/ip_26_524
- **[S44] Terna — First MACSE auction completed, 10 GWh procured**  
  https://download.terna.it/terna/Terna_completed_first_MACSE_auction_8de00ea13c11e89.pdf
- **[S45] Reuters — Italy awards all battery storage in first auction**  
  https://www.reuters.com/sustainability/boards-policy-regulation/italy-awards-all-battery-storage-first-auction-enel-wins-half-2025-10-01/
- **[S46] METLEN — New renewable projects including Italy BESS tolling agreement**  
  https://www.metlen.com/news/company-news/metlen-accelerates-global-expansion-with-new-renewable-projects/
- **[S47] Renewables Now — METLEN signs Italy BESS deal**  
  https://renewablesnow.com/news/greeces-metlen-wins-uk-ireland-solar-epc-work-signs-italy-bess-deal-1288695/
- **[S48] Energy-Storage News — Kontrolmatik / Harbin Electric Turkey wind-plus-storage**  
  https://www.energy-storage.news/kontrolmatik-and-chinas-harbin-electric-to-deploy-first-1gwh-wind-plus-storage-project-in-turkey/
- **[S49] Reuters — Polat Energy / Rolls-Royce Turkey battery storage deal**  
  https://www.reuters.com/business/energy/polat-energy-rolls-royce-sign-turkeys-largest-energy-storage-deal-2025-01-15/

### Research and technical references

- **[S50] NREL ATB 2024 — Utility-scale battery storage**  
  https://atb.nrel.gov/electricity/2024/utility-scale_battery_storage
- **[S51] NREL — Predictive modeling of Li-ion battery degradation**  
  https://docs.nrel.gov/docs/fy17osti/67102.pdf
- **[S52] NREL — Moving Beyond 4-Hour Li-Ion Batteries**  
  https://docs.nrel.gov/docs/fy23osti/85878.pdf
- **[S53] NREL — Cost projections for utility-scale battery storage**  
  https://www.osti.gov/servlets/purl/2583471
- **[S54] NREL / research PDF — Calendar and cycle aging variables**  
  https://docs.nrel.gov/docs/fy23osti/85470.pdf
- **[S55] arXiv — Optimal battery bidding under decision-dependent SoC uncertainty**  
  https://arxiv.org/html/2604.12594v1
- **[S56] Energies / MDPI — State of charge estimation review**  
  https://www.mdpi.com/1996-1073/18/9/2144

---

## 16. Final recommendation

The hackathon product should not look like a model notebook. It should look like an operator-grade intelligence cockpit.

The digital twin should be the differentiating feature that makes the story credible under data scarcity:

> **Even with scarce specs, the product can build a defensible twin, expose uncertainty, generate feasible schedules, monitor asset-health constraints, and update itself as better supplier/telemetry data arrives.**

For a five-minute pitch, emphasize three ideas:

1. **Data scarcity is solved through archetype-based digital twins.**
2. **Optimization is made trustworthy through capacity-stack, efficiency, degradation, and compliance constraints.**
3. **The dashboard turns uncertain market and asset data into explainable battery actions, not just price forecasts.**

The most memorable product claim:

> **“We do not model a battery as a magic MWh number. We model the living asset: nameplate capacity, usable capacity, losses, thermal stress, degradation, availability, warranty, and market readiness — then use that twin to decide when to charge, discharge, or stay idle.”**
