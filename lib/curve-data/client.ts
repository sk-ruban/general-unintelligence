"use client";

import { getConvexSiteUrl } from "@/lib/convex-url";
import { createConvexHttpCurveDataClient } from "@/lib/market-data/convex-http";
import {
  getJsonCurveDays,
  getJsonCurveHealth,
  getJsonCurveSlice,
  initializeJsonCurveData,
} from "./json-fallback";
import type { CurveDataApi } from "./types";

let clientPromise: Promise<CurveDataApi> | null = null;

export function getCurveDataClient(): Promise<CurveDataApi> {
  clientPromise ??= createClient();
  return clientPromise;
}

async function createClient(): Promise<CurveDataApi> {
  const convexSiteUrl = getConvexSiteUrl();
  if (convexSiteUrl) {
    return createConvexHttpCurveDataClient(convexSiteUrl, jsonClient);
  }
  await initializeJsonCurveData();
  return jsonClient;
}

const jsonClient: CurveDataApi = {
  initializeCurveDb: initializeJsonCurveData,
  getAvailableCurveDays: getJsonCurveDays,
  getCurveSlice: getJsonCurveSlice,
  getCurveHealth: getJsonCurveHealth,
};
