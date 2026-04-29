# ICE TTF Convex Dashboard Data Design

## Context

The dashboard needs Dutch TTF natural gas data as a flexible input into electricity-price analysis. The first implementation direction was a static demo fetcher, but the current backend has moved that adapter into Convex so the frontend can query cacheable HTTP routes directly.

The important product requirement is that this cannot be a "latest price only" surface. The dashboard needs enough shape to support current spot-like cards, forward-curve views, intraday charts, historical period charts, explicit contract selection, and fuel-cost transformation for thermal generation proxies.

This design documents the Convex backend that has been implemented for ICE Dutch TTF Natural Gas Futures.

## Source

Primary ICE product page:

```text
https://www.ice.com/products/27996665/Dutch-TTF-Natural-Gas-Futures/data?marketId=6214891
```

The implemented adapter uses ICE's product-guide JSON endpoints behind that page:

```text
GET https://www.ice.com/marketdata/api/productguide/charting/contract-data?productId=4331&hubId=7979
GET https://www.ice.com/marketdata/api/productguide/charting/data/current-day?marketId=<marketId>
GET https://www.ice.com/marketdata/api/productguide/charting/data/historical?marketId=<marketId>&historicalSpan=<1|2|3>
```

Resolved ICE identifiers:

```text
specId: 27996665
productId: 4331
hubId: 7979
contractSymbolCode: TFM
micCode: NDEX
unit: EUR/MWh gas
```

These are website-delayed product-guide endpoints. They are acceptable for the hackathon dashboard demo, but they are not a licensed production market-data feed.

## Goals

- Serve ICE TTF data through Convex backend routes that the dashboard frontend can call directly.
- Support flexible data retrieval, not only the latest value.
- Cache ICE fetches by the full request shape so different dashboard views do not overwrite each other.
- Preserve enough source metadata for freshness, caveats, selected contract, and dashboard health states.
- Transform gas price into an electricity fuel-cost proxy using a configurable thermal efficiency.
- Keep the implementation small and demo-oriented while leaving a clean path to replace the adapter with licensed live feeds later.

## Non-Goals

- No production market-data licensing solution.
- No guarantee of ICE endpoint stability.
- No tick-by-tick or websocket feed.
- No exhaustive commodity analytics model.
- No attempt to infer spark spreads beyond the simple fuel-cost conversion.

## Implemented Files

Core backend files:

```text
convex/iceTtf.ts
convex/http.ts
convex/schema.ts
```

Supporting project files:

```text
package.json
package-lock.json
tsconfig.json
convex/tsconfig.json
convex/_generated/*
```

The old local script path remains useful as an exploratory artifact, but the dashboard integration should use Convex routes instead of generated local JSON.

## Data Model

The schema separates fetch metadata from the larger row payloads:

```text
ttfFetches
ttfContracts
ttfIntradayBars
ttfHistoricalBars
```

`ttfFetches` stores the selected contract and request envelope:

```text
source
fetchedAtUtc
sourceUrl
contractSelection
requestedMarketId
selectedMarketId
selectedMarketStrip
priceEurPerMwhGas
efficiency
fuelCostEurPerMwhElectric
historicalSpan
contractCount
intradayPointCount
historicalPointCount
health
```

The related payload tables store rows by `fetchId`:

```text
ttfContracts.rows
ttfIntradayBars.rows
ttfHistoricalBars.rows
```

Each table is indexed by fetch identity where needed:

```text
ttfFetches.by_source_fetchedAt(source, fetchedAtUtc)
ttfContracts.by_fetch(fetchId)
ttfIntradayBars.by_fetch(fetchId)
ttfHistoricalBars.by_fetch(fetchId)
```

This structure keeps the latest fetch query cheap while allowing the frontend to opt into heavier arrays only when a specific view needs them.

## Fetch Flow

The `refreshIceTtf` Convex action is the central fetch path.

1. Normalize request parameters.
2. Look for a compatible cached fetch in recent `ttfFetches`.
3. Return a cache hit if the compatible fetch is still inside `maxAgeMinutes`.
4. Fetch the full ICE contract list.
5. Select a contract by explicit `marketId`, front-month, or highest volume.
6. Fetch intraday bars for the selected contract.
7. Fetch historical bars for the selected contract and requested `historicalSpan`.
8. Store metadata, contract rows, intraday rows, and historical rows.
9. Return a compact refresh summary to the caller.

Implemented defaults:

```text
maxAgeMinutes: 5
contractSelection: front-month
historicalSpan: 1
efficiency: 0.55
```

Allowed dashboard parameters:

```text
contractSelection=front-month|highest-volume
marketId=<explicit ICE market id>
historicalSpan=1|2|3
efficiency=<0.1..1>
maxAgeMinutes=<0..1440>
force=true|false
```

## Contract Selection

The frontend has three useful choices:

```text
front-month
highest-volume
explicit marketId
```

`front-month` selects the first contract returned by ICE's product-guide contract list. This is appropriate for default "current gas input" cards.

`highest-volume` selects the contract with the largest available volume field. This is useful when the most liquid strip is not the front month.

`marketId` overrides both selection modes. This is the right mode for dashboards that let users click a contract in the forward curve and then load its intraday or historical chart.

## Historical Flexibility

The implementation intentionally supports ICE's `historicalSpan` parameter instead of hard-coding one period.

```text
historicalSpan=1
historicalSpan=2
historicalSpan=3
```

The exact ICE period semantics are owned by the ICE endpoint, but the backend preserves the selected span on `ttfFetches.historicalSpan` and makes it part of cache compatibility. This means a one-period chart and a wider historical chart can coexist in cache without returning the wrong shape to the frontend.

## HTTP Routes

### `GET /fuel/ttf/panel`

Full dashboard payload. Includes selected contract, contract curve, intraday bars, historical bars, thermal proxy, and panel metadata.

Use this when the dashboard wants one call to hydrate the whole TTF module.

Example:

```text
/fuel/ttf/panel?contractSelection=highest-volume&historicalSpan=2
```

Cache header:

```text
Cache-Control: public, max-age=60, stale-while-revalidate=300
```

### `GET /fuel/ttf/contracts`

Forward-curve payload. Includes contracts and selected contract, but skips intraday and historical bar arrays.

Example:

```text
/fuel/ttf/contracts?contractSelection=front-month
```

Cache header:

```text
Cache-Control: public, max-age=60, stale-while-revalidate=300
```

### `GET /fuel/ttf/intraday`

Selected-contract intraday bars.

Example:

```text
/fuel/ttf/intraday?marketId=6214891&maxAgeMinutes=2
```

Cache header:

```text
Cache-Control: public, max-age=30, stale-while-revalidate=180
```

### `GET /fuel/ttf/historical`

Selected-contract historical bars.

Example:

```text
/fuel/ttf/historical?contractSelection=highest-volume&historicalSpan=2
```

Cache header:

```text
Cache-Control: public, max-age=300, stale-while-revalidate=1800
```

### `GET /fuel/ttf/latest`

Compatibility route for a simple latest panel. This can optionally trigger refresh with `refresh=true`, but it should not be the primary flexible dashboard route.

### `POST /fuel/ttf/refresh`

Explicit refresh route for manual dashboard controls, demos, or prewarming.

Example body:

```json
{
  "force": true,
  "contractSelection": "highest-volume",
  "historicalSpan": "2",
  "efficiency": 0.55
}
```

## Response Shape

The full panel response contains:

```text
refresh
fetch
instrument
selectedContract
thermalProxy
contracts
intradayBars
historicalBars
panel
```

Contract rows:

```text
marketId
marketStrip
lastPrice
change
volume
lastTimeUtc
endDateUtc
```

Bar rows:

```text
timestampUtc
priceEurPerMwhGas
```

Thermal proxy:

```text
efficiency
fuelCostEurPerMwhElectric
```

The fuel-cost proxy is calculated as:

```text
fuelCostEurPerMwhElectric = priceEurPerMwhGas / efficiency
```

The default efficiency is `0.55`, so a `44.78 EUR/MWh gas` TTF price becomes roughly `81.418 EUR/MWh electric`.

## Cache Design

The cache key is logical rather than a single URL string. A cached fetch is compatible only when these values match:

```text
contractSelection
requestedMarketId
historicalSpan
efficiency
```

This matters because a dashboard may request:

```text
front-month + historicalSpan=1
highest-volume + historicalSpan=2
marketId=6214891 + historicalSpan=3
```

Those must be treated as different data products. The implementation scans recent `ttfFetches` by source and timestamp, then picks the first compatible record still within `maxAgeMinutes`.

## Frontend Integration Guidance

Recommended dashboard usage:

1. Use `/fuel/ttf/panel` for first load of the ICE TTF module.
2. Use `/fuel/ttf/contracts` when the user changes or refreshes the forward curve panel.
3. Use `/fuel/ttf/intraday?marketId=<id>` after the user selects a contract.
4. Use `/fuel/ttf/historical?marketId=<id>&historicalSpan=<span>` for period controls.
5. Show `fetch.fetchedAtUtc`, `refresh.cache`, and `health.caveat` somewhere in the dashboard's data-quality affordance.

Recommended period control mapping:

```text
Short history -> historicalSpan=1
Medium history -> historicalSpan=2
Long history -> historicalSpan=3
```

Recommended contract control mapping:

```text
Default card -> contractSelection=front-month
Liquidity-weighted view -> contractSelection=highest-volume
Clicked curve strip -> marketId=<selected contract marketId>
```

## Demo Behavior Verified

The backend was validated with:

```text
npm run typecheck
npm run convex:codegen
npx convex dev --once
npx convex run iceTtf:refreshIceTtf '{"contractSelection":"highest-volume","historicalSpan":"2"}'
```

The highest-volume, span-2 query returned a cache hit against the stored fetch, confirming that parameter-aware cache lookup is working.

Observed demo values during implementation:

```text
front-month marketId: 6187520
front-month strip: May26
highest-volume marketId: 6214891
highest-volume strip: Jun26
historicalSpan=1 point count: 62
historicalSpan=2 point count: 257
```

These values are examples from the implementation date and should not be hard-coded in frontend logic.

## Failure Modes

Expected failure modes:

- ICE endpoint changes response shape.
- ICE blocks or throttles website-style fetches.
- ICE returns a contract list without the requested `marketId`.
- Historical endpoint returns no `bars` array.
- Selected contract has no `lastPrice`, so the thermal proxy cannot be calculated.

Current behavior:

- Hard endpoint failures throw from the Convex action.
- Missing requested `marketId` throws an explicit error.
- Missing or malformed bars throw an explicit error.
- Missing price produces an undefined fuel-cost proxy instead of fabricating a value.

Frontend behavior should:

- Use cached data when available.
- Show data freshness and caveat text.
- Treat unavailable thermal proxy as an absent metric rather than zero.
- Allow retry through `force=true` or the POST refresh route.

## Upgrade Path

The adapter boundary is already isolated in `convex/iceTtf.ts`. To move beyond the demo path:

1. Replace `fetchContracts` and `fetchBars` with a licensed vendor or ICE data-feed integration.
2. Preserve the normalized output shape: contracts, intraday bars, historical bars, selected contract, thermal proxy.
3. Keep cache compatibility based on contract selection, explicit market ID, period, and efficiency.
4. Add retention policy or periodic cleanup if the dashboard starts storing frequent intraday refreshes.
5. Add scheduled Convex crons for prewarming front-month and highest-volume views.

The frontend should not need to care whether the backend source is ICE product-guide scraping or a licensed feed as long as the normalized HTTP contract remains stable.

