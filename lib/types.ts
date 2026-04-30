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

export type SignalQuality = "observed" | "proxy" | "missing";

export type BatterySignalInterval = {
  marketDate: string;
  timestamp: string;
  localMinute: string;
  mtu: number;
  priceEurPerMwh: number;
  volumeMw: number | null;
  inputs: {
    pricePosition: number;
    lowPriceScore: number;
    highPriceScore: number;
    spreadOpportunity: number;
    priceJumpStress: number;
    volumeDepthScore: number | null;
    solarAvailabilityScore: number | null;
    windGenerationProxy: number | null;
    weatherDemandStress: number | null;
    fuelCarbonStress: number | null;
    batteryHeadroomScore: number;
    batteryEnergyAvailableScore: number;
  };
  signals: {
    flexibilityValueIndex: number;
    chargeAttractiveness: number;
    dischargeScarcity: number;
    curtailmentAbsorption: number;
    spreadRobustness: number;
    marketFragility: number;
  };
  regime:
    | "solar-surplus"
    | "wind-surplus"
    | "evening-scarcity"
    | "fuel-carbon-stress"
    | "fragile-market"
    | "normal";
  confidence: number;
  quality: Record<string, SignalQuality>;
  explanation: string[];
};

export type BatterySignalResponse = {
  source: string;
  timezone: string;
  range: { from: string; to: string };
  generatedAtUtc: string;
  intervals: BatterySignalInterval[];
  summary: {
    intervalCount: number;
    averageFvi: number | null;
    bestChargeWindows: BatterySignalInterval[];
    bestDischargeWindows: BatterySignalInterval[];
    highestCurtailmentWindows: BatterySignalInterval[];
    regimeCounts: Record<string, number>;
    dataFreshness: Record<string, unknown>;
    caveats: string[];
  };
};
