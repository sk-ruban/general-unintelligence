"use client";

import * as Comlink from "comlink";
import type { CurveWorkerApi } from "./curve-worker";
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
  if (typeof Worker === "undefined") {
    return jsonClient;
  }

  try {
    const worker = new Worker(new URL("./curve-worker.ts", import.meta.url), { type: "module" });
    const remote = Comlink.wrap<CurveWorkerApi>(worker);
    await remote.initializeCurveDb();
    return remote;
  } catch (error) {
    console.warn("Curve worker failed; using JSON curve fallback.", error);
    await initializeJsonCurveData();
    return jsonClient;
  }
}

const jsonClient: CurveDataApi = {
  initializeCurveDb: initializeJsonCurveData,
  getAvailableCurveDays: getJsonCurveDays,
  getCurveSlice: getJsonCurveSlice,
  getCurveHealth: getJsonCurveHealth,
};
