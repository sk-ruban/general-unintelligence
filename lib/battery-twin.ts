import type { BatteryTwinConfig, DispatchPoint } from "@/lib/types";

export type ConfidenceLevel = "high" | "medium" | "low" | "unknown";

export type BatteryTwinTemplateId =
  | "generic-greece-2h-lfp"
  | "generic-greece-4h-lfp"
  | "ppc-amyntaio-trina"
  | "metlen-karatzis-thessaly"
  | "ppc-melitis-1"
  | "ppc-ptolemaida-4"
  | "jinko-suntera"
  | "sungrow-powertitan"
  | "byd-mc-cube-t"
  | "custom";

export type BatteryChemistry = "LFP" | "NMC" | "unknown";
export type BatteryCooling = "liquid" | "air" | "unknown";
export type BatteryMarketPhase = "test-mode" | "commercial" | "unknown";
export type AuxiliaryLoadMode = "off" | "simple" | "heat-aware";
export type TerminalSocPolicy = "none" | "minimum-return" | "equal-start";

export type BatteryTwinProfile = {
  id: BatteryTwinTemplateId;
  name: string;
  sourceBasis: string[];
  owner?: string;
  operator?: string;
  country: string;
  region?: string;
  marketPhase: BatteryMarketPhase;
  chemistry: BatteryChemistry;
  cooling: BatteryCooling;
  manufacturer?: string;
  platform?: string;
  confidence: Record<string, ConfidenceLevel>;
};

export type BatteryTwinParameters = {
  ratedPowerMwAc: number;
  contractedUsableEnergyMwh: number;
  nameplateEnergyMwhDc: number | null;
  usableToNameplateRatioEstimate: number;
  minSocPct: number;
  maxSocPct: number;
  reserveSocPct: number;
  initialSocPct: number;
  roundTripEfficiencyAc: number;
  maxChargePowerMw: number;
  maxDischargePowerMw: number;
  maxCyclesPerDay: number;
  degradationCostEurPerMwhThroughput: number;
  availabilityPct: number;
  stateOfHealthPct: number;
  auxiliaryMode: AuxiliaryLoadMode;
  standbyAuxiliaryMw: number;
  activeAuxiliaryMw: number;
  rampRateMwPerMin: number | null;
  terminalSocPolicy: TerminalSocPolicy;
};

export type CapacityStack = {
  nameplateMwhDc: number | null;
  nameplateEstimated: boolean;
  contractedUsableMwh: number;
  operationalWindowMwh: number;
  availableAfterSohMwh: number;
  acDispatchableMwhEstimate: number;
  nameplateToUsableGap: number | null;
};

export type OptimizerBatteryConstraints = BatteryTwinConfig & {
  chargeEfficiency: number;
  dischargeEfficiency: number;
  maxCyclesPerDay: number;
  availabilityDerate: number;
  reserveSocMwh: number;
  terminalSocPolicy: TerminalSocPolicy;
};

export type BatteryTwinTemplate = {
  profile: BatteryTwinProfile;
  parameters: BatteryTwinParameters;
  missingSpecs: string[];
};

export type BatteryTwin = BatteryTwinTemplate & {
  capacityStack: CapacityStack;
  optimizerConstraints: OptimizerBatteryConstraints;
  optimizerConfig: BatteryTwinConfig;
};

export type TwinFeasibilityCheck = {
  id: string;
  label: string;
  status: "pass" | "review" | "missing";
  detail: string;
};

export type MissingSpec = {
  id: string;
  label: string;
  confidence: ConfidenceLevel;
  basis: string;
};

const DEFAULTS: Omit<
  BatteryTwinParameters,
  | "ratedPowerMwAc"
  | "contractedUsableEnergyMwh"
  | "nameplateEnergyMwhDc"
  | "usableToNameplateRatioEstimate"
  | "roundTripEfficiencyAc"
  | "maxChargePowerMw"
  | "maxDischargePowerMw"
  | "maxCyclesPerDay"
  | "availabilityPct"
> = {
  minSocPct: 10,
  maxSocPct: 90,
  reserveSocPct: 10,
  initialSocPct: 45,
  degradationCostEurPerMwhThroughput: 4,
  stateOfHealthPct: 100,
  auxiliaryMode: "simple",
  standbyAuxiliaryMw: 0.05,
  activeAuxiliaryMw: 0.5,
  rampRateMwPerMin: null,
  terminalSocPolicy: "minimum-return",
};

function parameters(input: {
  ratedPowerMwAc: number;
  contractedUsableEnergyMwh: number;
  nameplateEnergyMwhDc: number | null;
  usableToNameplateRatioEstimate: number;
  roundTripEfficiencyAc: number;
  maxChargePowerMw?: number;
  maxDischargePowerMw?: number;
  maxCyclesPerDay: number;
  availabilityPct: number;
  overrides?: Partial<BatteryTwinParameters>;
}): BatteryTwinParameters {
  return {
    ...DEFAULTS,
    ratedPowerMwAc: input.ratedPowerMwAc,
    contractedUsableEnergyMwh: input.contractedUsableEnergyMwh,
    nameplateEnergyMwhDc: input.nameplateEnergyMwhDc,
    usableToNameplateRatioEstimate: input.usableToNameplateRatioEstimate,
    roundTripEfficiencyAc: input.roundTripEfficiencyAc,
    maxChargePowerMw: input.maxChargePowerMw ?? input.ratedPowerMwAc,
    maxDischargePowerMw: input.maxDischargePowerMw ?? input.ratedPowerMwAc,
    maxCyclesPerDay: input.maxCyclesPerDay,
    availabilityPct: input.availabilityPct,
    ...input.overrides,
  };
}

const greeceBasis = [
  "Greece storage auction/project disclosure pattern",
  "Liquid-cooled LFP inferred default for current Greek utility-scale BESS",
  "RAEWW support-scheme obligation summary",
];

export const BATTERY_TWIN_TEMPLATES: readonly BatteryTwinTemplate[] = [
  {
    profile: {
      id: "generic-greece-2h-lfp",
      name: "Generic Greece 2h LFP",
      sourceBasis: [
        "Greece first storage auction pattern",
        "PPC Melitis/Ptolemaida disclosures",
        "RAEWW support-scheme obligations",
      ],
      country: "Greece",
      marketPhase: "unknown",
      chemistry: "LFP",
      cooling: "liquid",
      confidence: {
        ratedPowerMwAc: "medium",
        contractedUsableEnergyMwh: "medium",
        nameplateEnergyMwhDc: "low",
        chemistry: "medium",
        cooling: "medium",
        roundTripEfficiencyAc: "medium",
      },
    },
    parameters: parameters({
      ratedPowerMwAc: 50,
      contractedUsableEnergyMwh: 100,
      nameplateEnergyMwhDc: null,
      usableToNameplateRatioEstimate: 0.85,
      roundTripEfficiencyAc: 0.89,
      maxCyclesPerDay: 1.5,
      availabilityPct: 93,
    }),
    missingSpecs: [
      "supplier",
      "nameplate DC energy",
      "PCS count",
      "warranty throughput",
      "auxiliary load measurement boundary",
    ],
  },
  {
    profile: {
      id: "generic-greece-4h-lfp",
      name: "Generic Greece 4h LFP",
      sourceBasis: [
        "Greece third storage auction pattern",
        "PPC Amyntaio project",
        "RAEWW support-scheme obligations",
      ],
      country: "Greece",
      marketPhase: "unknown",
      chemistry: "LFP",
      cooling: "liquid",
      confidence: {
        ratedPowerMwAc: "medium",
        contractedUsableEnergyMwh: "medium",
        nameplateEnergyMwhDc: "low",
        chemistry: "medium",
        cooling: "medium",
        roundTripEfficiencyAc: "medium",
      },
    },
    parameters: parameters({
      ratedPowerMwAc: 50,
      contractedUsableEnergyMwh: 200,
      nameplateEnergyMwhDc: null,
      usableToNameplateRatioEstimate: 0.85,
      roundTripEfficiencyAc: 0.89,
      maxCyclesPerDay: 1.25,
      availabilityPct: 93,
    }),
    missingSpecs: [
      "supplier",
      "nameplate DC energy",
      "PCS count",
      "warranty throughput",
      "thermal derating curve",
    ],
  },
  {
    profile: {
      id: "ppc-amyntaio-trina",
      name: "PPC Amyntaio / Trina Elementa 2",
      sourceBasis: [
        "PPC project disclosure",
        "Trina Storage project disclosure",
        "Research note capacity-stack finding",
      ],
      owner: "PPC Renewables",
      operator: "PPC Renewables",
      country: "Greece",
      region: "Western Macedonia",
      marketPhase: "commercial",
      chemistry: "LFP",
      cooling: "liquid",
      manufacturer: "Trina Storage",
      platform: "Elementa 2",
      confidence: {
        ratedPowerMwAc: "high",
        contractedUsableEnergyMwh: "high",
        nameplateEnergyMwhDc: "high",
        manufacturer: "high",
        chemistry: "high",
        cooling: "high",
        roundTripEfficiencyAc: "medium",
        degradationCost: "low",
      },
    },
    parameters: parameters({
      ratedPowerMwAc: 50,
      contractedUsableEnergyMwh: 200,
      nameplateEnergyMwhDc: 244,
      usableToNameplateRatioEstimate: 200 / 244,
      roundTripEfficiencyAc: 0.89,
      maxCyclesPerDay: 1.25,
      availabilityPct: 93,
    }),
    missingSpecs: [
      "warranty throughput",
      "exact AC-to-AC RTE measurement boundary",
      "auxiliary load telemetry",
      "BMS SoC calibration",
    ],
  },
  {
    profile: {
      id: "metlen-karatzis-thessaly",
      name: "METLEN-Karatzis Thessaly",
      sourceBasis: [
        "METLEN/Karatzis public project disclosure",
        "Regional LFP/liquid-cooled BESS pattern",
        "Candidate supplier archetypes from research note",
      ],
      owner: "METLEN 49%, Karatzis 51%",
      operator: "METLEN M Renewables",
      country: "Greece",
      region: "Thessaly",
      marketPhase: "unknown",
      chemistry: "unknown",
      cooling: "unknown",
      confidence: {
        ratedPowerMwAc: "high",
        contractedUsableEnergyMwh: "high",
        manufacturer: "unknown",
        chemistry: "medium",
        cooling: "medium",
        nameplateEnergyMwhDc: "low",
        roundTripEfficiencyAc: "medium",
        degradationCost: "low",
      },
    },
    parameters: parameters({
      ratedPowerMwAc: 330,
      contractedUsableEnergyMwh: 790,
      nameplateEnergyMwhDc: null,
      usableToNameplateRatioEstimate: 0.85,
      roundTripEfficiencyAc: 0.89,
      maxCyclesPerDay: 1.25,
      availabilityPct: 93,
    }),
    missingSpecs: [
      "supplier",
      "nameplate DC energy",
      "PCS count",
      "warranty throughput",
      "exact RTE",
      "auxiliary load",
      "thermal derating curve",
    ],
  },
  {
    profile: {
      id: "ppc-melitis-1",
      name: "PPC Melitis 1",
      sourceBasis: ["PPC project disclosure", ...greeceBasis],
      owner: "PPC Renewables",
      country: "Greece",
      region: "Western Macedonia",
      marketPhase: "unknown",
      chemistry: "LFP",
      cooling: "liquid",
      confidence: {
        ratedPowerMwAc: "high",
        contractedUsableEnergyMwh: "high",
        nameplateEnergyMwhDc: "low",
        chemistry: "high",
        cooling: "high",
        manufacturer: "unknown",
      },
    },
    parameters: parameters({
      ratedPowerMwAc: 48,
      contractedUsableEnergyMwh: 96,
      nameplateEnergyMwhDc: null,
      usableToNameplateRatioEstimate: 0.85,
      roundTripEfficiencyAc: 0.89,
      maxCyclesPerDay: 1.5,
      availabilityPct: 93,
    }),
    missingSpecs: ["supplier", "nameplate DC energy", "PCS count", "warranty throughput", "exact RTE"],
  },
  {
    profile: {
      id: "ppc-ptolemaida-4",
      name: "PPC Ptolemaida 4",
      sourceBasis: ["PPC project disclosure", ...greeceBasis],
      owner: "PPC Renewables",
      country: "Greece",
      region: "Western Macedonia",
      marketPhase: "unknown",
      chemistry: "LFP",
      cooling: "liquid",
      confidence: {
        ratedPowerMwAc: "high",
        contractedUsableEnergyMwh: "high",
        nameplateEnergyMwhDc: "low",
        chemistry: "high",
        cooling: "high",
        manufacturer: "unknown",
      },
    },
    parameters: parameters({
      ratedPowerMwAc: 50,
      contractedUsableEnergyMwh: 100,
      nameplateEnergyMwhDc: null,
      usableToNameplateRatioEstimate: 0.85,
      roundTripEfficiencyAc: 0.89,
      maxCyclesPerDay: 1.5,
      availabilityPct: 93,
    }),
    missingSpecs: ["supplier", "nameplate DC energy", "PCS count", "warranty throughput", "exact RTE"],
  },
  {
    profile: {
      id: "jinko-suntera",
      name: "Jinko SunTera-style",
      sourceBasis: [
        "Manufacturer archetype for custom project entry",
        "Generic liquid-cooled LFP utility BESS assumptions",
      ],
      country: "Greece",
      marketPhase: "unknown",
      chemistry: "LFP",
      cooling: "liquid",
      manufacturer: "Jinko",
      platform: "SunTera-style",
      confidence: {
        manufacturer: "medium",
        platform: "medium",
        ratedPowerMwAc: "low",
        contractedUsableEnergyMwh: "low",
        nameplateEnergyMwhDc: "low",
      },
    },
    parameters: parameters({
      ratedPowerMwAc: 50,
      contractedUsableEnergyMwh: 100,
      nameplateEnergyMwhDc: null,
      usableToNameplateRatioEstimate: 0.86,
      roundTripEfficiencyAc: 0.9,
      maxCyclesPerDay: 1.5,
      availabilityPct: 93,
    }),
    missingSpecs: [
      "project rating",
      "contracted energy",
      "site-specific supplier confirmation",
      "warranty throughput",
    ],
  },
  {
    profile: {
      id: "sungrow-powertitan",
      name: "Sungrow PowerTitan-style",
      sourceBasis: [
        "Manufacturer archetype for custom project entry",
        "Generic liquid-cooled LFP utility BESS assumptions",
      ],
      country: "Greece",
      marketPhase: "unknown",
      chemistry: "LFP",
      cooling: "liquid",
      manufacturer: "Sungrow",
      platform: "PowerTitan-style",
      confidence: {
        manufacturer: "medium",
        platform: "medium",
        ratedPowerMwAc: "low",
        contractedUsableEnergyMwh: "low",
        nameplateEnergyMwhDc: "low",
      },
    },
    parameters: parameters({
      ratedPowerMwAc: 50,
      contractedUsableEnergyMwh: 200,
      nameplateEnergyMwhDc: null,
      usableToNameplateRatioEstimate: 0.85,
      roundTripEfficiencyAc: 0.89,
      maxCyclesPerDay: 1.25,
      availabilityPct: 93,
    }),
    missingSpecs: [
      "project rating",
      "contracted energy",
      "site-specific supplier confirmation",
      "warranty throughput",
    ],
  },
  {
    profile: {
      id: "byd-mc-cube-t",
      name: "BYD MC Cube-T-style",
      sourceBasis: [
        "Manufacturer archetype for custom project entry",
        "Generic liquid-cooled LFP utility BESS assumptions",
      ],
      country: "Greece",
      marketPhase: "unknown",
      chemistry: "LFP",
      cooling: "liquid",
      manufacturer: "BYD",
      platform: "MC Cube-T-style",
      confidence: {
        manufacturer: "medium",
        platform: "medium",
        ratedPowerMwAc: "low",
        contractedUsableEnergyMwh: "low",
        nameplateEnergyMwhDc: "low",
      },
    },
    parameters: parameters({
      ratedPowerMwAc: 50,
      contractedUsableEnergyMwh: 100,
      nameplateEnergyMwhDc: null,
      usableToNameplateRatioEstimate: 0.86,
      roundTripEfficiencyAc: 0.9,
      maxCyclesPerDay: 1.5,
      availabilityPct: 93,
    }),
    missingSpecs: [
      "project rating",
      "contracted energy",
      "site-specific supplier confirmation",
      "warranty throughput",
    ],
  },
  {
    profile: {
      id: "custom",
      name: "Custom Asset",
      sourceBasis: ["Operator-entered asset assumptions"],
      country: "Greece",
      marketPhase: "unknown",
      chemistry: "unknown",
      cooling: "unknown",
      confidence: {
        ratedPowerMwAc: "unknown",
        contractedUsableEnergyMwh: "unknown",
        nameplateEnergyMwhDc: "unknown",
        roundTripEfficiencyAc: "unknown",
      },
    },
    parameters: parameters({
      ratedPowerMwAc: 50,
      contractedUsableEnergyMwh: 100,
      nameplateEnergyMwhDc: null,
      usableToNameplateRatioEstimate: 0.85,
      roundTripEfficiencyAc: 0.88,
      maxCyclesPerDay: 1.25,
      availabilityPct: 93,
    }),
    missingSpecs: [
      "public project basis",
      "supplier",
      "nameplate DC energy",
      "warranty throughput",
      "auxiliary load",
      "thermal derating curve",
    ],
  },
];

export function getBatteryTwinTemplate(id: BatteryTwinTemplateId): BatteryTwinTemplate {
  const template = BATTERY_TWIN_TEMPLATES.find((candidate) => candidate.profile.id === id);
  if (!template) {
    throw new Error(`Unknown battery twin template: ${id}`);
  }
  return template;
}

export function buildBatteryTwin(
  id: BatteryTwinTemplateId,
  overrides: Partial<BatteryTwinParameters> = {},
): BatteryTwin {
  const template = getBatteryTwinTemplate(id);
  const resolvedParameters = { ...template.parameters, ...overrides };
  const capacityStack = buildCapacityStack(resolvedParameters);
  const optimizerConstraints = toOptimizerConstraints(resolvedParameters);

  return {
    ...template,
    parameters: resolvedParameters,
    capacityStack,
    optimizerConstraints,
    optimizerConfig: toBatteryTwinConfig(optimizerConstraints),
  };
}

export function buildCapacityStack(params: BatteryTwinParameters): CapacityStack {
  const nameplate =
    params.nameplateEnergyMwhDc ?? params.contractedUsableEnergyMwh / params.usableToNameplateRatioEstimate;
  const operationalWindow = params.contractedUsableEnergyMwh * ((params.maxSocPct - params.minSocPct) / 100);
  const availableAfterSoh = operationalWindow * (params.stateOfHealthPct / 100);
  const acDispatchable = availableAfterSoh * Math.sqrt(params.roundTripEfficiencyAc);

  return {
    nameplateMwhDc: round(nameplate, 3),
    nameplateEstimated: params.nameplateEnergyMwhDc === null,
    contractedUsableMwh: round(params.contractedUsableEnergyMwh, 3),
    operationalWindowMwh: round(operationalWindow, 3),
    availableAfterSohMwh: round(availableAfterSoh, 3),
    acDispatchableMwhEstimate: round(acDispatchable, 3),
    nameplateToUsableGap: nameplate > 0 ? round(1 - params.contractedUsableEnergyMwh / nameplate, 4) : null,
  };
}

export function toOptimizerConstraints(params: BatteryTwinParameters): OptimizerBatteryConstraints {
  const capacityMwh = params.contractedUsableEnergyMwh * (params.stateOfHealthPct / 100);
  const minSocMwh = capacityMwh * (params.minSocPct / 100);
  const maxSocMwh = capacityMwh * (params.maxSocPct / 100);
  const initialSocMwh = capacityMwh * (params.initialSocPct / 100);
  const efficiency = Math.sqrt(params.roundTripEfficiencyAc);
  const availabilityDerate = params.availabilityPct / 100;

  return {
    capacityMwh: round(capacityMwh, 3),
    minSocMwh: round(minSocMwh, 3),
    maxSocMwh: round(maxSocMwh, 3),
    initialSocMwh: round(clamp(initialSocMwh, minSocMwh, maxSocMwh), 3),
    maxChargeMw: round(params.maxChargePowerMw * availabilityDerate, 3),
    maxDischargeMw: round(params.maxDischargePowerMw * availabilityDerate, 3),
    chargeEfficiency: round(efficiency, 5),
    dischargeEfficiency: round(efficiency, 5),
    roundTripEfficiency: round(params.roundTripEfficiencyAc, 5),
    degradationCostEurPerMwh: round(params.degradationCostEurPerMwhThroughput, 3),
    maxCyclesPerDay: round(params.maxCyclesPerDay, 3),
    availabilityDerate: round(availabilityDerate, 5),
    reserveSocMwh: round(capacityMwh * (params.reserveSocPct / 100), 3),
    terminalSocPolicy: params.terminalSocPolicy,
  };
}

export function toBatteryTwinConfig(constraints: OptimizerBatteryConstraints): BatteryTwinConfig {
  return {
    capacityMwh: constraints.capacityMwh,
    maxChargeMw: constraints.maxChargeMw,
    maxDischargeMw: constraints.maxDischargeMw,
    roundTripEfficiency: constraints.roundTripEfficiency,
    minSocMwh: constraints.minSocMwh,
    maxSocMwh: constraints.maxSocMwh,
    initialSocMwh: constraints.initialSocMwh,
    degradationCostEurPerMwh: constraints.degradationCostEurPerMwh,
  };
}

export function getMissingSpecs(
  twin: Pick<BatteryTwinTemplate, "profile" | "parameters" | "missingSpecs">,
): MissingSpec[] {
  return twin.missingSpecs.map((label) => {
    const normalized = label.toLowerCase().replaceAll(" ", "-");
    return {
      id: normalized,
      label,
      confidence: confidenceForMissingSpec(label, twin.profile),
      basis: basisForMissingSpec(label, twin),
    };
  });
}

export function evaluateDispatchFeasibility(
  schedule: DispatchPoint[],
  constraints: OptimizerBatteryConstraints,
): TwinFeasibilityCheck[] {
  if (schedule.length === 0) {
    return [
      {
        id: "dispatch-present",
        label: "Dispatch present",
        status: "missing",
        detail: "No dispatch points were supplied for feasibility evaluation.",
      },
    ];
  }

  const socViolations = schedule.filter(
    (point) => point.socMwh < constraints.minSocMwh - 0.001 || point.socMwh > constraints.maxSocMwh + 0.001,
  );
  const chargePowerViolations = schedule.filter(
    (point) => point.action === "charge" && point.mw > constraints.maxChargeMw + 0.001,
  );
  const dischargePowerViolations = schedule.filter(
    (point) => point.action === "discharge" && point.mw > constraints.maxDischargeMw + 0.001,
  );
  const invalidActionViolations = schedule.filter(
    (point) => point.action !== "charge" && point.action !== "discharge" && point.action !== "idle",
  );
  const dischargeMwh = sum(schedule, (point) => (point.action === "discharge" ? point.mwh : 0));
  const chargeMwh = sum(schedule, (point) => (point.action === "charge" ? point.mwh : 0));
  const equivalentCycles = (chargeMwh + dischargeMwh) / (2 * Math.max(1, constraints.capacityMwh));
  const reserveViolations = schedule.filter(
    (point) => point.socMwh < constraints.minSocMwh + constraints.reserveSocMwh - 0.001,
  );
  const finalSoc = schedule.at(-1)?.socMwh ?? constraints.initialSocMwh;
  const terminalReview =
    constraints.terminalSocPolicy === "equal-start"
      ? Math.abs(finalSoc - constraints.initialSocMwh) > 0.001
      : constraints.terminalSocPolicy === "minimum-return" && finalSoc < constraints.initialSocMwh - 5;

  return [
    {
      id: "soc-bounds",
      label: "SoC bounds",
      status: socViolations.length === 0 ? "pass" : "review",
      detail:
        socViolations.length === 0
          ? `All points remain between ${constraints.minSocMwh} and ${constraints.maxSocMwh} MWh.`
          : `${socViolations.length} point(s) leave the configured SoC envelope.`,
    },
    {
      id: "power-limits",
      label: "Power limits",
      status: chargePowerViolations.length === 0 && dischargePowerViolations.length === 0 ? "pass" : "review",
      detail:
        chargePowerViolations.length === 0 && dischargePowerViolations.length === 0
          ? `Charge/discharge stay within ${constraints.maxChargeMw}/${constraints.maxDischargeMw} MW.`
          : `${chargePowerViolations.length} charge and ${dischargePowerViolations.length} discharge point(s) exceed limits.`,
    },
    {
      id: "simultaneous-actions",
      label: "No simultaneous charge/discharge",
      status: invalidActionViolations.length === 0 ? "pass" : "review",
      detail:
        invalidActionViolations.length === 0
          ? "Each dispatch point declares one mutually exclusive action."
          : `${invalidActionViolations.length} point(s) have an invalid action.`,
    },
    {
      id: "cycle-policy",
      label: "Cycle policy",
      status: equivalentCycles <= constraints.maxCyclesPerDay + 0.001 ? "pass" : "review",
      detail: `${round(equivalentCycles, 2)} equivalent cycle(s) vs ${constraints.maxCyclesPerDay} allowed per day.`,
    },
    {
      id: "reserve-soc",
      label: "Reserve SoC",
      status: reserveViolations.length === 0 ? "pass" : "review",
      detail:
        reserveViolations.length === 0
          ? `SoC keeps the ${constraints.reserveSocMwh} MWh reserve above the minimum bound.`
          : `${reserveViolations.length} point(s) consume the configured reserve band.`,
    },
    {
      id: "terminal-soc",
      label: "Terminal SoC",
      status: terminalReview ? "review" : "pass",
      detail:
        constraints.terminalSocPolicy === "none"
          ? "No terminal SoC policy is configured."
          : `Final SoC is ${round(finalSoc, 3)} MWh; initial SoC is ${constraints.initialSocMwh} MWh.`,
    },
    {
      id: "availability-derate",
      label: "Availability derate",
      status: constraints.availabilityDerate >= 0.93 ? "pass" : "review",
      detail: `Power limits include a ${round(constraints.availabilityDerate * 100, 1)}% availability derate.`,
    },
    {
      id: "auxiliary-load",
      label: "Auxiliary load estimate",
      status: "pass",
      detail:
        "Auxiliary load is represented in the twin metadata and capacity stack, not in the current heuristic dispatch.",
    },
    {
      id: "capacity-stack",
      label: "Capacity stack completeness",
      status:
        constraints.capacityMwh > 0 && constraints.maxSocMwh > constraints.minSocMwh ? "pass" : "missing",
      detail: `Optimizer received ${constraints.capacityMwh} MWh capacity with ${constraints.minSocMwh}-${constraints.maxSocMwh} MWh bounds.`,
    },
  ];
}

function confidenceForMissingSpec(label: string, profile: BatteryTwinProfile): ConfidenceLevel {
  const lower = label.toLowerCase();
  if (lower.includes("supplier") || lower.includes("manufacturer"))
    return profile.confidence.manufacturer ?? "unknown";
  if (lower.includes("nameplate")) return profile.confidence.nameplateEnergyMwhDc ?? "unknown";
  if (lower.includes("rte")) return profile.confidence.roundTripEfficiencyAc ?? "unknown";
  return "unknown";
}

function basisForMissingSpec(
  label: string,
  twin: Pick<BatteryTwinTemplate, "profile" | "parameters" | "missingSpecs">,
): string {
  const lower = label.toLowerCase();
  if (lower.includes("nameplate") && twin.parameters.nameplateEnergyMwhDc === null) {
    return `Estimated from usable-to-nameplate ratio ${round(twin.parameters.usableToNameplateRatioEstimate, 3)}.`;
  }
  if (lower.includes("supplier") && !twin.profile.manufacturer) {
    return "Public supplier/manufacturer disclosure not present in the selected template.";
  }
  return "Customer or supplier input would increase twin confidence.";
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
