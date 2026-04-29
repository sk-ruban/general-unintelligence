import { curveFromRaw, healthFromManifest } from "@/lib/market-data/normalize";
import type { RawCurveRow, StaticManifest } from "@/lib/market-data/types";
import type { AggregatedCurvePoint, DataHealth } from "@/lib/types";

let curveRows: RawCurveRow[] | null = null;
let manifest: StaticManifest | null = null;

export async function initializeJsonCurveData(): Promise<DataHealth> {
  const [curves, loadedManifest] = await Promise.all([
    loadJson<RawCurveRow[]>("/data/dam/dam_curves_sample.json"),
    loadJson<StaticManifest>("/data/dam/dam_static_manifest.json"),
  ]);

  curveRows = curves;
  manifest = loadedManifest;
  return healthFromManifest(loadedManifest, "json-fallback");
}

export async function getJsonCurveDays() {
  await ensureJson();
  return [...new Set((curveRows ?? []).map((row) => row.market_date))].sort();
}

export async function getJsonCurveSlice(marketDate: string, mtu: number): Promise<AggregatedCurvePoint[]> {
  await ensureJson();
  return (curveRows ?? [])
    .filter((row) => row.market_date === marketDate && Number(row.mtu) === mtu)
    .map(curveFromRaw)
    .sort((a, b) => a.side.localeCompare(b.side) || a.curveOrder - b.curveOrder);
}

export async function getJsonCurveHealth(): Promise<DataHealth> {
  await ensureJson();
  if (!manifest) {
    throw new Error("Static DAM manifest failed to load.");
  }
  return healthFromManifest(manifest, "json-fallback");
}

async function ensureJson() {
  if (!curveRows || !manifest) {
    await initializeJsonCurveData();
  }
}

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return (await response.json()) as T;
}
