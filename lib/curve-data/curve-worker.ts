import * as Comlink from "comlink";
import { curveFromRaw, healthFromManifest } from "@/lib/market-data/normalize";
import type { RawCurveRow, StaticManifest } from "@/lib/market-data/types";
import type { AggregatedCurvePoint, DataHealth } from "@/lib/types";

let mode: DataHealth["mode"] = "json-fallback";
let db: any = null;
let conn: any = null;
let curves: RawCurveRow[] = [];
let manifest: StaticManifest | null = null;

const api = {
  async initializeCurveDb(): Promise<DataHealth> {
    const loadedManifest = await loadJson<StaticManifest>("/data/dam/dam_static_manifest.json");
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
        "dam_curves.parquet",
        "/data/dam/dam_curves.parquet",
        duckdb.DuckDBDataProtocol.HTTP,
        false,
      );
      await queryRows("select count(*) as count from read_parquet('dam_curves.parquet')");
      mode = "duckdb";
    } catch (error) {
      console.warn("DuckDB curve worker unavailable; using JSON curve fallback.", error);
      curves = await loadJson<RawCurveRow[]>("/data/dam/dam_curves_sample.json");
      mode = "json-fallback";
    }

    return healthFromManifest(loadedManifest, mode);
  },

  async getAvailableCurveDays(): Promise<string[]> {
    if (mode === "duckdb" && conn) {
      const rows = await queryRows(
        "select distinct market_date from read_parquet('dam_curves.parquet') order by 1",
      );
      return rows.map((row: any) => String(row.market_date));
    }
    return [...new Set(curves.map((row) => row.market_date))].sort();
  },

  async getCurveSlice(marketDate: string, mtu: number): Promise<AggregatedCurvePoint[]> {
    const safeMarketDate = assertMarketDate(marketDate);
    const safeMtu = assertMtu(mtu);
    if (mode === "duckdb" && conn) {
      const rows = await queryPreparedRows(
        "select * from read_parquet('dam_curves.parquet') where market_date = ? and mtu = ? order by side, curve_order",
        [safeMarketDate, safeMtu],
      );
      return rows.map((row) => curveFromRaw(row as RawCurveRow));
    }
    return curves
      .filter((row) => row.market_date === safeMarketDate && Number(row.mtu) === safeMtu)
      .map(curveFromRaw)
      .sort((a, b) => a.side.localeCompare(b.side) || a.curveOrder - b.curveOrder);
  },

  async getCurveHealth(): Promise<DataHealth> {
    if (!manifest) {
      return await api.initializeCurveDb();
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

export type CurveWorkerApi = typeof api;
