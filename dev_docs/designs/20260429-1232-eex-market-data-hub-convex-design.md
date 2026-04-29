# EEX Market Data Hub Convex Integration Design

**Date:** 2026-04-29  
**Status:** Implemented initial backend integration  
**Primary files:** `convex/eex.ts`, `convex/http.ts`, `convex/schema.ts`  
**Product context:** Battery Intelligence OS for the Greek electricity market

---

## 1. Purpose

The EEX integration provides a backend-controlled way to query EEX Market Data Hub data for dashboard context, reports, and LLM-powered analysis.

This integration is intentionally **not** the primary operational source for Greek battery dispatch prices. The primary operational price source remains HEnEx DAM and intraday market data because dispatch decisions need Greek market prices at operational Market Time Unit resolution.

EEX is used as a broader market-context source:

- Greek power futures forward-curve context.
- EUA carbon price context.
- Scenario and report inputs.
- LLM explanation context for market regimes.
- Cross-market context when the dashboard needs to compare Greece with related European markets.

---

## 2. Source System

The EEX public website embeds the Market Data Hub widget from EEX Group EDS. The backend uses the same public JSON endpoints used by the widget.

Base endpoints:

```text
https://api.eex-group.com/pub/customise-widget
https://api.eex-group.com/pub/market-data
```

Source page:

```text
https://www.eex.com/en/market-data/market-data-hub
```

Required request headers:

```text
Accept: application/json,text/plain,*/*
Origin: https://www.eex.com
Referer: https://www.eex.com/
User-Agent: odyceo-hackathon-convex-eex/1.0
```

Some EEX market-data routes return `403` without browser-like `Origin` and `Referer` headers, so these headers are centralized in `eexHeaders()`.

---

## 3. Product Scope

## 3.1 In Scope

The implemented integration supports:

- Instrument catalog discovery.
- Price ticker lookup.
- Historical table data lookup.
- End-of-day chart series.
- Intraday chart series.
- Cached default context snapshot for Greek power futures and EUA context.

The flexible query endpoint supports arbitrary EEX Market Data Hub combinations as long as the caller supplies a valid instrument contract shape.

## 3.2 Out of Scope

The integration does not provide:

- Greek DAM or intraday spot dispatch prices.
- A licensed real-time market data feed.
- Order book data.
- Bid/ask depth.
- Guaranteed full historical retention.
- A normalized canonical market table across all EEX products.

The integration should not be used to directly optimize tomorrow's battery schedule. It should feed the market-intelligence layer, report generator, scenario layer, and LLM context.

---

## 4. Data Role in Battery Intelligence OS

## 4.1 Primary Operational Stack

```text
HEnEx DAM / Intraday -> dispatch price source
IPTO / ADMIE         -> Greek system fundamentals
Open-Meteo          -> weather and RES proxies
ICE TTF             -> gas fuel-cost proxy
EEX EUA             -> carbon-cost proxy
EEX Greek futures   -> forward-market context
```

## 4.2 EEX Dashboard Use Cases

EEX data can support the following dashboard areas:

- Market Intelligence: forward curve, carbon context, market regime notes.
- Reports: "why the market looks expensive/cheap" context.
- LLM Analysis: concise background facts for natural language explanations.
- Scenario Builder: gas/carbon/forward-power stress assumptions.
- Executive View: business-planning price environment.

Example analysis statement:

> Greek May 2026 baseload futures are trading around X EUR/MWh while EUA prices are at Y EUR/t, suggesting forward market expectations remain sensitive to thermal marginal cost and carbon-cost assumptions.

---

## 5. EEX Product Coverage Relevant to Us

## 5.1 Greek Power Futures

The EEX hub exposes Greek power futures under:

```text
commodity = POWER
pricing   = F
area      = GR
product   = Base
```

Observed Greek futures short-code families:

```text
FF01..FF31  Greek Power Base Day Futures
FFB1..FFB5  Greek Power Base Week Futures
FFW1..FFW5  Greek Power Base Weekend Futures
FFBM        Greek Power Base Month Future
FFBQ        Greek Power Base Quarter Future
FFBY        Greek Power Base Year Future
```

The default cached context uses:

```text
shortCode    = FFBM
area         = GR
product      = Base
commodity    = POWER
pricing      = F
maturityType = Month
```

The default selected maturity is resolved from the catalog unless explicitly supplied.

## 5.2 EUA Carbon Context

EUA context comes from EEX Environmentals rows, typically:

```text
commodity = ENVIRONMENTALS
area      = EU
product   = EUA
```

The selector prefers:

```text
pricing = S
```

and falls back to another EU EUA row if a spot row is unavailable.

## 5.3 Other Countries

The flexible query action can query other EEX areas when relevant. These should only be used as context features, especially for cross-border or regional regime analysis.

Potentially useful neighboring or related power areas:

```text
IT, BG, RO, RS
```

These should not displace Greek HEnEx data in dispatch logic.

---

## 6. Convex Module Design

## 6.1 Module

Implemented in:

```text
convex/eex.ts
```

The module exposes two public operations:

```text
getLatestEexContext
queryEexMarketData
```

and one refresh action:

```text
refreshEexContext
```

Internal helpers:

```text
getLatestFetch
storeEexContext
```

## 6.2 Two Access Patterns

The design intentionally supports two modes:

1. Cached context snapshot.
2. Flexible direct query.

### Cached Context Snapshot

Use for high-level dashboard cards and LLM report context.

```text
GET  /market/eex/context/latest
POST /market/eex/context/refresh
```

This stores a snapshot in Convex tables and returns a stable context object.

### Flexible Direct Query

Use for chart/table widgets that need arbitrary products, countries, maturities, and periods.

```text
GET  /market/eex/query?dataset=...
POST /market/eex/query
```

This action fetches live EEX widget data and returns it directly without persisting every possible query result.

---

## 7. HTTP API

## 7.1 Cached Context

### Read Latest Context

```text
GET /market/eex/context/latest
```

Optional query parameters:

```text
refresh=true
force=true
maxAgeMinutes=60
lookbackDays=7
greekPowerShortCode=FFBM
greekPowerMaturity=202605
```

If `refresh=true`, the route calls `refreshEexContext` before reading the latest cached snapshot.

### Refresh Context

```text
POST /market/eex/context/refresh
Content-Type: application/json
```

Body:

```json
{
  "force": true,
  "maxAgeMinutes": 60,
  "lookbackDays": 7,
  "greekPowerShortCode": "FFBM",
  "greekPowerMaturity": "202605"
}
```

Response shape:

```json
{
  "refresh": {
    "cache": "miss",
    "fetchId": "...",
    "fetchedAtUtc": "...",
    "selectedGreekPowerShortCode": "FFBM",
    "selectedGreekPowerMaturity": "202605",
    "selectedGreekPowerPriceEurPerMwh": 85.85,
    "greekPowerInstrumentCount": 101,
    "euaInstrumentCount": 1,
    "euaPriceEurPerTonne": 65.1
  },
  "context": {
    "fetch": {},
    "usage": "...",
    "greekPower": {},
    "carbon": {}
  }
}
```

## 7.2 Flexible EEX Query

### GET Query

```text
GET /market/eex/query?dataset=catalog&commodity=POWER&pricing=F&area=GR
```

### POST Query

```text
POST /market/eex/query
Content-Type: application/json
```

Body:

```json
{
  "dataset": "table",
  "commodity": "POWER",
  "pricing": "F",
  "area": "GR",
  "product": "Base",
  "shortCode": "FFBM",
  "maturity": "202605",
  "maturityType": "Month",
  "startDate": "2026-04-27",
  "endDate": "2026-04-29"
}
```

Supported `dataset` values:

```text
catalog
ticker
table
eod
intraday
```

---

## 8. Dataset Contracts

## 8.1 Catalog

Purpose:

Discover valid EEX instruments and dropdown options.

Endpoint:

```text
GET /market/eex/query?dataset=catalog&commodity=POWER&pricing=F&area=GR
```

Convex action:

```text
queryEexMarketData({ dataset: "catalog", ...scope })
```

Required fields:

None. Defaults are:

```text
commodity = POWER
pricing   = F
area      = GR
product   = All
productSpecific = All
maturityType    = All
```

Response:

```json
{
  "source": "eex-market-data-hub",
  "dataset": "catalog",
  "fetchedAtUtc": "2026-04-29T09:31:20.300Z",
  "sourceUrl": "...",
  "scope": [
    {
      "commodity": "POWER",
      "pricing": "F",
      "area": "GR",
      "product": "All",
      "productSpecific": "All",
      "maturityType": "All"
    }
  ],
  "count": 101,
  "rows": [
    {
      "shortCode": "FFBM",
      "maturity": "202605",
      "maturityType": "Month",
      "commodity": "POWER",
      "pricing": "F",
      "area": "GR",
      "product": "Base",
      "displayYear": 2026,
      "displayMonth": 5,
      "valuationMethod": "Future"
    }
  ]
}
```

Dashboard use:

- Populate commodity/pricing/area/product/maturity dropdowns.
- Discover valid `shortCode` and `maturity` pairs.
- Avoid hardcoding all EEX product codes in frontend state.

## 8.2 Ticker

Purpose:

Fetch latest settlement/price ticker for a selected instrument.

Required fields:

```text
dataset
shortCode
commodity
pricing
area
product
```

Optional:

```text
maturity
```

Example:

```text
GET /market/eex/query?dataset=ticker&commodity=POWER&pricing=F&area=GR&product=Base&shortCode=FFBM&maturity=202605
```

Response:

```json
{
  "dataset": "ticker",
  "source": "eex-market-data-hub",
  "fetchedAtUtc": "2026-04-29T09:31:31.412Z",
  "sourceUrl": "...",
  "row": {
    "lastUpdatedAt": "2026-04-28T19:00:00.000Z",
    "settlPx": 85.85,
    "currency": "EUR/MWh",
    "shortCode": "FFBM",
    "longName": "EEX Greek Power Base Month Future",
    "diffSettlPx": -0.15000000000000568,
    "noPreviousValueFound": true
  },
  "rows": []
}
```

Dashboard use:

- Headline forward price cards.
- EUA price context card.
- LLM report context.

## 8.3 Table

Purpose:

Fetch settlement, volume, and open-interest rows for a date window.

Required fields:

```text
dataset
shortCode
commodity
pricing
area
product
```

Common fields:

```text
maturity
maturityType
startDate
endDate
```

Example:

```text
GET /market/eex/query?dataset=table&commodity=POWER&pricing=F&area=GR&product=Base&shortCode=FFBM&maturity=202605&maturityType=Month&startDate=2026-04-27&endDate=2026-04-29
```

Observed response:

```json
{
  "dataset": "table",
  "count": 2,
  "units": {
    "currency": "EUR",
    "uOM": "MWh"
  },
  "rows": [
    {
      "shortCode": "FFBM",
      "maturityDate": 202605,
      "tradeDate": "2026-04-28",
      "totVolTrdd": 21576,
      "grossOpenInt": 1195,
      "grossOpenIntSz": 889080,
      "netOpenInt": null,
      "netOpenIntSz": null,
      "settlPx": 85.85
    }
  ]
}
```

Dashboard use:

- Historical settlement table.
- Volume and open-interest trend table.
- Forward contract liquidity context.

## 8.4 EOD Chart

Purpose:

Fetch chart-ready historical end-of-day series.

Required fields:

```text
dataset = eod
shortCode
commodity
pricing
area
product
```

Common fields:

```text
maturity
startDate
endDate
underlyingShortCode
underlyingMaturity
```

Example:

```text
GET /market/eex/query?dataset=eod&commodity=POWER&pricing=F&area=GR&product=Base&shortCode=FFBM&maturity=202605&startDate=2026-04-01&endDate=2026-04-29
```

Response:

```json
{
  "dataset": "eod",
  "lastUpdate": "...",
  "currency": "EUR",
  "uOM": "MWh",
  "series": [
    {
      "serieName": "settlPx",
      "timeAndValue": [["2026-04-28", 85.85]]
    }
  ]
}
```

Dashboard use:

- Forward-price chart.
- EUA historical context chart.
- Scenario report visuals.

## 8.5 Intraday Chart

Purpose:

Fetch intraday price/volume/lot-size series where EEX exposes it.

Required fields:

```text
dataset = intraday
shortCode
commodity
pricing
area
product
startDate
```

Example:

```text
GET /market/eex/query?dataset=intraday&commodity=POWER&pricing=F&area=GR&product=Base&shortCode=FFBM&maturity=202605&startDate=2026-04-29
```

Response:

```json
{
  "dataset": "intraday",
  "lastUpdate": "2026-04-29T08:40:57.069991000Z",
  "currency": "EUR",
  "uOM": "MWh",
  "series": [
    {
      "serieName": "lastPx",
      "timeAndValue": [["2026-04-29T08:40:57.069991000Z", 85.9]]
    },
    {
      "serieName": "volume",
      "timeAndValue": []
    },
    {
      "serieName": "lotSize",
      "timeAndValue": []
    }
  ]
}
```

EEX may return empty intraday series for some products. The frontend should treat an empty `timeAndValue` array as "no intraday series available", not as an error.

---

## 9. Convex Schema

The cached context path stores snapshots in these tables:

```text
eexFetches
eexGreekPowerInstruments
eexGreekPowerTicker
eexGreekPowerTableData
eexEuaInstruments
eexEuaTicker
```

## 9.1 `eexFetches`

Stores one row per cached refresh.

Key fields:

```text
source
fetchedAtUtc
sourceUrl
timezone
greekPowerInstrumentCount
selectedGreekPowerShortCode
selectedGreekPowerMaturity
selectedGreekPowerPriceEurPerMwh
euaInstrumentCount
euaPriceEurPerTonne
health
```

Index:

```text
by_source_fetchedAt(source, fetchedAtUtc)
```

## 9.2 Payload Tables

Each payload table stores the raw normalized rows from the corresponding EEX endpoint:

```text
eexGreekPowerInstruments.rows
eexGreekPowerTicker.row
eexGreekPowerTableData.rows
eexGreekPowerTableData.units
eexEuaInstruments.rows
eexEuaTicker.row
```

Each table has:

```text
fetchId
source
```

and is indexed by:

```text
by_fetch(fetchId)
```

## 9.3 Why Flexible Query Results Are Not Persisted

The generic `/market/eex/query` endpoint can request many combinations of:

- area,
- product,
- maturity,
- maturity type,
- short code,
- date range,
- dataset.

Persisting every query would quickly create noisy cache state without a clear product need. Instead:

- curated context snapshots are persisted;
- arbitrary dashboard drilldowns are fetched live;
- later, heavily used query combinations can be promoted into cached tables if needed.

---

## 10. Frontend Integration Guidance

## 10.1 Catalog-First Flow

Dashboard widgets should use the catalog endpoint first:

```text
/market/eex/query?dataset=catalog&commodity=POWER&pricing=F&area=GR
```

Then derive valid dropdowns from returned rows:

```text
product
maturityType
maturity
shortCode
displayYear
displayMonth
displayWeek
displayDay
```

The frontend should not assume a maturity exists for every short code. It should use the exact row selected by the user.

## 10.2 Default Greek Dashboard Selection

Recommended default:

```text
commodity    = POWER
pricing      = F
area         = GR
product      = Base
shortCode    = FFBM
maturityType = Month
```

The default maturity should come from the catalog. For a current-month card, use the nearest maturity returned for `FFBM`.

## 10.3 Dashboard Widgets

Recommended EEX-powered widgets:

- Greek Base Month forward card.
- Greek forward curve table by maturity.
- Greek futures volume/open-interest table.
- EUA latest price card.
- EUA historical EOD chart.
- "Forward context" paragraph for LLM-generated reports.

Not recommended:

- Main dispatch timeline.
- 15-minute charge/discharge decision chart.
- DAM price forecast substitute.

---

## 11. Validation Performed

The implementation was validated with:

```text
npm run convex:codegen
npm run typecheck
```

Both passed.

Live Convex action checks were also run:

```text
npx convex run eex:queryEexMarketData '{"dataset":"catalog","commodity":"POWER","pricing":"F","area":"GR"}'
```

Result:

```text
101 Greek power futures catalog rows
```

Ticker check:

```text
npx convex run eex:queryEexMarketData '{"dataset":"ticker","commodity":"POWER","pricing":"F","area":"GR","product":"Base","shortCode":"FFBM","maturity":"202605"}'
```

Observed result:

```text
EEX Greek Power Base Month Future
settlPx = 85.85 EUR/MWh
lastUpdatedAt = 2026-04-28T19:00:00.000Z
```

Table check:

```text
npx convex run eex:queryEexMarketData '{"dataset":"table","commodity":"POWER","pricing":"F","area":"GR","product":"Base","shortCode":"FFBM","maturity":"202605","maturityType":"Month","startDate":"2026-04-27","endDate":"2026-04-29"}'
```

Observed rows included:

```text
2026-04-28 settlPx=85.85 totVolTrdd=21576 grossOpenInt=1195
2026-04-27 settlPx=86.00 totVolTrdd=5208  grossOpenInt=1173
```

---

## 12. Known Limitations

1. EEX is public widget data, not a licensed production market-data feed.
2. Greek power data exposed here is futures data, not Greek spot/DAM data.
3. Some products have empty intraday series.
4. The integration depends on EEX widget endpoints that could change without notice.
5. The current cached snapshot stores one default Greek power contract and EUA context, not every possible instrument.
6. Date-window retention and availability vary by product and endpoint.

---

## 13. Future Improvements

Near-term:

- Add frontend dropdowns backed by `dataset=catalog`.
- Add a forward-curve widget that groups `FFBM`, `FFBQ`, and `FFBY` rows.
- Add an EUA card and EOD chart.
- Add clear UI copy that EEX is context, not dispatch price.

Backend:

- Add optional caching for high-use query combinations.
- Add typed response mappers per dataset.
- Add dashboard-specific helper action for Greek forward curve construction.
- Add error normalization for EEX unavailable/empty-data cases.
- Add source freshness cards and warnings.

Data model:

- Promote repeated EOD series into persisted tables if charts need fast reloads.
- Store selected EEX query presets for report generation.
- Join EEX context with HEnEx, TTF, and Open-Meteo snapshots in a unified report-context endpoint.

LLM/reporting:

- Add a report context object:

```json
{
  "greekPowerForward": {},
  "carbonContext": {},
  "gasContext": {},
  "dispatchPriceSource": "HEnEx",
  "caveat": "EEX is context, not operational dispatch source."
}
```

This would keep generated analysis grounded and prevent the model from overstating EEX relevance.
