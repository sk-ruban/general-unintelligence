import type { AggregatedCurvePoint, DataHealth } from "@/lib/types";

export type CurveDataApi = {
  initializeCurveDb: () => Promise<DataHealth>;
  getAvailableCurveDays: () => Promise<string[]>;
  getCurveSlice: (marketDate: string, mtu: number) => Promise<AggregatedCurvePoint[]>;
  getCurveHealth: () => Promise<DataHealth>;
};
