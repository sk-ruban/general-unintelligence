# DAM Convex Data Backend Design

## Context

The repository now contains a local ENEX/HEnEx Day-Ahead Market dataset under `data/dam/`, plus `docs/dam-data-guide.md` explaining the folder structure, source streams, and file-level manifests.

The dashboard should not treat DAM as a latest-only feed. The DAM data is historical, multi-stream, and queryable across market dates, market time units, source families, sides, bidding zones, assets, classifications, interconnectors, and publication versions. Convex should expose that flexibility directly, then provide latest/dashboard endpoints as convenience views on top.

## Product Goal

Turn ENEX DAM publications into a queryable Convex-backed market data layer for the Battery Intelligence OS dashboard.

The backend should support:

- Historical date ranges, not only latest values.
- 15-minute MTU queries for prices, volumes, curves, block orders, nominations, and market coupling.
- Source transparency from ENEX file to parsed Convex row.
- Idempotent reseeding from local cleaned data.
- A later automated sync path that fetches, transforms, and pushes new ENEX data into Convex.
- Battery-relevant derived endpoints, especially spread, volatility, market curve fragility, block order pressure, and coupling context.

## Data Flow

```text
ENEX DAM publications page
  -> scripts/pull_enex_dam_data.py
  -> data/dam/ raw XLSX/PDF files + manifest.json/csv
  -> local transform/seed script
  -> cleaned canonical rows
  -> Convex tables
  -> Convex queries and HTTP routes
  -> dashboard and agent workflows
```

The immediate implementation should seed from local data. Convex actions should not be responsible for parsing local repository files in production.

## Source Streams

Initial DAM streams to support:

| Folder | Source code | Primary use |
| --- | --- | --- |
| `results/` | `Results` | Final DAM prices, traded volume, asset/classification-level cleared outcomes. |
| `aggr_curves/` | `AggrCurves` | Aggregated buy/sell curve depth for fragility/liquidity analysis. |
| `blkordrs/` | `BLKORDRs` | Block order acceptance/status and matched-vs-submitted block volume. |
| `prelim_results/` | `PrelimResults` | Preliminary market coupling prices, net positions, and cross-border flows. |
| `results_summary/` | `ResultsSummary` | Dashboard-friendly buy/sell summary and market coupling workbook data. |
| `ndps/` | `NDPS` | Forward net delivery/offtake position totals. |
| `posno_ms/` | `POSNOMs` | Forward net delivery/offtake nominations by asset/classification/MTU. |
| `pre_market_summary/` | `PreMarketSummary` | Pre-market context and feature inputs. |
| `mwo/` | `MWO` | Human-readable PDF outlooks, initially catalog/file metadata only. |

## Convex Schema

Use normalized tables where the dashboard needs fast filtering. Keep original parsed rows in `row: v.any()` so the first implementation preserves all ENEX fields without over-designing every column.

Do not seed every raw row from every DAM source into Convex. The local `data/dam/` folder is the raw historical archive. Convex should contain the subset and derived views that the dashboard needs for fast interaction.

Recommended tables:

```ts
damIngestRuns
damFiles
damMarketResults
damAggregatedCurves
damBlockOrders
damForwardPositions
damForwardNominations
damPreMarketSummaries
damPrelimCouplingPrices
damPrelimCouplingFlows
damResultsSummaries
```

### Common File Metadata

`damFiles` should be the lineage and idempotency anchor.

```ts
damFiles: defineTable({
  sourceCode: v.string(),
  sourceTitle: v.string(),
  marketDate: v.string(),
  filename: v.string(),
  extension: v.string(),
  sourceUrl: v.string(),
  localPath: v.string(),
  bytes: v.number(),
  sha256: v.string(),
  parsedAtUtc: v.optional(v.string()),
  rowCount: v.optional(v.number()),
  status: v.string(),
  errors: v.optional(v.any()),
})
  .index("by_source_date", ["sourceCode", "marketDate"])
  .index("by_sha256", ["sha256"])
  .index("by_filename", ["filename"])
```

### Common Row Fields

Most parsed rows should include:

```ts
{
  marketDate: string;
  timestamp: string;       // ISO timestamp for the MTU
  mtu: number;             // 1..96 normally
  sourceCode: string;
  sourceFile: string;
  version?: number;
  sheetName?: string;
  rowHash: string;
  row: Record<string, unknown>;
}
```

Important indexes:

- `by_date_mtu`: `["marketDate", "mtu"]`
- `by_date`: `["marketDate"]`
- `by_file`: `["sourceFile"]`
- Stream-specific indexes where needed, such as side, bidding zone, classification, or interconnector.

## Ingestion Scripts

Add two scripts.

### `scripts/seed_dam_to_convex.py`

Purpose: one-time or repeatable local seed from existing `data/dam/`.

Responsibilities:

1. Read `data/dam/manifest.json`.
2. For each selected source file, check whether its `sha256` already exists in `damFiles`.
3. Parse XLSX files into cleaned canonical rows.
4. Normalize:
   - `marketDate`
   - `timestamp`
   - `mtu`
   - numeric values
   - side labels
   - bidding zone/interconnector fields
   - source metadata
5. Push rows to Convex in batches.
6. Record `damIngestRuns` and `damFiles` statuses.
7. Make reseeding idempotent using `sha256` plus row-level hashes.

Recommended CLI:

```bash
python3 scripts/seed_dam_to_convex.py \
  --from 2026-01-01 \
  --to 2026-04-30 \
  --sources Results,AggrCurves,BLKORDRs,PrelimResults,ResultsSummary \
  --batch-size 500
```

### `scripts/sync_dam_to_convex.py`

Purpose: repeatable sync agent for fresh ENEX data.

Responsibilities:

1. Run `scripts/pull_enex_dam_data.py`.
2. Compare new manifest entries against Convex `damFiles`.
3. Parse and push only new or changed files.
4. Print a clear ingest summary.
5. Exit nonzero on parse/push failure.

Recommended CLI:

```bash
python3 scripts/sync_dam_to_convex.py --sources Results,AggrCurves,BLKORDRs,PrelimResults
```

## Convex Functions

Add `convex/dam.ts` with public queries, internal mutations, and optional actions.

Public queries:

```ts
getDamCatalog
getDamFiles
getDamPrices
getDamMarketResults
getDamAggregatedCurves
getDamBlockOrders
getDamForwardPositions
getDamForwardNominations
getDamPrelimCouplingPrices
getDamPrelimCouplingFlows
getDamResultsSummary
getDamDashboard
getDamBatterySignals
```

Internal mutations:

```ts
storeDamFileBatch
storeDamMarketResultsBatch
storeDamAggregatedCurvesBatch
storeDamBlockOrdersBatch
storeDamForwardPositionsBatch
storeDamForwardNominationsBatch
storeDamPrelimCouplingBatch
storeDamResultsSummaryBatch
recordDamIngestRun
```

Useful action:

```ts
refreshDamFromRemoteManifest
```

This action can exist later if cleaned rows are hosted somewhere reachable. The first implementation should use local seed scripts.

## HTTP Routes

Add flexible routes in `convex/http.ts`.

```text
GET /market/dam/catalog
GET /market/dam/files?source=Results&from=2026-01-01&to=2026-04-29
GET /market/dam/results?from=2026-01-01&to=2026-04-29&mtu=48&side=Sell
GET /market/dam/prices?from=2026-01-01&to=2026-04-29
GET /market/dam/curves?date=2026-04-29&mtu=48&side=Buy
GET /market/dam/block-orders?from=2026-01-01&to=2026-04-29
GET /market/dam/forward-positions?from=2026-01-01&to=2026-04-29
GET /market/dam/nominations?from=2026-01-01&to=2026-04-29
GET /market/dam/coupling/prices?from=2026-01-01&to=2026-04-29
GET /market/dam/coupling/flows?from=2026-01-01&to=2026-04-29
GET /market/dam/dashboard?from=2026-01-01&to=2026-04-29
GET /market/dam/battery-signals?from=2026-01-01&to=2026-04-29
```

`latest` routes can be added later as aliases, but the core API should be range-first.

## Dashboard-Oriented Responses

The dashboard should not have to assemble every chart from raw rows. Provide a dashboard endpoint that returns pre-shaped series:

```ts
{
  range: { from, to },
  coverage: {
    marketDates: number;
    missingDates: string[];
    sources: Record<string, { files: number; firstDate: string; lastDate: string }>;
  },
  priceSeries: Array<{ timestamp: string; mtu: number; mcpEurPerMwh: number }>,
  spreadSummary: {
    minPrice: number;
    maxPrice: number;
    averagePrice: number;
    dailySpread: number;
    volatility: number;
  },
  volumeSeries: Array<{ timestamp: string; totalTradesMw: number }>,
  curveFragility: Array<{ timestamp: string; score: number; reason: string }>,
  blockOrderPressure: Array<{ timestamp: string; submittedMw: number; matchedMw: number; acceptanceRate: number }>,
  couplingContext: Array<{ timestamp: string; netPosition?: number; flows?: Record<string, number> }>
}
```

## Convex Seeding Policy

The archive pull can maintain full raw history locally, but Convex should be cost-aware:

| Dataset | Convex policy | Reason |
| --- | --- | --- |
| `results/` | Seed interval-level history across the useful archive range. | Final DAM prices and traded volumes are compact enough and are the core battery arbitrage signal. |
| `prelim_results/` | Seed interval-level coupling prices, net positions, and flows across the useful archive range. | Coupling context is compact and important for market-regime explanations. |
| `blkordrs/` | Seed aggregated date/MTU/side/classification rows, not every raw workbook artifact. | Useful for block-order pressure without excessive detail. |
| `results_summary/` | Seed dashboard-ready summary rows or daily aggregates. | Good for executive views and validation against full results. |
| `ndps/` and `posno_ms/` | Seed daily/MTU summaries when used by a dashboard card or feature. | Useful context, but lower priority than prices, curves, and coupling. |
| `pre_market_summary/` | Seed selected pre-market indicators only. | Keep as feature input, not broad raw row storage. |
| `mwo/` | Store catalog metadata only unless PDF extraction is explicitly needed. | PDFs are large and mostly human-readable outlook artifacts. |
| `aggr_curves/` | Seed only the last 7 days of raw curve points for frontend drill-down. For older history, seed derived date/MTU metrics only. | Full raw curves are too large: a single workbook can be roughly tens of thousands of rows, which becomes expensive across years. |

Recommended aggregate-curve derived metrics:

- buy/sell point counts by date and MTU
- min/max/median price by side
- min/max quantity by side
- approximate slope around the clearing price where joinable to `results/`
- liquidity depth near MCP bands, such as +/- 10 EUR/MWh and +/- 25 EUR/MWh
- curve fragility score
- curve gap or steepness flags

Recommended raw curve retention in Convex:

```text
AggrCurves raw points: last 7 market days only
AggrCurves derived metrics: full local archive range
```

The frontend can use the raw 7-day slice for detailed curve charts and use the full-history derived metrics for trend charts, volatility regimes, and battery signal explanations.

## Battery Signals Endpoint

Add one opinionated endpoint for the product narrative:

```text
GET /market/dam/battery-signals?from=2026-04-01&to=2026-04-29
```

Return interval-level and summary-level features:

```ts
{
  intervals: [
    {
      timestamp,
      mtu,
      price,
      spreadRank,
      chargeSignal,
      dischargeSignal,
      curveFragilityScore,
      blockOrderPressure,
      couplingFlowSignal,
      confidence
    }
  ],
  summary: {
    bestChargeWindows,
    bestDischargeWindows,
    dailySpread,
    dataFreshness,
    caveats
  }
}
```

This endpoint should be derived from stored DAM rows, not directly from raw files.

## Idempotency And Data Quality

Required safeguards:

- `damFiles.sha256` prevents reprocessing unchanged files.
- `rowHash` prevents duplicate rows inside repeated seed runs.
- Each ingest run records parsed file count, inserted row count, skipped row count, failed file count, and errors.
- Schema keeps `sourceFile`, `sourceCode`, and `sheetName` on every row.
- Date-range queries enforce bounded limits to protect Convex response size.
- HTTP endpoints return coverage/missingness metadata, not only data arrays.

## Implementation Phases

### Phase 1: Useful DAM Core

Implement:

- `damFiles`
- `damIngestRuns`
- `damMarketResults`
- `damAggregatedCurves`
- `scripts/seed_dam_to_convex.py`
- `/market/dam/catalog`
- `/market/dam/prices`
- `/market/dam/curves`
- `/market/dam/dashboard`

This unlocks DAM price history and market curve analysis.

### Phase 2: Battery-Relevant Market Structure

Add:

- `damBlockOrders`
- `damPrelimCouplingPrices`
- `damPrelimCouplingFlows`
- `/market/dam/block-orders`
- `/market/dam/coupling/prices`
- `/market/dam/coupling/flows`
- `/market/dam/battery-signals`

This unlocks fragility, block-order pressure, and cross-border market context.

### Phase 3: Full DAM Fabric

Add:

- `damForwardPositions`
- `damForwardNominations`
- `damPreMarketSummaries`
- `damResultsSummaries`
- `scripts/sync_dam_to_convex.py`

This completes the range-first DAM data layer and creates the recurring sync path.

## Open Questions

- Should seed scripts call Convex through `npx convex run` or the Convex HTTP/action API?
- Do we want row-level storage for every stream immediately, or catalog metadata for lower-priority streams until the UI needs them?
- Should timestamps be stored in Europe/Athens local offset, UTC, or both?
- What maximum default date range should dashboard endpoints allow before requiring pagination or aggregation?
- Should parsed cleaned rows also be written to `data/processed/dam/` as JSONL for reproducible review before seeding?
