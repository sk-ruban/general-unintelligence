import type { AggregatedCurvePoint, DamPricePoint, DataHealth } from "@/lib/types";
import { curveFromRaw, healthFromManifest, priceFromRaw } from "./normalize";
import type { DayRange, RawCurveRow, RawPriceRow, StaticManifest } from "./types";

let priceRows: RawPriceRow[] | null = null;
let curveRows: RawCurveRow[] | null = null;
let manifest: StaticManifest | null = null;

export async function initializeJsonMarketData(): Promise<DataHealth> {
  const [prices, curves, loadedManifest] = await Promise.all([
    loadJson<RawPriceRow[]>("/data/dam/dam_prices.json"),
    loadJson<RawCurveRow[]>("/data/dam/dam_curves_sample.json"),
    loadJson<StaticManifest>("/data/dam/dam_static_manifest.json"),
  ]);

  priceRows = prices;
  curveRows = curves;
  manifest = loadedManifest;
  return healthFromManifest(loadedManifest, "json-fallback");
}

export async function getJsonMarketDays() {
  await ensureJson();
  return [...new Set((priceRows ?? []).map((row) => row.market_date))].sort();
}

export async function getJsonPriceSeries(dayRange: DayRange = {}): Promise<DamPricePoint[]> {
  await ensureJson();
  return (priceRows ?? [])
    .filter((row) => inRange(row.market_date, dayRange))
    .map(priceFromRaw)
    .sort((a, b) => a.interval.timestampUtc.localeCompare(b.interval.timestampUtc));
}

export async function getJsonCurveSlice(marketDate: string, mtu: number): Promise<AggregatedCurvePoint[]> {
  await ensureJson();
  const exact = (curveRows ?? []).filter((row) => row.market_date === marketDate && Number(row.mtu) === mtu);
  const sameMtu = (curveRows ?? []).filter((row) => Number(row.mtu) === mtu);
  const sameDay = (curveRows ?? []).filter((row) => row.market_date === marketDate);
  const fallback = exact.length > 0 ? exact : sameMtu.length > 0 ? sameMtu : sameDay;
  return fallback
    .map(curveFromRaw)
    .sort((a, b) => a.side.localeCompare(b.side) || a.curveOrder - b.curveOrder);
}

export async function getJsonDataHealth(): Promise<DataHealth> {
  await ensureJson();
  if (!manifest) {
    throw new Error("Static DAM manifest failed to load.");
  }
  return healthFromManifest(manifest, "json-fallback");
}

async function ensureJson() {
  if (!priceRows || !curveRows || !manifest) {
    await initializeJsonMarketData();
  }
}

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return (await response.json()) as T;
}

function inRange(marketDate: string, dayRange: DayRange) {
  if (dayRange.from && marketDate < dayRange.from) return false;
  if (dayRange.to && marketDate > dayRange.to) return false;
  return true;
}
