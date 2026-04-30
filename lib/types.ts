export type MarketInterval = {
  marketDate: string;
  mtu: number;
  timestampUtc: string;
  athensLabel: string;
};

export type DamPricePoint = {
  interval: MarketInterval;
  mcpEurPerMwh: number;
  totalTrades: number | null;
  publishedAtLocal: string;
  version: number | null;
  sourceFile: string;
};

export type AggregatedCurvePoint = {
  interval: MarketInterval;
  side: "Buy" | "Sell";
  curveOrder: number;
  quantityMwh: number;
  unitPriceEurPerMwh: number;
  publishedAtLocal: string;
  version: number | null;
  sourceFile: string;
};

export type BatteryTwinConfig = {
  capacityMwh: number;
  maxChargeMw: number;
  maxDischargeMw: number;
  roundTripEfficiency: number;
  minSocMwh: number;
  maxSocMwh: number;
  initialSocMwh: number;
  degradationCostEurPerMwh: number;
};

export type DispatchAction = "charge" | "discharge" | "idle";

export type DispatchPoint = {
  interval: MarketInterval;
  action: DispatchAction;
  mw: number;
  mwh: number;
  socMwh: number;
  priceEurPerMwh: number;
  estimatedValueEur: number;
  reason: string;
};

export type DataHealth = {
  mode: "convex" | "convex-http" | "json-fallback";
  priceRows: number;
  curveRows: number;
  firstMarketDate: string | null;
  lastMarketDate: string | null;
  generatedAtUtc: string | null;
};

export type ExternalSignalPanel = {
  label: string;
  value: string;
  detail: string;
  status: "live" | "cached" | "missing";
};
