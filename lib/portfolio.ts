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

export type GridNodeKind =
  | "battery"
  | "wind"
  | "solar"
  | "hydro"
  | "gas"
  | "lignite"
  | "import"
  | "load"
  | "hub";

export type GridNode = {
  id: string;
  name: string;
  kind: GridNodeKind;
  region: string;
  latitude: number;
  longitude: number;
  mw: number;
  detail: string;
  siteId?: string;
};

export type GridFlowKind =
  | "renewable"
  | "thermal"
  | "import"
  | "battery-discharge"
  | "battery-charge"
  | "load";

export type GridFlow = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: GridFlowKind;
  mw: number;
  label: string;
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

const demoGridSources: GridNode[] = [
  {
    id: "bg-import",
    name: "Bulgaria Interconnector",
    kind: "import",
    region: "GR-BG",
    latitude: 41.38,
    longitude: 23.35,
    mw: 420,
    detail: "Bulgaria import corridor",
  },
  {
    id: "mk-import",
    name: "North Macedonia Tie",
    kind: "import",
    region: "GR-MK",
    latitude: 40.82,
    longitude: 21.38,
    mw: 180,
    detail: "Balancing support into Western Macedonia",
  },
  {
    id: "al-import",
    name: "Albania Interconnector",
    kind: "import",
    region: "AL-GR",
    latitude: 40.72,
    longitude: 20.78,
    mw: 160,
    detail: "Zemblak-Kardia 400 kV corridor",
  },
  {
    id: "tr-import",
    name: "Turkey Interconnector",
    kind: "import",
    region: "TR-GR",
    latitude: 40.82,
    longitude: 26.25,
    mw: 210,
    detail: "Eastern corridor import",
  },
  {
    id: "it-import",
    name: "Italy HVDC Link",
    kind: "import",
    region: "IT-GR",
    latitude: 40.1588,
    longitude: 18.1248,
    mw: 300,
    detail: "Galatina-Arachthos HVDC landing",
  },
  {
    id: "agios-dimitrios-lignite",
    name: "Agios Dimitrios Lignite",
    kind: "lignite",
    region: "Western Macedonia",
    latitude: 40.3942,
    longitude: 21.9249,
    mw: 620,
    detail: "Large Kozani thermal block",
  },
  {
    id: "komotini-gas",
    name: "Komotini CCGT",
    kind: "gas",
    region: "Eastern Macedonia & Thrace",
    latitude: 41.0646,
    longitude: 25.4899,
    mw: 290,
    detail: "Gas flexibility block",
  },
  {
    id: "lavrio-gas",
    name: "Lavrio Gas",
    kind: "gas",
    region: "Attica",
    latitude: 37.7463,
    longitude: 24.0666,
    mw: 260,
    detail: "Attica gas support near Lavrio",
  },
  {
    id: "megalopolis-gas",
    name: "Megalopolis Gas",
    kind: "gas",
    region: "Peloponnese",
    latitude: 37.42,
    longitude: 22.12,
    mw: 230,
    detail: "Peloponnese thermal flexibility",
  },
  {
    id: "kozani-solar",
    name: "Kozani Solar Park",
    kind: "solar",
    region: "Western Macedonia",
    latitude: 40.35,
    longitude: 21.78,
    mw: 260,
    detail: "Northern PV surplus",
  },
  {
    id: "thessaly-solar",
    name: "Thessaly Solar Cluster",
    kind: "solar",
    region: "Thessaly",
    latitude: 39.45,
    longitude: 22.15,
    mw: 220,
    detail: "Daytime PV surplus",
  },
  {
    id: "arcadia-solar",
    name: "Arcadia Solar",
    kind: "solar",
    region: "Peloponnese",
    latitude: 37.62,
    longitude: 22.28,
    mw: 130,
    detail: "Peloponnese PV surplus",
  },
  {
    id: "kafireas-wind",
    name: "Kafireas Wind",
    kind: "wind",
    region: "Evia",
    latitude: 38.02,
    longitude: 24.48,
    mw: 168,
    detail: "South Evia wind cluster",
  },
  {
    id: "cyclades-wind",
    name: "Cyclades Wind",
    kind: "wind",
    region: "Aegean",
    latitude: 37.44,
    longitude: 24.94,
    mw: 190,
    detail: "Island renewable supply",
  },
  {
    id: "crete-wind",
    name: "Crete Wind Ridge",
    kind: "wind",
    region: "Crete",
    latitude: 35.26,
    longitude: 24.62,
    mw: 105,
    detail: "Crete wind support",
  },
  {
    id: "crete-solar",
    name: "Crete Solar Belt",
    kind: "solar",
    region: "Crete",
    latitude: 35.18,
    longitude: 25.04,
    mw: 150,
    detail: "Local solar surplus",
  },
  {
    id: "kremasta-hydro",
    name: "Kremasta Hydro",
    kind: "hydro",
    region: "Aetolia-Acarnania",
    latitude: 38.8867,
    longitude: 21.4957,
    mw: 437,
    detail: "Acheloos hydro storage",
  },
  {
    id: "polyphyto-hydro",
    name: "Polyphyto Hydro",
    kind: "hydro",
    region: "Western Macedonia",
    latitude: 40.3026,
    longitude: 22.1004,
    mw: 375,
    detail: "Aliakmonas hydro storage",
  },
  {
    id: "thisavros-hydro",
    name: "Thisavros Hydro",
    kind: "hydro",
    region: "Drama / Nestos",
    latitude: 41.17,
    longitude: 24.38,
    mw: 384,
    detail: "Nestos pumped-storage hydro",
  },
  {
    id: "plastiras-hydro",
    name: "Plastiras Hydro",
    kind: "hydro",
    region: "Thessaly",
    latitude: 39.31,
    longitude: 21.75,
    mw: 130,
    detail: "Thessaly hydro storage",
  },
  {
    id: "ladon-hydro",
    name: "Ladon Hydro",
    kind: "hydro",
    region: "Arcadia",
    latitude: 37.68,
    longitude: 22.02,
    mw: 70,
    detail: "Peloponnese hydro support",
  },
  {
    id: "athens-load",
    name: "Athens Load Pocket",
    kind: "load",
    region: "Attica",
    latitude: 37.98,
    longitude: 23.72,
    mw: 880,
    detail: "Largest demand sink",
  },
  {
    id: "north-hub",
    name: "North Grid Hub",
    kind: "hub",
    region: "Macedonia",
    latitude: 40.55,
    longitude: 22.3,
    mw: 0,
    detail: "Synthetic regional bus",
  },
  {
    id: "east-hub",
    name: "Eastern Grid Hub",
    kind: "hub",
    region: "Thrace",
    latitude: 40.82,
    longitude: 25.18,
    mw: 0,
    detail: "Synthetic regional bus",
  },
  {
    id: "west-hub",
    name: "Western Hydro Hub",
    kind: "hub",
    region: "Western Greece",
    latitude: 38.86,
    longitude: 21.25,
    mw: 0,
    detail: "Synthetic regional bus",
  },
  {
    id: "central-hub",
    name: "Central Grid Hub",
    kind: "hub",
    region: "Central Greece",
    latitude: 39.1,
    longitude: 22.35,
    mw: 0,
    detail: "Synthetic regional bus",
  },
  {
    id: "south-hub",
    name: "South Grid Hub",
    kind: "hub",
    region: "Attica & Peloponnese",
    latitude: 37.85,
    longitude: 23.35,
    mw: 0,
    detail: "Synthetic regional bus",
  },
  {
    id: "peloponnese-hub",
    name: "Peloponnese Hub",
    kind: "hub",
    region: "Peloponnese",
    latitude: 37.55,
    longitude: 22.2,
    mw: 0,
    detail: "Synthetic regional bus",
  },
  {
    id: "island-hub",
    name: "Island Grid Hub",
    kind: "hub",
    region: "Aegean",
    latitude: 36.7,
    longitude: 25.0,
    mw: 0,
    detail: "Synthetic regional bus",
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
    grid: buildGridState(states),
    summary: summarizePortfolio(states),
  };
}

function buildGridState(sites: PortfolioSiteState[]) {
  const batteryNodes = sites.map<GridNode>((site) => ({
    id: `battery-${site.id}`,
    name: site.name,
    kind: "battery",
    region: site.region,
    latitude: site.latitude,
    longitude: site.longitude,
    mw: site.current?.mw ?? 0,
    detail: `${site.current?.action ?? "idle"} · ${Math.round(site.socPercent)}% SoC`,
    siteId: site.id,
  }));
  const nodes = [...demoGridSources, ...batteryNodes];
  return {
    nodes,
    flows: buildGridFlows(sites),
  };
}

function buildGridFlows(sites: PortfolioSiteState[]): GridFlow[] {
  const flows: GridFlow[] = [
    flow("bg-import", "north-hub", "import", 420, "Bulgaria import into northern hub"),
    flow("mk-import", "north-hub", "import", 180, "North Macedonia import support"),
    flow("al-import", "west-hub", "import", 160, "Albania import into western hydro hub"),
    flow("tr-import", "east-hub", "import", 210, "Turkey import into eastern corridor"),
    flow("it-import", "west-hub", "import", 300, "Italy HVDC into western Greece"),
    flow("agios-dimitrios-lignite", "north-hub", "thermal", 620, "Kozani thermal support"),
    flow("komotini-gas", "east-hub", "thermal", 290, "Komotini gas flexibility"),
    flow("lavrio-gas", "south-hub", "thermal", 260, "Lavrio support to Attica"),
    flow("megalopolis-gas", "peloponnese-hub", "thermal", 230, "Megalopolis support to Peloponnese"),
    flow("kremasta-hydro", "west-hub", "renewable", 437, "Kremasta hydro storage into western grid"),
    flow("polyphyto-hydro", "north-hub", "renewable", 375, "Polyphyto hydro into north hub"),
    flow("thisavros-hydro", "east-hub", "renewable", 384, "Nestos pumped storage into eastern grid"),
    flow("plastiras-hydro", "central-hub", "renewable", 130, "Plastiras hydro into central grid"),
    flow("ladon-hydro", "peloponnese-hub", "renewable", 70, "Ladon hydro into Peloponnese"),
    flow("kozani-solar", "north-hub", "renewable", 260, "Kozani PV surplus into north hub"),
    flow("thessaly-solar", "central-hub", "renewable", 220, "PV surplus into central grid"),
    flow("arcadia-solar", "peloponnese-hub", "renewable", 130, "Arcadia PV surplus into Peloponnese"),
    flow("kafireas-wind", "south-hub", "renewable", 168, "South Evia wind into Attica corridor"),
    flow("cyclades-wind", "island-hub", "renewable", 190, "Aegean wind into island hub"),
    flow("crete-wind", "island-hub", "renewable", 105, "Crete wind into island hub"),
    flow("crete-solar", "island-hub", "renewable", 150, "Crete solar into island hub"),
    flow("north-hub", "central-hub", "load", 330, "North-to-central transfer"),
    flow("east-hub", "central-hub", "load", 190, "Eastern corridor transfer"),
    flow("west-hub", "central-hub", "load", 260, "Western hydro transfer"),
    flow("central-hub", "south-hub", "load", 260, "Central-to-Attica corridor"),
    flow("peloponnese-hub", "south-hub", "load", 160, "Peloponnese support into Attica"),
    flow("island-hub", "south-hub", "load", 150, "Island renewable support into mainland"),
    flow("south-hub", "athens-load", "load", 420, "Supplying Athens load pocket"),
  ];

  for (const site of sites) {
    const nodeId = `battery-${site.id}`;
    const current = site.current;
    if (!current || current.action === "idle" || current.mw <= 0) {
      continue;
    }
    if (current.action === "charge") {
      flows.push(flow(feedNodeForSite(site), nodeId, "battery-charge", current.mw, `${site.name} charging`));
      continue;
    }
    flows.push(
      flow(nodeId, loadNodeForSite(site), "battery-discharge", current.mw, `${site.name} discharging`),
    );
  }

  return flows;
}

function flow(fromNodeId: string, toNodeId: string, kind: GridFlowKind, mw: number, label: string): GridFlow {
  return {
    id: `${fromNodeId}-${toNodeId}-${kind}`,
    fromNodeId,
    toNodeId,
    kind,
    mw,
    label,
  };
}

function feedNodeForSite(site: PortfolioSiteState) {
  if (site.id === "crete-iraklio") return "island-hub";
  if (site.id === "patras-south") return "west-hub";
  if (site.id === "kozani-north") return "north-hub";
  if (site.id === "athens-west") return "south-hub";
  if (site.id === "volos-port") return "central-hub";
  return "central-hub";
}

function loadNodeForSite(site: PortfolioSiteState) {
  if (site.id === "thessaloniki-flex") return "north-hub";
  if (site.id === "athens-west") return "athens-load";
  if (site.id === "crete-iraklio") return "island-hub";
  if (site.id === "patras-south") return "peloponnese-hub";
  return "central-hub";
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
