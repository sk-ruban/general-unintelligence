import type {
  AggregatedCurvePoint,
  BatteryTwinConfig,
  DamPricePoint,
  DataHealth,
  DispatchPoint,
  ExternalSignalPanel,
} from "@/lib/types";

export type DecisionConfidenceTone = "green" | "amber" | "red" | "outline";

export type DecisionConfidenceCard = {
  id: "spread-coverage" | "market-fragility" | "curtailment-fit" | "battery-stress" | "data-confidence";
  label: string;
  value: string;
  status: string;
  tone: DecisionConfidenceTone;
  detail: string;
  score?: number;
};

export type DecisionCurveStats = {
  totalPoints: number;
  buyPoints?: number;
  sellPoints?: number;
  lowPrice: number | null;
  highPrice: number | null;
};

export type BuildDecisionConfidenceInput = {
  dispatch: DispatchPoint[];
  prices: DamPricePoint[];
  curves?: AggregatedCurvePoint[];
  curveStats?: DecisionCurveStats | null;
  signals?: ExternalSignalPanel[];
  twin?: BatteryTwinConfig | null;
  health?: DataHealth | null;
};

const MAX_DAILY_CYCLES_POLICY = 1;

export function buildDecisionConfidence({
  dispatch,
  prices,
  curves = [],
  curveStats,
  signals = [],
  twin,
  health,
}: BuildDecisionConfidenceInput): DecisionConfidenceCard[] {
  return [
    spreadCoverageCard(dispatch, twin),
    marketFragilityCard(curves, curveStats),
    curtailmentFitCard(dispatch, prices, signals),
    batteryStressCard(dispatch, twin),
    dataConfidenceCard(dispatch, prices, curves, curveStats, signals, twin, health),
  ];
}

function spreadCoverageCard(dispatch: DispatchPoint[], twin: BatteryTwinConfig | null | undefined) {
  const charge = dispatch.filter((point) => point.action === "charge" && point.mwh > 0);
  const discharge = dispatch.filter((point) => point.action === "discharge" && point.mwh > 0);
  if (dispatch.length === 0) {
    return missingCard("spread-coverage", "Spread Coverage", "No dispatch schedule available.");
  }
  if (charge.length === 0 || discharge.length === 0) {
    return {
      id: "spread-coverage",
      label: "Spread Coverage",
      value: "Fail",
      status: "fail",
      tone: "red",
      detail: "No paired charge and discharge windows are available to validate the spread.",
      score: 0,
    } satisfies DecisionConfidenceCard;
  }

  const averageChargePrice = weightedAverage(charge.map((point) => [point.priceEurPerMwh, point.mwh]));
  const averageDischargePrice = weightedAverage(discharge.map((point) => [point.priceEurPerMwh, point.mwh]));
  const efficiency = clamp(numberOrNull(twin?.roundTripEfficiency) ?? 0.88, 0, 1);
  const degradationCost = numberOrNull(twin?.degradationCostEurPerMwh) ?? 0;
  const efficiencyLossProxy = averageDischargePrice * (1 - efficiency);
  const margin = averageDischargePrice - averageChargePrice - degradationCost - efficiencyLossProxy;
  const value = spreadValue(margin);

  return {
    id: "spread-coverage",
    label: "Spread Coverage",
    value,
    status: value.toLowerCase(),
    tone: margin >= 20 ? "green" : margin > 0 ? "amber" : "red",
    detail:
      margin > 0
        ? `${charge.length} charge and ${discharge.length} discharge intervals clear losses by ${margin.toFixed(1)} EUR/MWh.`
        : `${charge.length} charge and ${discharge.length} discharge intervals do not clear estimated losses.`,
    score: round(margin, 1),
  } satisfies DecisionConfidenceCard;
}

function marketFragilityCard(
  curves: AggregatedCurvePoint[],
  curveStats: DecisionCurveStats | null | undefined,
) {
  const stats = curveStats ?? summarizeCurveStats(curves);
  if (!stats || stats.totalPoints === 0) {
    return missingCard(
      "market-fragility",
      "Market Fragility",
      "No curve data is available for the selected MTU.",
    );
  }

  const lowPrice = numberOrNull(stats.lowPrice);
  const highPrice = numberOrNull(stats.highPrice);
  const priceRange = lowPrice === null || highPrice === null ? 0 : Math.max(0, highPrice - lowPrice);
  const curveDepthScore = Math.min(1, stats.totalPoints / 150);
  const priceRangeScore = clamp(priceRange / 300);
  const fragility = clamp(1 - 0.65 * curveDepthScore + 0.35 * priceRangeScore);
  const value = fragility <= 0.35 ? "Low" : fragility <= 0.65 ? "Medium" : "High";

  return {
    id: "market-fragility",
    label: "Market Fragility",
    value,
    status: value.toLowerCase(),
    tone: value === "Low" ? "green" : value === "Medium" ? "amber" : "red",
    detail: `Curve depth suggests this interval is ${value.toLowerCase()} sensitivity to volume shifts (${stats.totalPoints} points).`,
    score: round(fragility, 3),
  } satisfies DecisionConfidenceCard;
}

function curtailmentFitCard(
  dispatch: DispatchPoint[],
  prices: DamPricePoint[],
  signals: ExternalSignalPanel[],
) {
  const charge = dispatch.filter((point) => point.action === "charge" && point.mwh > 0);
  if (charge.length === 0) {
    return missingCard("curtailment-fit", "Curtailment Fit", "No charge schedule is available.");
  }

  const totalChargeMwh = sum(charge.map((point) => point.mwh));
  const middayChargeMwh = sum(
    charge.filter((point) => isMiddayMtu(point.interval.mtu)).map((point) => point.mwh),
  );
  const lowPriceThreshold = lowPriceThresholdFor(prices);
  const lowPriceChargeMwh =
    lowPriceThreshold === null
      ? 0
      : sum(charge.filter((point) => point.priceEurPerMwh <= lowPriceThreshold).map((point) => point.mwh));
  const weatherBonus = solarAvailabilityScore(signals) ?? 0.5;
  const fit = clamp(
    0.4 * safeRatio(middayChargeMwh, totalChargeMwh) +
      0.4 * safeRatio(lowPriceChargeMwh, totalChargeMwh) +
      0.2 * weatherBonus,
  );
  const value = fit >= 0.7 ? "High" : fit >= 0.4 ? "Medium" : "Low";

  return {
    id: "curtailment-fit",
    label: "Curtailment Fit",
    value,
    status: value.toLowerCase(),
    tone: value === "High" ? "green" : value === "Medium" ? "amber" : "red",
    detail: `${Math.round(safeRatio(middayChargeMwh, totalChargeMwh) * 100)}% midday charge and ${Math.round(
      safeRatio(lowPriceChargeMwh, totalChargeMwh) * 100,
    )}% low-price charge alignment.`,
    score: round(fit, 3),
  } satisfies DecisionConfidenceCard;
}

function batteryStressCard(dispatch: DispatchPoint[], twin: BatteryTwinConfig | null | undefined) {
  const active = dispatch.filter((point) => point.action !== "idle" && point.mwh > 0);
  if (dispatch.length === 0 || active.length === 0) {
    return missingCard("battery-stress", "Battery Stress (MVP)", "No active dispatch is available.");
  }

  const capacityMwh = Math.max(1, numberOrNull(twin?.capacityMwh) ?? 100);
  const minSoc = numberOrNull(twin?.minSocMwh) ?? 0;
  const maxSoc = numberOrNull(twin?.maxSocMwh) ?? capacityMwh;
  const usableSoc = Math.max(1, maxSoc - minSoc);
  const throughput = sum(active.map((point) => point.mwh));
  const equivalentCycles = throughput / (2 * capacityMwh);
  const socExtremeShare = safeRatio(
    dispatch.filter(
      (point) => point.socMwh <= minSoc + usableSoc * 0.1 || point.socMwh >= maxSoc - usableSoc * 0.1,
    ).length,
    dispatch.length,
  );
  const highPowerShare = safeRatio(
    active.filter((point) => point.mw >= highPowerThreshold(point, twin)).length,
    active.length,
  );
  const stress = clamp(
    0.45 * clamp(equivalentCycles / MAX_DAILY_CYCLES_POLICY) + 0.3 * socExtremeShare + 0.25 * highPowerShare,
  );
  const value = stress >= 0.65 ? "High" : stress >= 0.35 ? "Medium" : "Low";

  return {
    id: "battery-stress",
    label: "Battery Stress (MVP)",
    value,
    status: value.toLowerCase(),
    tone: value === "Low" ? "green" : value === "Medium" ? "amber" : "red",
    detail: `Heuristic score based on ${equivalentCycles.toFixed(2)} cycles, SoC extremes, and power usage.`,
    score: round(stress, 3),
  } satisfies DecisionConfidenceCard;
}

function dataConfidenceCard(
  dispatch: DispatchPoint[],
  prices: DamPricePoint[],
  curves: AggregatedCurvePoint[],
  curveStats: DecisionCurveStats | null | undefined,
  signals: ExternalSignalPanel[],
  twin: BatteryTwinConfig | null | undefined,
  health: DataHealth | null | undefined,
) {
  if (dispatch.length === 0) {
    return missingCard("data-confidence", "Data Confidence", "No schedule is available to validate.");
  }

  const hasDam = prices.length > 0 || (health?.priceRows ?? 0) > 0;
  const hasTwin = twin !== null && twin !== undefined;
  const hasCurves = curves.length > 0 || (curveStats?.totalPoints ?? 0) > 0 || (health?.curveRows ?? 0) > 0;
  const hasWeather = signalAvailable(signals, "Weather");
  const hasFuelContext = signalAvailable(signals, "TTF") || signalAvailable(signals, "EEX");
  const score =
    (hasDam ? 0.4 : 0) +
    (hasTwin ? 0.2 : 0) +
    (hasCurves ? 0.15 : 0) +
    (hasWeather ? 0.15 : 0) +
    (hasFuelContext ? 0.1 : 0);
  const contextCount = [hasCurves, hasWeather, hasFuelContext].filter(Boolean).length;
  const value = hasDam && hasTwin && contextCount >= 2 ? "High" : hasDam && hasTwin ? "Medium" : "Low";
  const missing = [
    hasDam ? null : "DAM prices",
    hasTwin ? null : "battery twin",
    hasCurves ? null : "curves",
    hasWeather ? null : "weather",
    hasFuelContext ? null : "fuel/forward context",
  ].filter((entry): entry is string => entry !== null);

  return {
    id: "data-confidence",
    label: "Data Confidence",
    value,
    status: value.toLowerCase(),
    tone: value === "High" ? "green" : value === "Medium" ? "amber" : "red",
    detail: missing.length === 0 ? "All MVP decision inputs are present." : `Missing: ${missing.join(", ")}.`,
    score: Math.round(score * 100),
  } satisfies DecisionConfidenceCard;
}

function missingCard(
  id: DecisionConfidenceCard["id"],
  label: DecisionConfidenceCard["label"],
  detail: string,
): DecisionConfidenceCard {
  return {
    id,
    label,
    value: "Missing",
    status: "missing",
    tone: "outline",
    detail,
  };
}

function spreadValue(margin: number) {
  if (margin >= 20) return "Strong";
  if (margin >= 8) return "Moderate";
  if (margin > 0) return "Weak";
  return "Fail";
}

function summarizeCurveStats(curves: AggregatedCurvePoint[]): DecisionCurveStats {
  const prices = curves.map((point) => point.unitPriceEurPerMwh);
  return {
    totalPoints: curves.length,
    buyPoints: curves.filter((point) => point.side === "Buy").length,
    sellPoints: curves.filter((point) => point.side === "Sell").length,
    lowPrice: prices.length ? Math.min(...prices) : null,
    highPrice: prices.length ? Math.max(...prices) : null,
  };
}

function highPowerThreshold(point: DispatchPoint, twin: BatteryTwinConfig | null | undefined) {
  const configured = point.action === "charge" ? twin?.maxChargeMw : twin?.maxDischargeMw;
  return Math.max(0, (numberOrNull(configured) ?? 50) * 0.85);
}

function lowPriceThresholdFor(prices: DamPricePoint[]) {
  const values = prices.map((point) => point.mcpEurPerMwh).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * 0.28)));
  return values[index] ?? null;
}

function isMiddayMtu(mtu: number) {
  return mtu >= 41 && mtu <= 64;
}

function signalAvailable(signals: ExternalSignalPanel[], label: string) {
  return signals.some(
    (signal) => signal.label.toLowerCase().includes(label.toLowerCase()) && signal.status !== "missing",
  );
}

function solarAvailabilityScore(signals: ExternalSignalPanel[]) {
  const weather = signals.find((signal) => signal.label.toLowerCase().includes("weather"));
  if (!weather || weather.status === "missing") {
    return null;
  }
  const percentMatch = weather.value.match(/(\d+(?:\.\d+)?)%/);
  if (!percentMatch) {
    return 0.5;
  }
  return clamp(Number(percentMatch[1]) / 100);
}

function weightedAverage(entries: Array<[number, number]>) {
  const totalWeight = sum(entries.map(([, weight]) => weight));
  if (totalWeight <= 0) return 0;
  return entries.reduce((total, [value, weight]) => total + value * weight, 0) / totalWeight;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function safeRatio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
