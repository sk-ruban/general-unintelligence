import type { AggregatedCurvePoint, DamPricePoint, DataHealth } from "@/lib/types";
import type { RawCurveRow, RawPriceRow, StaticManifest } from "./types";

export function priceFromRaw(row: RawPriceRow): DamPricePoint {
  return {
    interval: {
      marketDate: row.market_date,
      mtu: Number(row.mtu),
      timestampUtc: row.timestamp_utc,
      athensLabel: row.delivery_mtu_local,
    },
    mcpEurPerMwh: Number(row.mcp_eur_per_mwh),
    totalTrades: row.total_trades === null ? null : Number(row.total_trades),
    publishedAtLocal: row.published_at_local,
    version: row.version === null ? null : Number(row.version),
    sourceFile: row.source_file,
  };
}

export function curveFromRaw(row: RawCurveRow): AggregatedCurvePoint {
  return {
    interval: {
      marketDate: row.market_date,
      mtu: Number(row.mtu),
      timestampUtc: row.timestamp_utc,
      athensLabel: row.delivery_mtu_local,
    },
    side: row.side,
    curveOrder: Number(row.curve_order),
    quantityMwh: Number(row.quantity_mwh),
    unitPriceEurPerMwh: Number(row.unit_price_eur_per_mwh),
    publishedAtLocal: row.published_at_local,
    version: row.version === null ? null : Number(row.version),
    sourceFile: row.source_file,
  };
}

export function healthFromManifest(manifest: StaticManifest, mode: DataHealth["mode"]): DataHealth {
  return {
    mode,
    priceRows: manifest.price_rows,
    curveRows: manifest.curve_rows,
    firstMarketDate: manifest.first_market_date,
    lastMarketDate: manifest.last_market_date,
    generatedAtUtc: manifest.generated_at_utc,
  };
}
