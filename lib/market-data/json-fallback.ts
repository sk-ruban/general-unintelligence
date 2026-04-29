import type { DamPricePoint, DataHealth } from "@/lib/types";
import { healthFromManifest, priceFromRaw } from "./normalize";
import type { DayRange, RawPriceRow, StaticManifest } from "./types";

let priceRows: RawPriceRow[] | null = null;
let manifest: StaticManifest | null = null;

export async function initializeJsonMarketData(): Promise<DataHealth> {
  const [prices, loadedManifest] = await Promise.all([
    loadJson<RawPriceRow[]>("/data/dam/dam_prices.json"),
    loadJson<StaticManifest>("/data/dam/dam_static_manifest.json"),
  ]);

  priceRows = prices;
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

export async function getJsonDataHealth(): Promise<DataHealth> {
  await ensureJson();
  if (!manifest) {
    throw new Error("Static DAM manifest failed to load.");
  }
  return healthFromManifest(manifest, "json-fallback");
}

async function ensureJson() {
  if (!priceRows || !manifest) {
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
