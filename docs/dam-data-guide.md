# ENEX DAM Data Guide

This repository stores Day-Ahead Market (DAM) publications from HEnEx/ENEX under `data/dam/`. The data was discovered from the ENEX DAM publications page:

`https://www.enexgroup.gr/web/guest/markets-publications-el-day-ahead-market`

The puller in `scripts/pull_enex_dam_data.py` discovers each publication stream from that page's Liferay RSS endpoints, walks the paginated publication lists, downloads the linked files from ENEX's document library, validates the payload type, and writes manifests.

## Top-Level Layout

```text
data/dam/
  aggr_curves/          Aggregated anonymous buy/sell order curves
  blkordrs/             Block order acceptance/status summaries
  documentation/        ENEX PDF schema documentation for selected streams
  mwo/                  Day-Ahead Market Outlook PDF reports
  ndps/                 Forward net delivery/offtake position totals
  posno_ms/             Forward net delivery/offtake nominations
  pre_market_summary/   Pre-market report workbooks
  prelim_results/       Market coupling preliminary results
  results/              Final DAM market results
  results_summary/      Market report summary workbooks and charts
  manifest.csv          Flat inventory of downloaded data assets
  manifest.json         Full inventory of sources, files, docs, hashes, and URLs
```

Most files use the ENEX naming pattern:

`YYYYMMDD_EL-DAM_<SOURCE_CODE>_EN_vNN.<extension>`

`YYYYMMDD` is the market or publication date. `vNN` is the ENEX publication version for that date. XLSX files generally contain 15-minute market time unit data, so normal days have 96 intervals, with 92 or 100 intervals on daylight-saving transition days where applicable.

## Manifests

Use `manifest.json` as the canonical machine-readable index. It contains:

- `source_page`: the ENEX page used for discovery.
- `generated_at`: UTC generation timestamp.
- `sources`: source code, display title, extension, RSS endpoint, local folder, and discovered page count.
- `assets`: one record per downloaded data file, including source code, market date, filename, ENEX file URL, local path, byte size, and SHA-256 hash.
- `documentation`: one record per downloaded documentation PDF.

Use `manifest.csv` when you need a simple tabular inventory for ingestion checks, deduplication, lineage, or audit trails.

## Source Folders

| Folder | ENEX source code | Format | Current local coverage | What it provides | Typical uses |
| --- | --- | --- | --- | --- | --- |
| `ndps/` | `NDPS` | XLSX | 120 files, 2026-01-01 to 2026-04-30 | Forward net delivery/offtake position totals. Columns documented by ENEX include delivery date, positive deliveries and negative offtakes for OTC and exchange-traded contracts, publication time, and version. | Track forward position totals entering DAM, compare OTC vs exchange-traded exposure, reconcile pre-DAM positions against later nominations and final results. |
| `results/` | `Results` | XLSX | 119 files, 2026-01-01 to 2026-04-29 | Final DAM market results by bidding zone, side, asset/classification, market time unit, market clearing price, and traded volume. | Build cleared-volume and price time series, analyze load/supply/interconnector participation, backtest price models, validate settlement-facing DAM outputs. |
| `aggr_curves/` | `AggrCurves` | XLSX | 119 files, 2026-01-01 to 2026-04-29 | Aggregated anonymous buy/sell order curve points by market time unit. ENEX documentation includes side, quantity, unit price, curve point order, publication time, and version. | Reconstruct supply and demand curves, estimate curve steepness and liquidity, analyze price sensitivity, derive scarcity or congestion indicators. |
| `posno_ms/` | `POSNOMs` | XLSX | 120 files, 2026-01-01 to 2026-04-30 | Forward net delivery/offtake nominations by side, asset, classification, and market time unit. | Compare forward nominations with final DAM trades, profile load/supply nominations, inspect interconnector-related nominated volumes. |
| `pre_market_summary/` | `PreMarketSummary` | XLSX | 120 files, 2026-01-01 to 2026-04-30 | Pre-market report workbook. The sample workbook sheet is `Pre-Market Data`. | Use as a pre-clearing market context snapshot, feature source for forecasts, or input for comparing pre-market expectations against preliminary and final outcomes. |
| `prelim_results/` | `PrelimResults` | XLSX | 119 files, 2026-01-01 to 2026-04-29 | Market coupling preliminary results. Sample sheets are `SITE_BZ_NP_PRICES` and `SITE_PUBS_CBS_FLOWS`, covering bidding-zone net positions/prices and cross-border scheduled flows. | Analyze market coupling outputs before final publication, inspect cross-border flows, compare preliminary prices/net positions to final DAM results. |
| `mwo/` | `MWO` | PDF | 124 files, 2026-01-01 to 2026-04-29 | Day-Ahead Market Outlook report PDFs. Sample reports chart buy/sell outlook volumes by technology/load category, imports, BESS, renewables, hydro, and GR-MCP over market time units. | Human-readable daily outlook review, visual sanity checks, report extraction for dashboards, market narrative/context alongside structured XLSX data. |
| `results_summary/` | `ResultsSummary` | XLSX | 127 files, 2025-12-18 to 2026-04-29 | DAM market report summary workbook. Sample sheets include `SPOT_Summary (SELL)`, `SPOT_Summary (BUY)`, `MKT_Coupling`, and chart sheets. | Fast daily summary reporting, market coupling overview, buy/sell summary dashboards, analyst-facing extracts without processing the full result tables first. |
| `blkordrs/` | `BLKORDRs` | XLSX | 119 files, 2026-01-01 to 2026-04-29 | Block order acceptance/status summaries by bidding zone, side, classification, and market time unit. ENEX documentation includes total orders, total quantity, matched orders, and matched quantity. | Analyze block order acceptance rates, matched vs submitted block volume, block-order contribution by technology or side, and structural liquidity. |
| `documentation/` | Documentation PDFs | PDF | 6 files | ENEX schema documentation for `AggrCurves`, `BLKORDRs`, `NDPS`, `POSNOMs`, `PrelimResults`, and `Results`. These PDFs define expected fields, types, and direct automated download URL patterns where ENEX provides them. | Confirm column meanings and units, build typed ingestion schemas, validate downstream transforms, document data lineage. |

## Source Endpoints

Every stream was discovered from the main source page above through a Liferay RSS endpoint. Individual files were downloaded from ENEX document-library links shaped like:

`https://www.enexgroup.gr/c/document_library/get_file?uuid=<uuid>&groupId=20126`

The exact file URL for each downloaded asset is preserved in both manifests. The RSS endpoints used for source discovery are:

| Folder | Source code | RSS discovery endpoint |
| --- | --- | --- |
| `ndps/` | `NDPS` | `https://www.enexgroup.gr/web/guest/markets-publications-el-day-ahead-market?p_p_id=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_5OlL6oMjSb0W&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=getRSS&p_p_cacheability=cacheLevelPage` |
| `results/` | `Results` | `https://www.enexgroup.gr/web/guest/markets-publications-el-day-ahead-market?p_p_id=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_6eBaUXF5VIb7&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=getRSS&p_p_cacheability=cacheLevelPage` |
| `aggr_curves/` | `AggrCurves` | `https://www.enexgroup.gr/web/guest/markets-publications-el-day-ahead-market?p_p_id=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_diiPy4WUxUxt&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=getRSS&p_p_cacheability=cacheLevelPage` |
| `posno_ms/` | `POSNOMs` | `https://www.enexgroup.gr/web/guest/markets-publications-el-day-ahead-market?p_p_id=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_ZDVtst70K1IN&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=getRSS&p_p_cacheability=cacheLevelPage` |
| `pre_market_summary/` | `PreMarketSummary` | `https://www.enexgroup.gr/web/guest/markets-publications-el-day-ahead-market?p_p_id=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_b1cLreZjcqxn&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=getRSS&p_p_cacheability=cacheLevelPage` |
| `prelim_results/` | `PrelimResults` | `https://www.enexgroup.gr/web/guest/markets-publications-el-day-ahead-market?p_p_id=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_wR2jOMlI9ezo&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=getRSS&p_p_cacheability=cacheLevelPage` |
| `mwo/` | `MWO` | `https://www.enexgroup.gr/web/guest/markets-publications-el-day-ahead-market?p_p_id=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_XgYD8KFSgxoD&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=getRSS&p_p_cacheability=cacheLevelPage` |
| `results_summary/` | `ResultsSummary` | `https://www.enexgroup.gr/web/guest/markets-publications-el-day-ahead-market?p_p_id=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_9CZslwWTpeD2&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=getRSS&p_p_cacheability=cacheLevelPage` |
| `blkordrs/` | `BLKORDRs` | `https://www.enexgroup.gr/web/guest/markets-publications-el-day-ahead-market?p_p_id=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_eY8D7Gea43Hh&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=getRSS&p_p_cacheability=cacheLevelPage` |

## Direct URL Patterns From ENEX Documentation

The documentation PDFs include direct automated download patterns for several XLSX streams. Replace `YYYYMMDD` with the date and `v##` with the available ENEX version:

| Source code | Documented direct pattern |
| --- | --- |
| `AggrCurves` | `https://www.enexgroup.gr/documents/20126/200034/YYYYMMDD_EL-DAM_AggrCurves_EN_v##.xlsx` |
| `BLKORDRs` | `https://www.enexgroup.gr/documents/20126/270103/YYYYMMDD_EL-DAM_BLKORDRs_EN_v##.xlsx` |
| `NDPS` | `https://www.enexgroup.gr/documents/20126/348853/YYYYMMDD_EL-DAM_NDPS_EN_v##.xlsx` |
| `POSNOMs` | `https://www.enexgroup.gr/documents/20126/214481/YYYYMMDD_EL-DAM_POSNOMs_EN_v##.xlsx` |
| `Results` | `https://www.enexgroup.gr/documents/20126/200106/YYYYMMDD_EL-DAM_Results_EN_v##.xlsx` |

For the other streams, use the RSS discovery endpoint plus the per-file `url` values in `manifest.json` or `manifest.csv`.

## How To Navigate The Data

1. Start with `manifest.json` to identify the source code, date range, file URL, local path, and hash you need.
2. Use the folder name to choose the right level of market detail:
   - Curves and order behavior: `aggr_curves/`, `blkordrs/`
   - Forward positions and nominations: `ndps/`, `posno_ms/`
   - Pre-clearing context: `pre_market_summary/`
   - Market coupling: `prelim_results/`, `results_summary/`
   - Final cleared market: `results/`
   - Human-readable outlooks: `mwo/`
3. Use `documentation/` when a stream has a schema PDF. Those PDFs are the best source for field names, units, and ENEX data types.
4. Treat `market_date` in the manifest as the normalized date key for joins across folders.
5. Use `sha256` when verifying reproducibility or detecting changed upstream files.

