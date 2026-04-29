# Open-Meteo Convex Weather Backend Design

**Date:** 2026-04-29  
**Status:** Implemented initial Convex backend  
**Primary files:** `convex/openMeteo.ts`, `convex/schema.ts`, `convex/http.ts`, `convex/crons.ts`  
**Product context:** Battery Intelligence OS for the Greek electricity market

---

## 1. Purpose

The Open-Meteo integration provides a Convex-backed weather telemetry layer for the Battery Intelligence OS dashboard.

The goal is not to build a standalone weather app. The goal is to make weather data available as a first-class, queryable signal source for battery-value analysis:

- solar surplus detection;
- wind generation proxying;
- demand stress from temperature and apparent temperature;
- precipitation and storm-risk context;
- forecast-run history and comparison;
- data-health and source-freshness inspection;
- later model-feature and signal-engine inputs.

The backend deliberately stores and exposes more telemetry than the first dashboard panel will display. We do not yet know which weather variables will be most predictive for Greek battery value, so the backend should preserve a broad signal surface while letting the frontend request narrow slices.

---

## 2. Source System

Weather data comes from Open-Meteo's forecast API:

```text
https://api.open-meteo.com/v1/forecast
```

The implementation uses:

```text
timezone=Europe/Athens
minutely_15=...
hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high
current=...
forecast_minutely_15=96
past_minutely_15=4
```

The 15-minute request cadence matches the Greek Day-Ahead Market's 96 interval operational grid. Open-Meteo may interpolate 15-minute values depending on model and region, so the backend stores `resolution` and `resolutionSource` metadata and returns a source-resolution note in catalog/panel responses.

---

## 3. Product Scope

## 3.1 In Scope

The implemented backend supports:

- scheduled Open-Meteo ingestion through Convex cron jobs;
- manual refresh for demos and debugging;
- cached forecast-run storage in Convex;
- exact fetch-run selection by `fetchId`;
- point-in-time reconstruction by `asOfFetchedAtUtc`;
- current-condition filtering by location and variable;
- time-series filtering by scope, location, variable group, explicit variables, and timestamp period;
- weather forecast-run comparison for the same forecast timestamp across cached runs;
- national weighted aggregation across representative Greek locations;
- regional series storage for each representative location;
- derived weather scores for early battery-feature experiments.

## 3.2 Out of Scope

The implemented backend does not yet provide:

- arbitrary user-supplied coordinates;
- long-term historical weather backfill;
- Open-Meteo historical forecast API ingestion;
- Open-Meteo ensemble API ingestion;
- persistence pruning / retention policy;
- forecast-error analysis versus actuals;
- model-specific source comparison, such as ECMWF versus GFS;
- production auth or rate limiting on HTTP routes.

Those can be layered onto the same fetch-run and query-selection model.

---

## 4. Representative Geography

The backend uses a fixed MVP set of representative Greek regions:

| ID | Name | Latitude | Longitude | Weight |
| --- | --- | ---: | ---: | ---: |
| `athens` | Athens | 37.9838 | 23.7275 | 0.30 |
| `thessaloniki` | Thessaloniki | 40.6401 | 22.9444 | 0.18 |
| `crete` | Crete | 35.2401 | 24.8093 | 0.14 |
| `western_greece` | Western Greece | 38.2466 | 21.7346 | 0.13 |
| `thessaly` | Thessaly | 39.6390 | 22.4191 | 0.13 |
| `peloponnese` | Peloponnese | 37.5079 | 22.3735 | 0.07 |
| `aegean_islands` | Aegean Islands | 37.0850 | 25.1500 | 0.05 |

The weighted national series is a simple MVP aggregation. The weights are product assumptions, not validated system-load or renewable-capacity weights. They are adequate for demo-level national weather context and should later be replaced by technology-specific weights:

- solar-capacity-weighted profile for solar surplus;
- wind-capacity-weighted profile for wind generation proxy;
- load-weighted profile for temperature-driven demand stress.

---

## 5. Variable Surface

## 5.1 15-Minute Variables

The backend requests the following `minutely_15` variables:

```text
temperature_2m
relative_humidity_2m
apparent_temperature
precipitation
rain
wind_speed_10m
wind_speed_80m
wind_direction_10m
wind_direction_80m
wind_gusts_10m
shortwave_radiation
direct_radiation
diffuse_radiation
direct_normal_irradiance
global_tilted_irradiance
sunshine_duration
is_day
weather_code
cape
visibility
```

These are stored in camel-case row fields, for example:

```text
temperature2m
relativeHumidity2m
windSpeed80m
shortwaveRadiation
directNormalIrradiance
weatherCode
```

## 5.2 Hourly Auxiliary Variables

Open-Meteo exposes several useful cloud-cover variables hourly. The backend requests them as `hourly` data and merges the matching hourly value into each 15-minute row:

```text
cloud_cover
cloud_cover_low
cloud_cover_mid
cloud_cover_high
```

This means dashboard callers can request cloud-cover fields from the same series endpoint as the native 15-minute variables.

## 5.3 Current Conditions

The backend also stores current conditions by location:

```text
temperature_2m
relative_humidity_2m
apparent_temperature
precipitation
rain
weather_code
cloud_cover
wind_speed_10m
wind_direction_10m
wind_gusts_10m
is_day
```

Current conditions are useful for status cards and data-health views, while forecast series are used for charts, signal features, and battery scheduling context.

---

## 6. Variable Groups

The backend exposes variable groups so the frontend can build common dashboard tabs without hardcoding field lists.

```ts
overview = [
  "temperature_2m",
  "apparent_temperature",
  "wind_speed_80m",
  "cloud_cover",
  "shortwave_radiation",
  "precipitation",
  "weather_code",
]

solar = [
  "shortwave_radiation",
  "direct_radiation",
  "diffuse_radiation",
  "direct_normal_irradiance",
  "global_tilted_irradiance",
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
]

wind = [
  "wind_speed_10m",
  "wind_speed_80m",
  "wind_direction_10m",
  "wind_direction_80m",
  "wind_gusts_10m",
]

loadWeather = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
]

precipitationRisk = [
  "precipitation",
  "rain",
  "weather_code",
  "cape",
  "visibility",
]
```

Callers can use either a group or explicit variables. If both are provided, the backend returns the union.

---

## 7. Derived MVP Features

The backend adds three early derived weather scores to every forecast row:

```text
solarAvailabilityScore
windGenerationProxy
weatherDemandStress
```

These are intentionally simple and explainable:

- `solarAvailabilityScore` combines shortwave radiation and direct radiation, with precipitation as a penalty.
- `windGenerationProxy` scales 80m wind speed nonlinearly to approximate wind-production opportunity.
- `weatherDemandStress` flags hot or cold apparent-temperature stress.

These scores are not final dispatch signals. They are first-pass features for the Signal Engine and Model Lab.

---

## 8. Convex Schema

Defined in:

```text
convex/schema.ts
```

## 8.1 `weatherFetches`

One row per Open-Meteo fetch run.

Important fields:

```ts
{
  source: "open-meteo";
  fetchedAtUtc: string;
  sourceUrl: string;
  timezone: "Europe/Athens";
  resolution: "PT15M";
  resolutionSource: "forecast.minutely_15";
  forecastSteps: number;
  pastSteps: number;
  locationCount: number;
  nationalPointCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  units: any;
  health: any;
}
```

Index:

```ts
by_source_fetchedAt: ["source", "fetchedAtUtc"]
```

This table is the anchor for run history, as-of reconstruction, and forecast-run comparison.

## 8.2 `weatherCurrentByLocation`

One row per location per fetch for current conditions.

Important fields:

```ts
{
  fetchId: Id<"weatherFetches">;
  source: "open-meteo";
  locationId: string;
  locationName: string;
  latitude: number;
  longitude: number;
  weight: number;
  values: any;
}
```

Index:

```ts
by_fetch_location: ["fetchId", "locationId"]
```

## 8.3 `weatherNationalSeries`

One row per fetch containing the weighted national time series.

Important fields:

```ts
{
  fetchId: Id<"weatherFetches">;
  source: "open-meteo";
  rows: Array<Record<string, unknown>>;
}
```

Index:

```ts
by_fetch: ["fetchId"]
```

This is stored as a row array because the MVP fetch size is small: 100 15-minute points by default, with 4 past points and 96 forecast points.

## 8.4 `weatherRegionalSeries`

One row per location per fetch containing that location's time series.

Important fields:

```ts
{
  fetchId: Id<"weatherFetches">;
  source: "open-meteo";
  locationId: string;
  locationName: string;
  latitude: number;
  longitude: number;
  weight: number;
  rows: Array<Record<string, unknown>>;
}
```

Index:

```ts
by_fetch_location: ["fetchId", "locationId"]
```

---

## 9. Ingestion and Refresh Model

## 9.1 Scheduled Refresh

Defined in:

```text
convex/crons.ts
```

The backend refreshes Open-Meteo every 15 minutes:

```ts
crons.interval(
  "refresh open-meteo weather telemetry",
  { minutes: 15 },
  internal.openMeteo.refreshOpenMeteoTelemetryInternal,
  {
    force: true,
    forecastSteps: 96,
    pastSteps: 4,
  },
);
```

The cron uses `force: true` because scheduled runs should accumulate forecast-run history. If it reused the normal cache-hit logic, the dashboard would only have one latest run and could not compare forecast drift.

## 9.2 Manual Refresh

Manual refresh remains available:

```text
openMeteo:refreshOpenMeteoTelemetry
POST /weather/open-meteo/refresh
GET  /weather/open-meteo/latest?refresh=true
```

Manual refresh is for:

- demo setup;
- immediate data priming;
- debugging upstream availability;
- operator-triggered refresh buttons.

Manual refresh uses `maxAgeMinutes` unless forced, so repeated demo calls do not spam Open-Meteo unnecessarily.

---

## 10. Query Model

The dashboard should not be forced into a latest-only view. Every important read path supports at least one of these concepts:

- latest fetch;
- exact `fetchId`;
- point-in-time `asOfFetchedAtUtc`;
- series `startTimestamp` and `endTimestamp`;
- national versus regional scope;
- location selection;
- variable group or explicit variables.

## 10.1 Fetch Selection

Most reads accept:

```ts
fetchId?: Id<"weatherFetches">;
asOfFetchedAtUtc?: string;
```

Selection rules:

1. If `fetchId` is provided, use that exact cached fetch.
2. Else if `asOfFetchedAtUtc` is provided, use the newest fetch whose `fetchedAtUtc <= asOfFetchedAtUtc`.
3. Else use the latest fetch.

This supports both exact run inspection and point-in-time dashboard reconstruction.

## 10.2 Period Selection

`getWeatherSeries` supports:

```ts
startTimestamp?: string;
endTimestamp?: string;
limit?: number;
```

Timestamps are Open-Meteo-local timestamps in the configured `Europe/Athens` timezone, for example:

```text
2026-04-29T12:00
```

## 10.3 Variable Selection

Reads accept:

```ts
group?: string;
variables?: string[];
```

Variable names may be provided as Open-Meteo snake-case names or stored camel-case names:

```text
temperature_2m
temperature2m
shortwave_radiation
shortwaveRadiation
```

The backend normalizes snake-case variable names to stored camel-case names.

---

## 11. Convex Functions

Implemented in:

```text
convex/openMeteo.ts
```

## 11.1 Public Queries

```text
getLatestTelemetry
getWeatherCatalog
getWeatherCurrent
getWeatherSeries
listWeatherFetches
getWeatherCoverage
compareWeatherRuns
getDashboardPanel
```

### `getLatestTelemetry`

Returns the complete cached telemetry for a selected fetch. Despite the name, it can now select by `fetchId` or `asOfFetchedAtUtc`.

Useful for broad dashboard hydration.

### `getWeatherCatalog`

Returns source metadata:

- locations;
- variable groups;
- selected fetch metadata;
- recent fetches when requested;
- units;
- refresh policy.

Useful for dashboard filters, tab definitions, and metadata displays.

### `getWeatherCurrent`

Returns current-condition rows by location.

Supports:

- `fetchId`;
- `asOfFetchedAtUtc`;
- `locationIds`;
- `group`;
- `variables`.

### `getWeatherSeries`

Returns national or regional time series.

Supports:

- `fetchId`;
- `asOfFetchedAtUtc`;
- `scope = national | regional`;
- `locationId` for regional scope;
- `group`;
- `variables`;
- `startTimestamp`;
- `endTimestamp`;
- `limit`.

This is the main graph/table endpoint.

### `listWeatherFetches`

Lists cached Open-Meteo fetch runs.

Supports:

- `limit`;
- `startFetchedAtUtc`;
- `endFetchedAtUtc`.

Useful for run selectors and audit panels.

### `getWeatherCoverage`

Returns oldest/latest cached fetch metadata and a note describing the run model.

Useful for data-health pages.

### `compareWeatherRuns`

Compares a single forecast timestamp across cached fetch runs.

Supports:

- `timestamp`;
- `scope`;
- `locationId`;
- `group`;
- `variables`;
- `fetchLimit`;
- `startFetchedAtUtc`;
- `endFetchedAtUtc`.

This is useful for forecast-drift views, model confidence, and "how stable was this signal?" analysis.

### `getDashboardPanel`

Convenience composed view for a weather telemetry panel.

This is intentionally not the primary data API. The frontend should prefer granular query functions for charts and tables, then use `getDashboardPanel` only for quick MVP composition.

## 11.2 Public Action

```text
refreshOpenMeteoTelemetry
```

Fetches Open-Meteo data and stores a new cached run unless a fresh enough cached run exists and `force` is not set.

## 11.3 Internal Action

```text
refreshOpenMeteoTelemetryInternal
```

Used by Convex cron. This wraps the same refresh implementation but is internal so scheduled backend work does not depend on public action references.

## 11.4 Internal Mutation

```text
storeTelemetry
```

Writes:

- one `weatherFetches` row;
- one `weatherNationalSeries` row;
- one `weatherRegionalSeries` row per location;
- one `weatherCurrentByLocation` row per location.

---

## 12. HTTP API

Implemented in:

```text
convex/http.ts
```

## 12.1 Latest / Selected Telemetry

```text
GET /weather/open-meteo/latest
```

Optional parameters:

```text
fetchId=...
asOf=2026-04-29T09:30:00.000Z
includeRegional=true
locationId=athens
refresh=true
force=true
forecastSteps=96
pastSteps=4
maxAgeMinutes=30
```

Despite the path name, this endpoint can select a specific fetch or as-of point. It is retained as a broad hydration endpoint.

## 12.2 Catalog

```text
GET /weather/open-meteo/catalog
```

Optional parameters:

```text
fetchId=...
asOf=...
includeRecentFetches=true
fetchLimit=24
```

## 12.3 Current Conditions

```text
GET /weather/open-meteo/current
```

Examples:

```text
/weather/open-meteo/current?locationIds=athens
/weather/open-meteo/current?locationIds=athens,crete&variables=temperature_2m,wind_speed_10m
/weather/open-meteo/current?asOf=2026-04-29T09:30:00.000Z&group=overview
```

## 12.4 Time Series

```text
GET /weather/open-meteo/series
```

Examples:

```text
/weather/open-meteo/series?scope=national&group=solar
/weather/open-meteo/series?scope=national&group=solar&start=2026-04-29T12:00&end=2026-04-29T15:00
/weather/open-meteo/series?scope=regional&locationId=athens&variables=temperature_2m,shortwave_radiation
/weather/open-meteo/series?fetchId=...&scope=national&group=wind&limit=96
/weather/open-meteo/series?asOf=2026-04-29T09:30:00.000Z&scope=national&group=overview
```

## 12.5 Fetch History

```text
GET /weather/open-meteo/fetches
```

Optional parameters:

```text
limit=24
startFetchedAtUtc=2026-04-29T00:00:00.000Z
endFetchedAtUtc=2026-04-30T00:00:00.000Z
```

## 12.6 Coverage

```text
GET /weather/open-meteo/coverage
```

Returns latest and oldest cached run metadata.

## 12.7 Forecast-Run Comparison

```text
GET /weather/open-meteo/runs
```

Examples:

```text
/weather/open-meteo/runs?timestamp=2026-04-29T12:00&group=overview&fetchLimit=12
/weather/open-meteo/runs?timestamp=2026-04-29T12:00&scope=regional&locationId=athens&variables=temperature_2m,shortwave_radiation
```

This returns the value for the same forecast timestamp across cached forecast runs.

## 12.8 Convenience Panel

```text
GET /weather/open-meteo/panel
```

Optional parameters:

```text
fetchId=...
asOf=...
```

The panel route is a convenience endpoint for fast dashboard assembly. It should not be the only frontend data source.

## 12.9 Manual Refresh

```text
POST /weather/open-meteo/refresh
```

Body:

```json
{
  "force": true,
  "forecastSteps": 96,
  "pastSteps": 4,
  "maxAgeMinutes": 30
}
```

---

## 13. Dashboard Composition

The dashboard should compose weather panels from granular endpoints:

## 13.1 Weather Overview Panel

Use:

```text
GET /weather/open-meteo/catalog?includeRecentFetches=true
GET /weather/open-meteo/current?group=overview
GET /weather/open-meteo/series?scope=national&group=overview&start=...&end=...
```

Show:

- selected fetch timestamp;
- data freshness;
- current conditions by region;
- national overview chart;
- quick links to solar, wind, load-weather, and precipitation-risk views.

## 13.2 Solar Panel

Use:

```text
GET /weather/open-meteo/series?scope=national&group=solar&start=...&end=...
```

Optionally compare regional profiles:

```text
GET /weather/open-meteo/series?scope=regional&locationId=crete&group=solar&start=...&end=...
```

Show:

- shortwave radiation;
- DNI;
- diffuse radiation;
- cloud cover by layer;
- solar availability score.

## 13.3 Wind Panel

Use:

```text
GET /weather/open-meteo/series?scope=national&group=wind&start=...&end=...
```

Show:

- 10m and 80m wind speed;
- wind direction;
- gusts;
- wind generation proxy.

## 13.4 Load Weather Panel

Use:

```text
GET /weather/open-meteo/series?scope=national&group=loadWeather&start=...&end=...
```

Show:

- temperature;
- apparent temperature;
- relative humidity;
- weather demand stress.

## 13.5 Forecast Stability Panel

Use:

```text
GET /weather/open-meteo/runs?timestamp=...&group=overview&fetchLimit=12
```

Show how a target interval changed across recent Open-Meteo fetches. This is useful for uncertainty and confidence displays.

---

## 14. Implementation Notes

## 14.1 Why Run-Level Storage Matters

Storing only the latest weather series would make the backend simpler, but it would prevent:

- forecast-drift analysis;
- "what did the dashboard know at 09:30?" reconstruction;
- debugging changed recommendations;
- model-feature backtesting against available-at-time forecasts;
- confidence metrics based on forecast stability.

Therefore every scheduled refresh creates a new cached run.

## 14.2 Why Rows Are Stored as Arrays

For MVP, each fetch stores about 100 points per series. Storing one Convex document per timestamp would create many documents per refresh without providing much benefit yet.

The current row-array design is practical for:

- small forecast windows;
- dashboard chart reads;
- hackathon-scale local deployment;
- fast implementation.

If retention grows or windows expand substantially, split rows into per-timestamp documents with indexes:

```ts
["fetchId", "timestamp"]
["locationId", "timestamp"]
["timestamp"]
```

## 14.3 Why `panel` Is Not the Core API

The frontend needs flexibility:

- arbitrary periods;
- selected fetches;
- specific variables;
- regional drilldowns;
- run comparison;
- raw table views.

A single panel-shaped response cannot cover those needs. The panel endpoint is retained only as a convenience shape for a quick default weather card.

---

## 15. Validation

The implementation was validated with:

```bash
npm run typecheck
npx convex dev --once --typecheck disable
npx convex run openMeteo:listWeatherFetches '{"limit":5}'
npx convex run openMeteo:getWeatherCoverage '{}'
npx convex run openMeteo:compareWeatherRuns '{"timestamp":"2026-04-29T12:00","group":"overview","fetchLimit":5}'
```

HTTP routes were smoke-tested against the local Convex site proxy:

```bash
GET /weather/open-meteo/fetches?limit=3
GET /weather/open-meteo/series?asOf=2026-04-29T09:30:00.000Z&scope=national&group=solar&start=2026-04-29T12:00&end=2026-04-29T12:30
GET /weather/open-meteo/runs?timestamp=2026-04-29T12:00&group=overview&fetchLimit=3
```

Observed local data after the first fetch:

- 1 cached fetch run;
- 7 representative locations;
- 100 national 15-minute points;
- first forecast timestamp: `2026-04-29T11:15`;
- last forecast timestamp: `2026-04-30T12:00`.

---

## 16. Next Steps

Recommended next work:

1. Add retention pruning, for example keep 7-14 days of 15-minute fetch runs.
2. Add historical forecast API ingestion for model training.
3. Add Open-Meteo model/provider metadata if we need model-comparison views.
4. Replace static location weights with load, solar, and wind capacity weights.
5. Add forecast stability scores derived from `compareWeatherRuns`.
6. Feed weather variables and derived scores into the Signal Engine table once DAM/IPTO data is normalized.
7. Add auth/rate limits before exposing public production HTTP routes.
