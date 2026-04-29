import type { AggregatedCurvePoint, DamPricePoint, DataHealth } from "@/lib/types";
import { curveFromRaw } from "./normalize";
import type { DayRange, MarketDataApi } from "./types";

type FallbackMarketDataApi = Pick<
  MarketDataApi,
  "getAvailableMarketDays" | "getCurveSlice" | "getDamPriceSeries" | "getDataHealth" | "initializeMarketDb"
>;

type ConvexPriceRow = {
  marketDate: string;
  timestamp: string;
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
        const days = uniqueSorted(
          (catalog.recentFiles ?? []).map((file) => file.marketDate).filter(isString),
        );
        if (days.length > 0) {
          return days;
        }
      } catch (error) {
        console.warn("Convex DAM catalog unavailable; using static market days.", error);
      }
      return await fallback.getAvailableMarketDays();
    },
    async getDamPriceSeries(dayRange: DayRange = {}) {
      try {
        const rows = await fetchConvexPrices(baseUrl, dayRange);
        if (rows.length > 0) {
          return rows;
        }
      } catch (error) {
        console.warn("Convex DAM prices unavailable; using static price series.", error);
      }
      return await fallback.getDamPriceSeries(dayRange);
    },
    async getCurveSlice(marketDate: string, mtu: number) {
      try {
        const curves = await fetchConvexCurves(baseUrl, marketDate, mtu);
        if (curves.length > 0) {
          return curves;
        }
      } catch (error) {
        console.warn("Convex DAM curves unavailable; using static curve sample.", error);
      }
      return await fallback.getCurveSlice(marketDate, mtu);
    },
    async getDataHealth() {
      try {
        return await getDataHealth();
      } catch (error) {
        console.warn("Convex DAM health unavailable; using static data health.", error);
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

async function fetchConvexPrices(baseUrl: string, dayRange: DayRange): Promise<DamPricePoint[]> {
  const json = await fetchConvexJson<{ rows?: ConvexPriceRow[] }>(baseUrl, "/market/dam/prices", dayRange);
  return (json.rows ?? [])
    .filter((row) => typeof row.mcpEurPerMwh === "number")
    .map(priceFromConvex)
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
  const url = new URL(path, `${baseUrl}/`);
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

function priceFromConvex(row: ConvexPriceRow): DamPricePoint {
  return {
    interval: {
      marketDate: row.marketDate,
      mtu: row.mtu,
      timestampUtc: row.timestamp,
      athensLabel: row.timestamp,
    },
    mcpEurPerMwh: row.mcpEurPerMwh ?? 0,
    totalTrades: row.totalTrades ?? null,
    publishedAtLocal: row.pubTime ?? "",
    version: row.version ?? null,
    sourceFile: row.sourceFile ?? "convex",
  };
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
