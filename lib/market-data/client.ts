"use client";

import * as Comlink from "comlink";
import { getConvexSiteUrl } from "@/lib/convex-url";
import { getJsonCurveSlice } from "@/lib/curve-data/json-fallback";
import { createConvexHttpMarketDataClient } from "./convex-http";
import {
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
  const staticClient = await createStaticClient();
  const convexSiteUrl = getConvexSiteUrl();
  if (convexSiteUrl) {
    return createConvexHttpMarketDataClient(convexSiteUrl, staticClient);
  }
  return staticClient;
}

async function createStaticClient(): Promise<MarketDataApi> {
  if (typeof Worker === "undefined") {
    return jsonClient;
  }

  try {
    const worker = new Worker(new URL("./market-worker.ts", import.meta.url), { type: "module" });
    const remote = Comlink.wrap<MarketWorkerApi>(worker);
    await remote.initializeMarketDb();
    return {
      initializeMarketDb: remote.initializeMarketDb,
      getAvailableMarketDays: remote.getAvailableMarketDays,
      getDamPriceSeries: remote.getDamPriceSeries,
      getDataHealth: remote.getDataHealth,
      getCurveSlice: getJsonCurveSlice,
    };
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
