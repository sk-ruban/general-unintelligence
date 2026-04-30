import { buildDispatchSchedule } from "@/lib/battery-dispatch";
import type { BatteryTwinConfig, DamPricePoint, DispatchAction, DispatchPoint } from "@/lib/types";

export type ScenarioId = "base" | "gas-shock" | "solar-surplus" | "four-hour";

export type ScenarioFeasibilityStatus = "pass" | "review" | "missing";

export type ScenarioComparisonSummary = {
  valueEur: number;
  degradationCostEur: number;
  throughputMwh: number;
  equivalentCycles: number;
  chargeWindow: string;
  dischargeWindow: string;
  valueDeltaEur: number;
  valueDeltaPercent: number | null;
};

export type ScenarioComparison = {
  id: ScenarioId;
  label: string;
  description: string;
  prices: DamPricePoint[];
  twin: BatteryTwinConfig;
  dispatch: DispatchPoint[];
  summary: ScenarioComparisonSummary;
  feasibilityStatus: ScenarioFeasibilityStatus;
};

type ScenarioDefinition = {
  id: ScenarioId;
  label: string;
  description: string;
  prices: DamPricePoint[];
  twin: BatteryTwinConfig;
};

export function buildScenarioComparisons(
  prices: DamPricePoint[],
  twin: BatteryTwinConfig,
): ScenarioComparison[] {
  const definitions: ScenarioDefinition[] = [
    {
      id: "base",
      label: "Base Case",
      description: "Current selected DAM price series and battery twin.",
      prices: clonePrices(prices),
      twin: { ...twin },
    },
    {
      id: "gas-shock",
      label: "Gas Shock",
      description: "Higher thermal marginal cost with stronger evening scarcity.",
      prices: perturbGasShock(prices),
      twin: { ...twin },
    },
    {
      id: "solar-surplus",
      label: "Solar Surplus",
      description: "Midday renewable compression with a modest evening ramp.",
      prices: perturbSolarSurplus(prices),
      twin: { ...twin },
    },
    {
      id: "four-hour",
      label: "4h Battery",
      description: "Same prices with energy capacity sized to four hours at max discharge.",
      prices: clonePrices(prices),
      twin: buildFourHourTwin(twin),
    },
  ];

  const baseDispatch = buildDispatchSchedule(definitions[0]?.prices ?? [], definitions[0]?.twin ?? twin);
  const baseValueEur = dispatchValue(baseDispatch);

  return definitions.map((definition) => {
    const dispatch =
      definition.id === "base" ? baseDispatch : buildDispatchSchedule(definition.prices, definition.twin);

    return {
      ...definition,
      dispatch,
      summary: summarizeScenarioDispatch(dispatch, definition.twin, baseValueEur),
      feasibilityStatus: assessFeasibility(dispatch, definition.twin),
    };
  });
}

export function perturbGasShock(prices: DamPricePoint[]): DamPricePoint[] {
  const topQuartile = priceQuantile(prices, 0.75);

  return prices.map((point) => {
    const hour = hourFromMtu(point.interval.mtu);
    const adder = hour >= 18 && hour <= 22 ? 35 : point.mcpEurPerMwh >= topQuartile ? 20 : 0;

    return withPrice(point, point.mcpEurPerMwh + adder);
  });
}

export function perturbSolarSurplus(prices: DamPricePoint[]): DamPricePoint[] {
  return prices.map((point) => {
    const hour = hourFromMtu(point.interval.mtu);
    const middayDiscount = hour >= 10 && hour <= 16 ? -25 : 0;
    const eveningRamp = hour >= 19 && hour <= 21 ? 10 : 0;

    return withPrice(point, point.mcpEurPerMwh + middayDiscount + eveningRamp);
  });
}

export function buildFourHourTwin(twin: BatteryTwinConfig): BatteryTwinConfig {
  const capacityMwh = twin.maxDischargeMw * 4;

  return {
    ...twin,
    capacityMwh,
    maxSocMwh: capacityMwh * 0.95,
    minSocMwh: capacityMwh * 0.1,
    initialSocMwh: capacityMwh * 0.45,
  };
}

export function summarizeScenarioDispatch(
  dispatch: DispatchPoint[],
  twin: BatteryTwinConfig,
  baseValueEur = 0,
): ScenarioComparisonSummary {
  const valueEur = dispatchValue(dispatch);
  const throughputMwh = dispatch.reduce((total, point) => total + point.mwh, 0);
  const degradationCostEur = throughputMwh * twin.degradationCostEurPerMwh;
  const equivalentCycles = twin.capacityMwh > 0 ? throughputMwh / (2 * twin.capacityMwh) : 0;
  const valueDeltaEur = valueEur - baseValueEur;
  const valueDeltaPercent = baseValueEur === 0 ? null : (valueDeltaEur / Math.abs(baseValueEur)) * 100;

  return {
    valueEur: round(valueEur, 2),
    degradationCostEur: round(degradationCostEur, 2),
    throughputMwh: round(throughputMwh, 3),
    equivalentCycles: round(equivalentCycles, 3),
    chargeWindow: actionWindow(dispatch, "charge"),
    dischargeWindow: actionWindow(dispatch, "discharge"),
    valueDeltaEur: round(valueDeltaEur, 2),
    valueDeltaPercent: valueDeltaPercent === null ? null : round(valueDeltaPercent, 1),
  };
}

export function buildScenarioExecutiveSummary(comparisons: ScenarioComparison[]): string[] {
  const base = comparisons.find((comparison) => comparison.id === "base");
  const gasShock = comparisons.find((comparison) => comparison.id === "gas-shock");
  const solarSurplus = comparisons.find((comparison) => comparison.id === "solar-surplus");
  const fourHour = comparisons.find((comparison) => comparison.id === "four-hour");
  const lines: string[] = [];

  if (gasShock) {
    lines.push(
      `Gas shock changes dispatch value by ${formatDeltaPercent(gasShock.summary.valueDeltaPercent)} versus base and tests evening scarcity discharge at ${gasShock.summary.dischargeWindow}.`,
    );
  }

  if (solarSurplus) {
    lines.push(
      `Solar surplus shifts the charge test toward ${solarSurplus.summary.chargeWindow} while preserving the same deterministic scheduler.`,
    );
  }

  if (fourHour) {
    lines.push(
      `The 4h battery case moves ${formatDeltaEur(fourHour.summary.valueDeltaEur)} of value with ${fourHour.summary.equivalentCycles.toFixed(2)} equivalent cycles.`,
    );
  }

  if (base) {
    const allPass = comparisons.every((comparison) => comparison.feasibilityStatus === "pass");
    lines.push(
      allPass
        ? "Base schedule remains feasible across all simulated scenarios."
        : "One or more scenario schedules need operator review before execution.",
    );
  }

  return lines;
}

function assessFeasibility(dispatch: DispatchPoint[], twin: BatteryTwinConfig): ScenarioFeasibilityStatus {
  if (dispatch.length === 0) {
    return "missing";
  }

  const intervalHours = 0.25;
  const hasViolation = dispatch.some((point) => {
    if (point.socMwh < twin.minSocMwh || point.socMwh > twin.maxSocMwh) return true;
    if (point.mwh < 0 || point.mw < 0) return true;
    if (point.action === "charge" && point.mw > twin.maxChargeMw) return true;
    if (point.action === "discharge" && point.mw > twin.maxDischargeMw) return true;
    if (point.mwh > point.mw * intervalHours + 0.001) return true;
    return false;
  });

  return hasViolation ? "review" : "pass";
}

function dispatchValue(dispatch: DispatchPoint[]) {
  return dispatch.reduce((total, point) => total + point.estimatedValueEur, 0);
}

function actionWindow(dispatch: DispatchPoint[], action: DispatchAction) {
  const mtus = dispatch
    .filter((point) => point.action === action)
    .map((point) => point.interval.mtu)
    .sort((a, b) => a - b);

  if (mtus.length === 0) return "No MTUs";

  const ranges: string[] = [];
  let start = mtus[0] ?? 0;
  let previous = start;

  for (const mtu of mtus.slice(1)) {
    if (mtu === previous + 1) {
      previous = mtu;
      continue;
    }
    ranges.push(formatMtuRange(start, previous));
    start = mtu;
    previous = mtu;
  }

  ranges.push(formatMtuRange(start, previous));
  return ranges.join(", ");
}

function formatMtuRange(start: number, end: number) {
  return start === end ? `MTU ${start}` : `MTU ${start}-${end}`;
}

function formatDeltaPercent(value: number | null) {
  if (value === null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatDeltaEur(value: number) {
  return `${value >= 0 ? "+" : "-"}EUR ${Math.abs(value).toFixed(0)}`;
}

function clonePrices(prices: DamPricePoint[]) {
  return prices.map((point) => ({ ...point, interval: { ...point.interval } }));
}

function withPrice(point: DamPricePoint, price: number): DamPricePoint {
  return {
    ...point,
    interval: { ...point.interval },
    mcpEurPerMwh: round(price, 2),
  };
}

function priceQuantile(prices: DamPricePoint[], q: number) {
  if (prices.length === 0) return 0;
  const values = prices.map((point) => point.mcpEurPerMwh).sort((a, b) => a - b);
  const index = Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * q)));
  return values[index] ?? 0;
}

function hourFromMtu(mtu: number) {
  return Math.floor((mtu - 1) / 4);
}

function round(value: number, digits: number) {
  return Number(value.toFixed(digits));
}
