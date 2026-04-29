"use client";

import * as Comlink from "comlink";
import {
  getJsonCurveSlice,
  getJsonDataHealth,
  getJsonMarketDays,
  getJsonPriceSeries,
  initializeJsonMarketData,
} from "./json-fallback";
import type { MarketWorkerApi } from "./market-worker";
import type { MarketDataApi } from "./types";

let clientPromise: Promise<MarketDataApi> | null = null;

export function getMarketDataClient(): Promise<MarketDataApi> {
  clientPromise ??= createClient();
  return clientPromise;
}

async function createClient(): Promise<MarketDataApi> {
  if (typeof Worker === "undefined") {
    return jsonClient;
  }

  try {
    const worker = new Worker(new URL("./market-worker.ts", import.meta.url), { type: "module" });
    const remote = Comlink.wrap<MarketWorkerApi>(worker);
    await remote.initializeMarketDb();
    return remote;
  } catch (error) {
    console.warn("Market worker failed; using JSON fallback.", error);
    await initializeJsonMarketData();
    return jsonClient;
  }
}

const jsonClient: MarketDataApi = {
  initializeMarketDb: initializeJsonMarketData,
  getAvailableMarketDays: getJsonMarketDays,
  getDamPriceSeries: getJsonPriceSeries,
  getCurveSlice: getJsonCurveSlice,
  getDataHealth: getJsonDataHealth,
};
