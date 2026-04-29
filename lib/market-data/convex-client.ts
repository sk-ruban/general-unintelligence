"use client";

import { DateTime } from "luxon";
import { athensLabelFromUtc, MARKET_TIME_ZONE } from "@/lib/market-time";
import type { DamPricePoint, DataHealth } from "@/lib/types";
import type { MarketDataApi } from "./types";

type DamCatalogResponse = {
  coverage?: {
    firstDate?: string | null;
    lastDate?: string | null;
    marketDates?: number;
    sources?: Record<string, { rows?: number }>;
  };
};

type ConvexDamPriceRow = {
  marketDate?: string;
  timestamp?: string;
  timestampUtc?: string;
  mtu?: number;
  mcpEurPerMwh?: number;
  totalTrades?: number | null;
  pubTime?: string;
  publishedAtLocal?: string;
  version?: number | null;
  sourceFile?: string;
};

type DamPricesResponse = {
  count?: number;
  rows?: ConvexDamPriceRow[];
};

const MAX_PRICE_QUERY_DAYS = 45;

export function createConvexMarketDataClient(siteUrl: string): MarketDataApi {
  const baseUrl = siteUrl.replace(/\/$/, "");
  let catalog: DamCatalogResponse | null = null;

  async function loadCatalog() {
    catalog ??= await fetchJson<DamCatalogResponse>(`${baseUrl}/market/dam/catalog`);
    return catalog;
  }

  return {
    async initializeMarketDb() {
      const loadedCatalog = await loadCatalog();
      return healthFromCatalog(loadedCatalog);
    },
    async getAvailableMarketDays() {
      const loadedCatalog = await loadCatalog();
      return marketDaysFromCatalog(loadedCatalog);
    },
    async getDamPriceSeries(dayRange = {}) {
      const ranges = splitDateRange(dayRange.from, dayRange.to);
      const responses = await Promise.all(
        ranges.map((range) => fetchJson<DamPricesResponse>(priceUrl(baseUrl, range.from, range.to))),
      );
      return responses
        .flatMap((response) => response.rows ?? [])
        .map(priceFromConvexRow)
        .filter((point): point is DamPricePoint => point !== null)
        .sort((a, b) => a.interval.timestampUtc.localeCompare(b.interval.timestampUtc));
    },
    async getCurveSlice() {
      return [];
    },
    async getDataHealth() {
      const loadedCatalog = await loadCatalog();
      return healthFromCatalog(loadedCatalog);
    },
  };
}

export function splitDateRange(from: string | undefined, to: string | undefined) {
  if (!from || !to) {
    return [{ from, to }];
  }

  const start = DateTime.fromISO(from, { zone: MARKET_TIME_ZONE }).startOf("day");
  const end = DateTime.fromISO(to, { zone: MARKET_TIME_ZONE }).startOf("day");
  if (!start.isValid || !end.isValid || start > end) {
    return [{ from, to }];
  }

  const ranges: Array<{ from: string; to: string }> = [];
  for (let cursor = start; cursor <= end; cursor = cursor.plus({ days: MAX_PRICE_QUERY_DAYS })) {
    const chunkEnd = DateTime.min(cursor.plus({ days: MAX_PRICE_QUERY_DAYS - 1 }), end);
    const chunkFrom = cursor.toISODate();
    const chunkTo = chunkEnd.toISODate();
    if (chunkFrom && chunkTo) {
      ranges.push({ from: chunkFrom, to: chunkTo });
    }
  }
  return ranges.length > 0 ? ranges : [{ from, to }];
}

export function marketDaysFromCatalog(catalog: DamCatalogResponse) {
  const firstDate = catalog.coverage?.firstDate;
  const lastDate = catalog.coverage?.lastDate;
  if (!firstDate || !lastDate) {
    return [];
  }

  const first = DateTime.fromISO(firstDate, { zone: MARKET_TIME_ZONE }).startOf("day");
  const last = DateTime.fromISO(lastDate, { zone: MARKET_TIME_ZONE }).startOf("day");
  if (!first.isValid || !last.isValid || first > last) {
    return [];
  }

  const days: string[] = [];
  for (let cursor = first; cursor <= last; cursor = cursor.plus({ days: 1 })) {
    const day = cursor.toISODate();
    if (day) {
      days.push(day);
    }
  }
  return days;
}

export function priceFromConvexRow(row: ConvexDamPriceRow): DamPricePoint | null {
  if (
    typeof row.marketDate !== "string" ||
    typeof row.mtu !== "number" ||
    typeof row.mcpEurPerMwh !== "number"
  ) {
    return null;
  }

  const timestampUtc = utcTimestampFromConvexRow(row);
  if (!timestampUtc) {
    return null;
  }

  return {
    interval: {
      marketDate: row.marketDate,
      mtu: row.mtu,
      timestampUtc,
      athensLabel: athensLabelFromUtc(timestampUtc),
    },
    mcpEurPerMwh: row.mcpEurPerMwh,
    totalTrades: row.totalTrades ?? null,
    publishedAtLocal: row.publishedAtLocal ?? row.pubTime ?? "",
    version: row.version ?? null,
    sourceFile: row.sourceFile ?? "convex-dam",
  };
}

function priceUrl(baseUrl: string, from: string | undefined, to: string | undefined) {
  const url = new URL(`${baseUrl}/market/dam/prices`);
  if (from) url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);
  url.searchParams.set("limit", "20000");
  return url.toString();
}

function healthFromCatalog(catalog: DamCatalogResponse): DataHealth {
  const sourceRows = Object.values(catalog.coverage?.sources ?? {}).reduce(
    (total, source) => total + (source.rows ?? 0),
    0,
  );
  return {
    mode: "convex",
    priceRows: sourceRows || (catalog.coverage?.marketDates ? catalog.coverage.marketDates * 96 : 0),
    curveRows: 0,
    firstMarketDate: catalog.coverage?.firstDate ?? null,
    lastMarketDate: catalog.coverage?.lastDate ?? null,
    generatedAtUtc: null,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

function utcTimestampFromConvexRow(row: ConvexDamPriceRow) {
  const timestamp = row.timestampUtc ?? row.timestamp;
  if (!timestamp) {
    return null;
  }
  const parsed = DateTime.fromISO(timestamp, { setZone: true });
  if (!parsed.isValid) {
    return null;
  }
  return parsed.toUTC().toISO({ suppressMilliseconds: true });
}
