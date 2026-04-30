"use client";

import { getConvexSiteUrl } from "@/lib/convex-url";
import { getJsonCurveSlice } from "@/lib/curve-data/json-fallback";
import { createConvexHttpMarketDataClient } from "./convex-http";
import {
  getJsonDataHealth,
  getJsonMarketDays,
  getJsonPriceSeries,
  initializeJsonMarketData,
} from "./json-fallback";
import type { MarketDataApi } from "./types";

let clientPromise: Promise<MarketDataApi> | null = null;

export function getMarketDataClient(): Promise<MarketDataApi> {
  clientPromise ??= createClient();
  return clientPromise;
}

async function createClient(): Promise<MarketDataApi> {
  const convexSiteUrl = getConvexSiteUrl();
  if (convexSiteUrl) {
    return createConvexHttpMarketDataClient(convexSiteUrl, jsonClient);
  }
  await initializeJsonMarketData();
  return jsonClient;
}

const jsonClient: MarketDataApi = {
  initializeMarketDb: initializeJsonMarketData,
  getAvailableMarketDays: getJsonMarketDays,
  getDamPriceSeries: getJsonPriceSeries,
  getCurveSlice: getJsonCurveSlice,
  getDataHealth: getJsonDataHealth,
};
