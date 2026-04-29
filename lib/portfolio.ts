import { DateTime } from "luxon";
import { buildDispatchSchedule, defaultBatteryTwin, summarizeDispatch } from "@/lib/battery-dispatch";
import type { BatteryTwinConfig, DamPricePoint, DispatchPoint } from "@/lib/types";

const MARKET_TIME_ZONE = "Europe/Athens";

export type BatterySite = {
  id: string;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  capacityMwh: number;
  maxChargeMw: number;
  maxDischargeMw: number;
  initialSocMwh: number;
  roundTripEfficiency: number;
  minSocMwh: number;
  maxSocMwh: number;
  degradationCostEurPerMwh: number;
  constraint: "merchant" | "grid-support" | "solar-shifting";
  telemetryAction: DispatchPoint["action"];
  telemetrySocPercent: number;
  telemetryMwFactor: number;
};

export type PortfolioSiteState = BatterySite & {
  config: BatteryTwinConfig;
  current: DispatchPoint | null;
  schedule: DispatchPoint[];
  summary: ReturnType<typeof summarizeDispatch>;
  socPercent: number;
};

export type PortfolioSummary = {
  capacityMwh: number;
  chargingMw: number;
  dischargingMw: number;
  averageSocPercent: number | null;
  valueEur: number;
  activeSites: number;
};

export const demoBatterySites: BatterySite[] = [
  {
    id: "kozani-north",
    name: "Kozani North BESS",
    region: "Western Macedonia",
    latitude: 40.3,
    longitude: 21.8,
    capacityMwh: 180,
    maxChargeMw: 72,
    maxDischargeMw: 72,
    initialSocMwh: 80,
    roundTripEfficiency: 0.89,
    minSocMwh: 18,
    maxSocMwh: 170,
    degradationCostEurPerMwh: 4.5,
    constraint: "solar-shifting",
    telemetryAction: "charge",
    telemetrySocPercent: 42,
    telemetryMwFactor: 0.72,
  },
  {
    id: "thessaloniki-flex",
    name: "Thessaloniki Flex Hub",
    region: "Central Macedonia",
    latitude: 40.64,
    longitude: 22.94,
    capacityMwh: 120,
    maxChargeMw: 50,
    maxDischargeMw: 50,
    initialSocMwh: 68,
    roundTripEfficiency: 0.87,
    minSocMwh: 12,
    maxSocMwh: 112,
    degradationCostEurPerMwh: 5,
    constraint: "grid-support",
    telemetryAction: "discharge",
    telemetrySocPercent: 68,
    telemetryMwFactor: 0.64,
  },
  {
    id: "volos-port",
    name: "Volos Port Battery",
    region: "Thessaly",
    latitude: 39.36,
    longitude: 22.94,
    capacityMwh: 96,
    maxChargeMw: 40,
    maxDischargeMw: 40,
    initialSocMwh: 48,
    roundTripEfficiency: 0.9,
    minSocMwh: 10,
    maxSocMwh: 90,
    degradationCostEurPerMwh: 3.8,
    constraint: "merchant",
    telemetryAction: "idle",
    telemetrySocPercent: 55,
    telemetryMwFactor: 0,
  },
  {
    id: "athens-west",
    name: "Athens West Reserve",
    region: "Attica",
    latitude: 38.05,
    longitude: 23.55,
    capacityMwh: 150,
    maxChargeMw: 60,
    maxDischargeMw: 60,
    initialSocMwh: 58,
    roundTripEfficiency: 0.88,
    minSocMwh: 15,
    maxSocMwh: 140,
    degradationCostEurPerMwh: 4.2,
    constraint: "grid-support",
    telemetryAction: "discharge",
    telemetrySocPercent: 73,
    telemetryMwFactor: 0.81,
  },
  {
    id: "patras-south",
    name: "Patras South BESS",
    region: "Western Greece",
    latitude: 38.2,
    longitude: 21.73,
    capacityMwh: 80,
    maxChargeMw: 32,
    maxDischargeMw: 32,
    initialSocMwh: 44,
    roundTripEfficiency: 0.86,
    minSocMwh: 8,
    maxSocMwh: 76,
    degradationCostEurPerMwh: 4.8,
    constraint: "merchant",
    telemetryAction: "charge",
    telemetrySocPercent: 36,
    telemetryMwFactor: 0.58,
  },
  {
    id: "crete-iraklio",
    name: "Crete Iraklio BESS",
    region: "Crete",
    latitude: 35.34,
    longitude: 25.13,
    capacityMwh: 130,
    maxChargeMw: 52,
    maxDischargeMw: 52,
    initialSocMwh: 74,
    roundTripEfficiency: 0.9,
    minSocMwh: 13,
    maxSocMwh: 122,
    degradationCostEurPerMwh: 4,
    constraint: "solar-shifting",
    telemetryAction: "charge",
    telemetrySocPercent: 61,
    telemetryMwFactor: 0.69,
  },
];

export function buildPortfolioState(prices: DamPricePoint[], sites = demoBatterySites) {
  const currentIndex = currentPriceIndex(prices);
  const states = sites.map((site) => {
    const config = siteConfig(site);
    const schedule = buildDispatchSchedule(prices, config);
    const current = demoTelemetryPoint(site, schedule[currentIndex] ?? schedule[0] ?? null);
    const summary = summarizeDispatch(schedule);
    const socPercent =
      current === null ? 0 : ((current.socMwh - site.minSocMwh) / (site.maxSocMwh - site.minSocMwh)) * 100;

    return {
      ...site,
      config,
      current,
      schedule,
      summary,
      socPercent: Math.max(0, Math.min(100, socPercent)),
    };
  });

  return {
    sites: states,
    summary: summarizePortfolio(states),
  };
}

function demoTelemetryPoint(site: BatterySite, basePoint: DispatchPoint | null): DispatchPoint | null {
  if (basePoint === null) {
    return null;
  }
  const socMwh = site.minSocMwh + ((site.maxSocMwh - site.minSocMwh) * site.telemetrySocPercent) / 100;
  const maxMw = site.telemetryAction === "charge" ? site.maxChargeMw : site.maxDischargeMw;
  const mw = site.telemetryAction === "idle" ? 0 : Number((maxMw * site.telemetryMwFactor).toFixed(1));
  const mwh = Number((mw * 0.25).toFixed(3));
  const signedValue =
    site.telemetryAction === "charge"
      ? -mwh * basePoint.priceEurPerMwh
      : site.telemetryAction === "discharge"
        ? mwh * (basePoint.priceEurPerMwh - site.degradationCostEurPerMwh)
        : 0;

  return {
    ...basePoint,
    action: site.telemetryAction,
    mw,
    mwh,
    socMwh: Number(socMwh.toFixed(3)),
    estimatedValueEur: Number(signedValue.toFixed(2)),
    reason: demoTelemetryReason(site.telemetryAction, site.constraint),
  };
}

function demoTelemetryReason(action: DispatchPoint["action"], constraint: BatterySite["constraint"]) {
  if (action === "charge") {
    return constraint === "solar-shifting"
      ? "Absorbing daytime renewable surplus ahead of the evening peak."
      : "Charging against the portfolio spread signal.";
  }
  if (action === "discharge") {
    return constraint === "grid-support"
      ? "Discharging into a local grid-support instruction."
      : "Discharging against the portfolio spread signal.";
  }
  return "Holding SoC inside the operator reserve band.";
}

function siteConfig(site: BatterySite): BatteryTwinConfig {
  return {
    ...defaultBatteryTwin,
    capacityMwh: site.capacityMwh,
    maxChargeMw: site.maxChargeMw,
    maxDischargeMw: site.maxDischargeMw,
    initialSocMwh: site.initialSocMwh,
    roundTripEfficiency: site.roundTripEfficiency,
    minSocMwh: site.minSocMwh,
    maxSocMwh: site.maxSocMwh,
    degradationCostEurPerMwh: site.degradationCostEurPerMwh,
  };
}

function currentPriceIndex(prices: DamPricePoint[]) {
  if (prices.length === 0) {
    return 0;
  }
  const marketDate = prices[0]?.interval.marketDate;
  const now = DateTime.now().setZone(MARKET_TIME_ZONE);
  if (marketDate !== now.toISODate()) {
    return prices.findIndex(
      (point) => point.mcpEurPerMwh === Math.max(...prices.map((price) => price.mcpEurPerMwh)),
    );
  }
  const mtu = now.hour * 4 + Math.floor(now.minute / 15) + 1;
  return Math.max(0, Math.min(prices.length - 1, mtu - 1));
}

function summarizePortfolio(sites: PortfolioSiteState[]): PortfolioSummary {
  const activeSites = sites.filter((site) => site.current?.action !== "idle").length;
  const chargingMw = sites.reduce(
    (total, site) => total + (site.current?.action === "charge" ? site.current.mw : 0),
    0,
  );
  const dischargingMw = sites.reduce(
    (total, site) => total + (site.current?.action === "discharge" ? site.current.mw : 0),
    0,
  );
  const averageSocPercent =
    sites.length > 0 ? sites.reduce((total, site) => total + site.socPercent, 0) / sites.length : null;

  return {
    capacityMwh: sites.reduce((total, site) => total + site.capacityMwh, 0),
    chargingMw,
    dischargingMw,
    averageSocPercent,
    valueEur: sites.reduce((total, site) => total + site.summary.valueEur, 0),
    activeSites,
  };
}
