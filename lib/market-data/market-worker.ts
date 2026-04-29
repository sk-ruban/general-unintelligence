import * as Comlink from "comlink";
import type { AggregatedCurvePoint, DamPricePoint, DataHealth } from "@/lib/types";
import { curveFromRaw, healthFromManifest, priceFromRaw } from "./normalize";
import type { DayRange, RawCurveRow, RawPriceRow, StaticManifest } from "./types";

let mode: DataHealth["mode"] = "json-fallback";
let db: any = null;
let conn: any = null;
let prices: RawPriceRow[] = [];
let curves: RawCurveRow[] = [];
let manifest: StaticManifest | null = null;

const api = {
  async initializeMarketDb(): Promise<DataHealth> {
    const [jsonPrices, jsonCurves, loadedManifest] = await Promise.all([
      loadJson<RawPriceRow[]>("/data/dam/dam_prices.json"),
      loadJson<RawCurveRow[]>("/data/dam/dam_curves_sample.json"),
      loadJson<StaticManifest>("/data/dam/dam_static_manifest.json"),
    ]);
    prices = jsonPrices;
    curves = jsonCurves;
    manifest = loadedManifest;

    try {
      const duckdb = await import("@duckdb/duckdb-wasm");
      const bundles = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(bundles);
      if (!bundle.mainWorker || !bundle.mainModule) {
        throw new Error("DuckDB bundle did not include worker/module URLs.");
      }
      const worker = new Worker(bundle.mainWorker);
      const logger = new duckdb.ConsoleLogger();
      db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      conn = await db.connect();
      await db.registerFileURL(
        "dam_prices.parquet",
        "/data/dam/dam_prices.parquet",
        duckdb.DuckDBDataProtocol.HTTP,
        false,
      );
      await db.registerFileURL(
        "dam_curves.parquet",
        "/data/dam/dam_curves.parquet",
        duckdb.DuckDBDataProtocol.HTTP,
        false,
      );
      await queryRows("select count(*) as count from read_parquet('dam_prices.parquet')");
      mode = "duckdb";
    } catch (error) {
      console.warn("DuckDB-WASM unavailable; using JSON fallback.", error);
      mode = "json-fallback";
    }

    return healthFromManifest(loadedManifest, mode);
  },

  async getAvailableMarketDays(): Promise<string[]> {
    if (mode === "duckdb" && conn) {
      const rows = await queryRows(
        "select distinct market_date from read_parquet('dam_prices.parquet') order by 1",
      );
      return rows.map((row: any) => String(row.market_date));
    }
    return [...new Set(prices.map((row) => row.market_date))].sort();
  },

  async getDamPriceSeries(dayRange: DayRange = {}): Promise<DamPricePoint[]> {
    if (mode === "duckdb" && conn) {
      const { params, where } = duckRangeWhere(dayRange);
      const rows = await queryPreparedRows(
        `select * from read_parquet('dam_prices.parquet') ${where} order by market_date, mtu`,
        params,
      );
      return rows.map((row) => priceFromRaw(row as RawPriceRow));
    }
    return prices
      .filter((row) => inRange(row.market_date, dayRange))
      .map(priceFromRaw)
      .sort((a, b) => a.interval.timestampUtc.localeCompare(b.interval.timestampUtc));
  },

  async getCurveSlice(marketDate: string, mtu: number): Promise<AggregatedCurvePoint[]> {
    const safeMarketDate = assertMarketDate(marketDate);
    const safeMtu = assertMtu(mtu);
    if (mode === "duckdb" && conn) {
      let rows = await queryPreparedRows(
        "select * from read_parquet('dam_curves.parquet') where market_date = ? and mtu = ? order by side, curve_order",
        [safeMarketDate, safeMtu],
      );
      if (rows.length === 0) {
        rows = await queryPreparedRows(
          "select * from read_parquet('dam_curves.parquet') where market_date = ? order by mtu, side, curve_order limit 1000",
          [safeMarketDate],
        );
      }
      return rows.map((row) => curveFromRaw(row as RawCurveRow));
    }
    const exact = curves.filter((row) => row.market_date === marketDate && Number(row.mtu) === mtu);
    const sameMtu = curves.filter((row) => Number(row.mtu) === mtu);
    const sameDay = curves.filter((row) => row.market_date === marketDate);
    const fallback = exact.length > 0 ? exact : sameMtu.length > 0 ? sameMtu : sameDay;
    return fallback
      .map(curveFromRaw)
      .sort((a, b) => a.side.localeCompare(b.side) || a.curveOrder - b.curveOrder);
  },

  async getDataHealth(): Promise<DataHealth> {
    if (!manifest) {
      return await api.initializeMarketDb();
    }
    return healthFromManifest(manifest, mode);
  },
};

async function queryRows(sql: string) {
  const table = await conn.query(sql);
  return tableToRows(table);
}

async function queryPreparedRows(sql: string, params: unknown[]) {
  const statement = await conn.prepare(sql);
  try {
    const table = await statement.query(...params);
    return tableToRows(table);
  } finally {
    await statement.close();
  }
}

function tableToRows(table: {
  schema: { fields: { name: string }[] };
  toArray: () => Record<string, unknown>[];
}) {
  const fields = table.schema.fields.map((field: { name: string }) => field.name);
  return table.toArray().map((row: Record<string, unknown>) => {
    const normalized: Record<string, unknown> = {};
    for (const field of fields) {
      normalized[field] = row[field];
    }
    return normalized;
  });
}

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return (await response.json()) as T;
}

function duckRangeWhere(dayRange: DayRange) {
  const parts: string[] = [];
  const params: string[] = [];
  if (dayRange.from) {
    parts.push("market_date >= ?");
    params.push(assertMarketDate(dayRange.from));
  }
  if (dayRange.to) {
    parts.push("market_date <= ?");
    params.push(assertMarketDate(dayRange.to));
  }
  return { params, where: parts.length > 0 ? `where ${parts.join(" and ")}` : "" };
}

function inRange(marketDate: string, dayRange: DayRange) {
  if (dayRange.from && marketDate < dayRange.from) return false;
  if (dayRange.to && marketDate > dayRange.to) return false;
  return true;
}

function assertMarketDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid marketDate: ${value}`);
  }
  return value;
}

function assertMtu(value: number) {
  const mtu = Number(value);
  if (!Number.isInteger(mtu) || mtu < 1 || mtu > 100) {
    throw new Error(`Invalid MTU: ${value}`);
  }
  return mtu;
}

Comlink.expose(api);

export type MarketWorkerApi = typeof api;
