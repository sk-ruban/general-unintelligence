# DAM Convex Phase 1 Scratchpad

## Scope

Implement phase 1 backend steps 1-4:

- Add Convex DAM schema tables for file lineage, ingest runs, final market results, and aggregated curves.
- Add Convex DAM queries and ingest mutations.
- Add a local seed script for `data/dam/` XLSX files.
- Add HTTP routes for catalog, files, prices, results, curves, and dashboard payloads.

Stage 5 frontend work is intentionally out of scope for this pass.

## Progress

- [x] Inspected representative ENEX `Results` and `AggrCurves` workbooks.
- [x] Confirmed the workbooks contain full rows even though worksheet dimensions report `A1`.
- [x] Add schema tables.
- [x] Add Convex DAM module.
- [x] Add local seed script.
- [x] Add HTTP routes.
- [x] Validate parser dry run.
- [x] Validate TypeScript.

## Workbook Notes

`Results` header:

```text
TARGET, BIDDING_ZONE_DESCR, SIDE_DESCR, DDAY, ASSET_DESCR, CLASSIFICATION,
DELIVERY_MTU, DELIVERY_DURATION, SORT, MCP, TOTAL_TRADES, PUB_TIME, VER
```

`AggrCurves` header:

```text
TARGET, SIDE_DESCR, DDAY, DELIVERY_MTU, SORT, DELIVERY_DURATION, AA,
QUANTITY, UNITPRICE, PUB_TIME, VER
```

Parser requirement: stream XLSX XML directly or reset workbook dimensions. The seed script will use a dependency-free XLSX XML reader so normal `python3` works without `openpyxl`.

## Open Decisions

- Keep phase 1 tables aligned with the existing design doc: `damFiles`, `damIngestRuns`, `damMarketResults`, `damAggregatedCurves`.
- Use `rowHash` and `sha256` checks for idempotency. Convex has no uniqueness constraint, so ingest mutations check indexed hashes before inserting.
- Dashboard queries should be range-first but bounded to keep Convex responses manageable.

## Validation

- `./scripts/seed_dam_to_convex.py --dry-run --from 2026-04-29 --to 2026-04-29 --sources Results,AggrCurves --limit-files 2 --quiet`
  - Parsed 2 files and 22,320 rows.
  - Failed files: 0.
- `./scripts/seed_dam_to_convex.py --dry-run --from 2026-04-28 --to 2026-04-29 --sources Results,AggrCurves --limit-files 4 --quiet`
  - Parsed 4 files and 43,718 rows.
  - Failed files: 0.
- `npx convex codegen`
  - Completed successfully after adding DAM functions and schema.
- `npm run typecheck`
  - Passed.
- `python3 -m py_compile scripts/seed_dam_to_convex.py`
  - Passed.
- `npm run dam:seed -- --dry-run --from 2026-04-29 --to 2026-04-29 --sources Results --limit-files 1 --quiet`
  - Parsed 1 Results file and 1,617 rows through the package-script alias.
- `npx convex run --push dam:getDamCatalog '{"includeRecentFiles":false,"fileLimit":1}'`
  - Pushed the new local DAM functions and returned the new DAM route surface.
- `npx convex run --push dam:getDamDashboard '{"date":"2026-04-29"}'`
  - Returned the empty-data dashboard payload cleanly before seeding.

## Handoff Notes For Frontend Stage

- Frontend dashboard entry point should call `/market/dam/dashboard`.
- More detailed charts can use `/market/dam/prices`, `/market/dam/results`, and `/market/dam/curves`.
- Seed command for a local/dev deployment:

```bash
./scripts/seed_dam_to_convex.py \
  --from 2026-01-01 \
  --to 2026-04-29 \
  --sources Results,AggrCurves \
  --push
```

Equivalent package-script form:

```bash
npm run dam:seed -- \
  --from 2026-01-01 \
  --to 2026-04-29 \
  --sources Results,AggrCurves \
  --push
```

- `--push` is useful when `npx convex dev` is not already running with the latest local functions.
- Add `--prod` only when intentionally seeding production.
