import { DateTime } from "luxon";
import type { CurveDataApi } from "@/lib/curve-data/types";
import { athensLabelFromUtc, MARKET_TIME_ZONE } from "@/lib/market-time";
import type { AggregatedCurvePoint, DamPricePoint, DataHealth } from "@/lib/types";
import { curveFromRaw } from "./normalize";
import type { DayRange, MarketDataApi } from "./types";

const MAX_PRICE_QUERY_DAYS = 45;

type FallbackMarketDataApi = Pick<
  MarketDataApi,
  "getAvailableMarketDays" | "getCurveSlice" | "getDamPriceSeries" | "getDataHealth" | "initializeMarketDb"
>;

type ConvexPriceRow = {
  marketDate: string;
  timestamp: string;
  timestampUtc?: string;
  mtu: number;
  mcpEurPerMwh?: number;
  totalTrades?: number;
  pubTime?: string;
  version?: number | null;
  sourceFile?: string;
};

type ConvexCatalog = {
  coverage?: {
    firstDate?: string | null;
    lastDate?: string | null;
    marketDates?: number;
    sources?: Record<string, { rows?: number; files?: number }>;
  };
  filesIndexed?: number;
  recentFiles?: { marketDate?: string }[];
};

type ConvexDashboard = {
  range?: { from?: string; to?: string };
  coverage?: ConvexCatalog["coverage"];
  priceSeries?: ConvexPriceRow[];
  curveFragility?: unknown[];
  summaryMode?: string;
};

type FallbackCurveDataApi = Pick<
  CurveDataApi,
  "getAvailableCurveDays" | "getCurveHealth" | "getCurveSlice" | "initializeCurveDb"
>;

export function createConvexHttpMarketDataClient(
  siteUrl: string,
  fallback: FallbackMarketDataApi,
): MarketDataApi {
  const baseUrl = siteUrl.replace(/\/+$/, "");

  return {
    async initializeMarketDb() {
      return await getDataHealth();
    },
    async getAvailableMarketDays() {
      try {
        const catalog = await fetchConvexJson<ConvexCatalog>(baseUrl, "/market/dam/catalog", {
          includeRecentFiles: "true",
          fileLimit: "1000",
        });
        const days =
          marketDaysFromCoverage(catalog.coverage) ??
          uniqueSorted((catalog.recentFiles ?? []).map((file) => file.marketDate).filter(isString));
        if (days.length > 0) {
          return days;
        }
      } catch {
        // Convex HTTP routes are optional in local dev; fall back to static data below.
      }
      return await fallback.getAvailableMarketDays();
    },
    async getDamPriceSeries(dayRange: DayRange = {}) {
      try {
        const rows = await fetchConvexPrices(baseUrl, dayRange);
        if (rows.length > 0) {
          return rows;
        }
      } catch {
        // Convex HTTP routes are optional in local dev; fall back to static data below.
      }
      return await fallback.getDamPriceSeries(dayRange);
    },
    async getCurveSlice(marketDate: string, mtu: number) {
      try {
        const curves = await fetchConvexCurves(baseUrl, marketDate, mtu);
        if (curves.length > 0) {
          return curves;
        }
      } catch {
        // Convex HTTP routes are optional in local dev; fall back to static data below.
      }
      return await fallback.getCurveSlice(marketDate, mtu);
    },
    async getDataHealth() {
      try {
        return await getDataHealth();
      } catch {
        // Convex HTTP routes are optional in local dev; fall back to static data below.
        return await fallback.getDataHealth();
      }
    },
  };

  async function getDataHealth(): Promise<DataHealth> {
    const [catalog, dashboard] = await Promise.all([
      fetchConvexJson<ConvexCatalog>(baseUrl, "/market/dam/catalog"),
      fetchConvexJson<ConvexDashboard>(baseUrl, "/market/dam/dashboard"),
    ]);
    const priceRows = rowCount(catalog.coverage) || dashboard.priceSeries?.length || 0;
    return {
      mode: "convex-http",
      priceRows,
      curveRows: Array.isArray(dashboard.curveFragility) ? dashboard.curveFragility.length : 0,
      firstMarketDate: catalog.coverage?.firstDate ?? dashboard.range?.from ?? null,
      lastMarketDate: catalog.coverage?.lastDate ?? dashboard.range?.to ?? null,
      generatedAtUtc: null,
    };
  }
}

export function createConvexHttpCurveDataClient(siteUrl: string, fallback: FallbackCurveDataApi): CurveDataApi {
  const baseUrl = siteUrl.replace(/\/+$/, "");

  return {
    async initializeCurveDb() {
      return await getCurveHealth();
    },
    async getAvailableCurveDays() {
      try {
        const catalog = await fetchConvexJson<ConvexCatalog>(baseUrl, "/market/dam/catalog");
        const days = marketDaysFromCoverage(catalog.coverage);
        if (days && days.length > 0) {
          return days;
        }
      } catch {
        // Convex HTTP routes are optional in local dev; fall back to static data below.
      }
      return await fallback.getAvailableCurveDays();
    },
    async getCurveSlice(marketDate: string, mtu: number) {
      try {
        const curves = await fetchConvexCurves(baseUrl, marketDate, mtu);
        if (curves.length > 0) {
          return curves;
        }
      } catch {
        // Convex may not serve raw curve rows; fall back to the bundled sample.
      }
      return await fallback.getCurveSlice(marketDate, mtu);
    },
    async getCurveHealth() {
      return await getCurveHealth();
    },
  };

  async function getCurveHealth(): Promise<DataHealth> {
    try {
      const [catalog, dashboard] = await Promise.all([
        fetchConvexJson<ConvexCatalog>(baseUrl, "/market/dam/catalog"),
        fetchConvexJson<ConvexDashboard>(baseUrl, "/market/dam/dashboard"),
      ]);
      return {
        mode: "convex-http",
        priceRows: rowCount(catalog.coverage) || dashboard.priceSeries?.length || 0,
        curveRows: Array.isArray(dashboard.curveFragility) ? dashboard.curveFragility.length : 0,
        firstMarketDate: catalog.coverage?.firstDate ?? dashboard.range?.from ?? null,
        lastMarketDate: catalog.coverage?.lastDate ?? dashboard.range?.to ?? null,
        generatedAtUtc: null,
      };
    } catch {
      return await fallback.getCurveHealth();
    }
  }
}

async function fetchConvexPrices(baseUrl: string, dayRange: DayRange): Promise<DamPricePoint[]> {
  if (dayRange.resolution === "daily-average") {
    try {
      return await fetchConvexPriceRange(baseUrl, dayRange);
    } catch {
      return await fetchConvexPriceChunks(baseUrl, {
        from: dayRange.from,
        to: dayRange.to,
        resolution: "interval",
      });
    }
  }
  return await fetchConvexPriceChunks(baseUrl, dayRange);
}

async function fetchConvexPriceRange(baseUrl: string, dayRange: DayRange): Promise<DamPricePoint[]> {
  const json = await fetchConvexJson<{ rows?: ConvexPriceRow[] }>(
    baseUrl,
    "/market/dam/prices",
    requestParams(dayRange),
  );
  return normalizePriceRows(json.rows ?? []);
}

async function fetchConvexPriceChunks(baseUrl: string, dayRange: DayRange): Promise<DamPricePoint[]> {
  const chunks = splitDateRange(dayRange.from, dayRange.to);
  const rows = await Promise.all(
    chunks.map((chunk) =>
      fetchConvexJson<{ rows?: ConvexPriceRow[] }>(baseUrl, "/market/dam/prices", requestParams(chunk)),
    ),
  );
  return normalizePriceRows(rows.flatMap((response) => response.rows ?? []));
}

function requestParams(dayRange: DayRange): Record<string, string | undefined> {
  return {
    from: dayRange.from,
    to: dayRange.to,
    resolution: dayRange.resolution,
    limit: "20000",
  };
}

function normalizePriceRows(rows: ConvexPriceRow[]) {
  return rows
    .filter((row) => typeof row.mcpEurPerMwh === "number")
    .map(priceFromConvex)
    .filter((point): point is DamPricePoint => point !== null)
    .sort((a, b) => a.interval.timestampUtc.localeCompare(b.interval.timestampUtc));
}

async function fetchConvexCurves(
  baseUrl: string,
  marketDate: string,
  mtu: number,
): Promise<AggregatedCurvePoint[]> {
  const json = await fetchConvexJson<{ rows?: unknown[] }>(baseUrl, "/market/dam/curves", {
    date: marketDate,
    mtu: String(mtu),
  });
  return (json.rows ?? []).map((row) => curveFromRaw(row as never));
}

async function fetchConvexJson<T>(
  baseUrl: string,
  path: string,
  params: Record<string, string | undefined> = {},
) {
  const url = convexHttpUrl(baseUrl, path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url.toString()} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

function convexHttpUrl(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\/+/, "");
  const href = `${normalizedBase}/${normalizedPath}`;
  if (/^https?:\/\//.test(href)) {
    return new URL(href);
  }
  if (typeof window !== "undefined") {
    return new URL(href, window.location.origin);
  }
  return new URL(href, "http://localhost");
}

function priceFromConvex(row: ConvexPriceRow): DamPricePoint | null {
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
    mcpEurPerMwh: row.mcpEurPerMwh ?? 0,
    totalTrades: row.totalTrades ?? null,
    publishedAtLocal: row.pubTime ?? "",
    version: row.version ?? null,
    sourceFile: row.sourceFile ?? "convex",
  };
}

function utcTimestampFromConvexRow(row: ConvexPriceRow) {
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

function rowCount(coverage: ConvexCatalog["coverage"]) {
  return Object.values(coverage?.sources ?? {}).reduce((sum, source) => sum + (source.rows ?? 0), 0);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort();
}

export function marketDaysFromCoverage(coverage: ConvexCatalog["coverage"]) {
  const firstDate = coverage?.firstDate;
  const lastDate = coverage?.lastDate;
  if (!firstDate || !lastDate) {
    return null;
  }
  const first = DateTime.fromISO(firstDate, { zone: MARKET_TIME_ZONE }).startOf("day");
  const last = DateTime.fromISO(lastDate, { zone: MARKET_TIME_ZONE }).startOf("day");
  if (!first.isValid || !last.isValid || first > last) {
    return null;
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
