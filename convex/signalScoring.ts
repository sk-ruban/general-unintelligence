export type SignalQuality = "observed" | "proxy" | "missing";

export type SignalPricePoint = {
  marketDate: string;
  timestamp: string;
  mtu: number;
  mcpEurPerMwh: number;
  buyVolume?: number | null;
  sellVolume?: number | null;
  totalTrades?: number | null;
  sourceRowCount?: number;
};

export type SignalWeatherPoint = {
  timestamp?: string;
  solarAvailabilityScore?: number | null;
  windGenerationProxy?: number | null;
  weatherDemandStress?: number | null;
};

export type SignalContext = {
  weatherByLocalMinute?: Map<string, SignalWeatherPoint>;
  fuelCostEurPerMwhElectric?: number | null;
  euaPriceEurPerTonne?: number | null;
  greekForwardPriceEurPerMwh?: number | null;
  battery?: {
    initialSocMwh?: number;
    minSocMwh?: number;
    maxSocMwh?: number;
  };
};

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

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scoreFromRange(value: number, min: number, max: number) {
  if (max <= min) {
    return 0.5;
  }
  return clamp((value - min) / (max - min));
}

function localMinute(timestamp: string) {
  return timestamp.slice(0, 16);
}

function weatherForTimestamp(
  weatherByLocalMinute: Map<string, SignalWeatherPoint> | undefined,
  timestamp: string,
) {
  if (!weatherByLocalMinute) {
    return undefined;
  }
  const minute = localMinute(timestamp);
  return weatherByLocalMinute.get(minute) ?? weatherByLocalMinute.get(`${minute.slice(0, 13)}:00`);
}

function average(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (valid.length === 0) {
    return null;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function weightedAverage(values: Array<[number | null, number]>) {
  const valid = values.filter(
    (entry): entry is [number, number] => entry[0] !== null && Number.isFinite(entry[0]),
  );
  if (valid.length === 0) {
    return null;
  }
  const totalWeight = valid.reduce((sum, [, weight]) => sum + weight, 0);
  return valid.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight;
}

function fuelCarbonStress(context: SignalContext) {
  const fuel = numberValue(context.fuelCostEurPerMwhElectric);
  const eua = numberValue(context.euaPriceEurPerTonne);
  const forward = numberValue(context.greekForwardPriceEurPerMwh);
  return weightedAverage([
    [fuel === null ? null : clamp(fuel / 180), 0.45],
    [eua === null ? null : clamp(eua / 120), 0.25],
    [forward === null ? null : clamp(forward / 200), 0.3],
  ]);
}

function batteryScores(context: SignalContext) {
  const initial = numberValue(context.battery?.initialSocMwh) ?? 100;
  const minimum = numberValue(context.battery?.minSocMwh) ?? 20;
  const maximum = numberValue(context.battery?.maxSocMwh) ?? 180;
  const usable = Math.max(1, maximum - minimum);
  return {
    headroom: clamp((maximum - initial) / usable),
    available: clamp((initial - minimum) / usable),
  };
}

function regimeFor(signals: BatterySignalInterval["signals"], inputs: BatterySignalInterval["inputs"]) {
  if (signals.marketFragility >= 0.72) {
    return "fragile-market" as const;
  }
  if (
    signals.dischargeScarcity >= 0.68 &&
    inputs.weatherDemandStress !== null &&
    inputs.weatherDemandStress >= 0.55
  ) {
    return "evening-scarcity" as const;
  }
  if (
    inputs.fuelCarbonStress !== null &&
    inputs.fuelCarbonStress >= 0.7 &&
    signals.dischargeScarcity >= 0.58
  ) {
    return "fuel-carbon-stress" as const;
  }
  if (
    inputs.windGenerationProxy !== null &&
    inputs.windGenerationProxy >= 0.7 &&
    signals.chargeAttractiveness >= 0.55
  ) {
    return "wind-surplus" as const;
  }
  if (signals.curtailmentAbsorption >= 0.62) {
    return "solar-surplus" as const;
  }
  return "normal" as const;
}

function explanationFor(interval: BatterySignalInterval) {
  const parts = [];
  if (interval.signals.chargeAttractiveness >= 0.65) {
    parts.push(
      "Charge signal is high because price is low relative to the selected range and renewable/weather proxies are favorable.",
    );
  }
  if (interval.signals.dischargeScarcity >= 0.65) {
    parts.push(
      "Discharge signal is high because price is elevated and scarcity/fuel stress proxies support value capture.",
    );
  }
  if (interval.signals.marketFragility >= 0.65) {
    parts.push("Market fragility is elevated from price jump, volume depth, or volatility proxies.");
  }
  if (interval.confidence < 0.55) {
    parts.push(
      "Confidence is limited because one or more system-fundamental inputs are still proxy or missing.",
    );
  }
  if (parts.length === 0) {
    parts.push("Signals are moderate; no single driver dominates this interval.");
  }
  return parts;
}

export function buildBatterySignals(args: {
  priceSeries: SignalPricePoint[];
  range: { from: string; to: string };
  timezone?: string;
  source?: string;
  context?: SignalContext;
  dataFreshness?: Record<string, unknown>;
}): BatterySignalResponse {
  const context = args.context ?? {};
  const priceSeries = args.priceSeries
    .filter((point) => Number.isFinite(point.mcpEurPerMwh))
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.mtu - right.mtu);
  const prices = priceSeries.map((point) => point.mcpEurPerMwh);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const spread = Math.max(1, maxPrice - minPrice);
  const volumes = priceSeries
    .map((point) => numberValue(point.totalTrades))
    .filter((value): value is number => value !== null);
  const maxVolume = volumes.length > 0 ? Math.max(...volumes) : null;
  const stress = fuelCarbonStress(context);
  const battery = batteryScores(context);

  const intervals = priceSeries.map((point, index): BatterySignalInterval => {
    const previous = priceSeries[index - 1];
    const pricePosition = scoreFromRange(point.mcpEurPerMwh, minPrice, maxPrice);
    const lowPriceScore = 1 - pricePosition;
    const highPriceScore = pricePosition;
    const spreadOpportunity = clamp(spread / Math.max(1, Math.abs((maxPrice + minPrice) / 2)));
    const jump = previous ? Math.abs(point.mcpEurPerMwh - previous.mcpEurPerMwh) / spread : 0;
    const priceJumpStress = clamp(jump);
    const volume = numberValue(point.totalTrades);
    const volumeDepthScore =
      volume !== null && maxVolume !== null && maxVolume > 0 ? clamp(volume / maxVolume) : null;
    const weather = weatherForTimestamp(context.weatherByLocalMinute, point.timestamp);
    const solarAvailabilityScore = numberValue(weather?.solarAvailabilityScore);
    const windGenerationProxy = numberValue(weather?.windGenerationProxy);
    const weatherDemandStress = numberValue(weather?.weatherDemandStress);
    const renewableSurplus = average([solarAvailabilityScore, windGenerationProxy]);
    const marketFragility = clamp(
      0.5 * priceJumpStress +
        0.3 * (volumeDepthScore === null ? 0.35 : 1 - volumeDepthScore) +
        0.2 * Math.abs(pricePosition - 0.5) * 2,
    );
    const curtailmentAbsorption = clamp(
      (solarAvailabilityScore ?? 0.35) * 0.35 +
        (windGenerationProxy ?? 0.25) * 0.2 +
        lowPriceScore * 0.3 +
        (weatherDemandStress === null ? 0.08 : (1 - weatherDemandStress) * 0.15),
    );
    const dischargeScarcity = clamp(
      highPriceScore * 0.36 +
        (weatherDemandStress ?? 0.35) * 0.18 +
        (stress ?? 0.35) * 0.18 +
        (renewableSurplus === null ? 0.08 : (1 - renewableSurplus) * 0.13) +
        (1 - marketFragility) * 0.1 +
        battery.available * 0.05,
    );
    const chargeAttractiveness = clamp(
      lowPriceScore * 0.35 +
        curtailmentAbsorption * 0.25 +
        (1 - marketFragility) * 0.15 +
        battery.headroom * 0.15 +
        spreadOpportunity * 0.1,
    );
    const spreadRobustness = clamp(
      spreadOpportunity *
        (1 - marketFragility) *
        (0.65 + 0.35 * Math.max(chargeAttractiveness, dischargeScarcity)),
    );
    const flexibilityValueIndex = clamp(
      Math.max(chargeAttractiveness, dischargeScarcity) * 0.35 +
        spreadOpportunity * 0.18 +
        curtailmentAbsorption * 0.17 +
        dischargeScarcity * 0.15 +
        spreadRobustness * 0.15,
    );
    const observedInputs = [
      "price",
      "volume",
      solarAvailabilityScore === null ? null : "weather",
      stress === null ? null : "fuelCarbon",
    ].filter(Boolean).length;
    const confidence = clamp(
      0.28 +
        observedInputs * 0.14 +
        (volumeDepthScore === null ? 0 : 0.08) +
        (weather === undefined ? 0 : 0.08),
    );
    const quality = {
      price: "observed",
      volume: volume === null ? "missing" : "observed",
      weather: weather === undefined ? "missing" : "proxy",
      systemLoad: "missing",
      residualLoad: "missing",
      curtailment: "proxy",
      fuelCarbon: stress === null ? "missing" : "proxy",
      marketFragility: "proxy",
      batteryState: "proxy",
    } satisfies Record<string, SignalQuality>;
    const interval: BatterySignalInterval = {
      marketDate: point.marketDate,
      timestamp: point.timestamp,
      localMinute: localMinute(point.timestamp),
      mtu: point.mtu,
      priceEurPerMwh: point.mcpEurPerMwh,
      volumeMw: volume,
      inputs: {
        pricePosition: round(pricePosition),
        lowPriceScore: round(lowPriceScore),
        highPriceScore: round(highPriceScore),
        spreadOpportunity: round(spreadOpportunity),
        priceJumpStress: round(priceJumpStress),
        volumeDepthScore: volumeDepthScore === null ? null : round(volumeDepthScore),
        solarAvailabilityScore: solarAvailabilityScore === null ? null : round(solarAvailabilityScore),
        windGenerationProxy: windGenerationProxy === null ? null : round(windGenerationProxy),
        weatherDemandStress: weatherDemandStress === null ? null : round(weatherDemandStress),
        fuelCarbonStress: stress === null ? null : round(stress),
        batteryHeadroomScore: round(battery.headroom),
        batteryEnergyAvailableScore: round(battery.available),
      },
      signals: {
        flexibilityValueIndex: round(flexibilityValueIndex),
        chargeAttractiveness: round(chargeAttractiveness),
        dischargeScarcity: round(dischargeScarcity),
        curtailmentAbsorption: round(curtailmentAbsorption),
        spreadRobustness: round(spreadRobustness),
        marketFragility: round(marketFragility),
      },
      regime: "normal",
      confidence: round(confidence),
      quality,
      explanation: [],
    };
    interval.regime = regimeFor(interval.signals, interval.inputs);
    interval.explanation = explanationFor(interval);
    return interval;
  });

  const regimeCounts = intervals.reduce<Record<string, number>>((counts, interval) => {
    counts[interval.regime] = (counts[interval.regime] ?? 0) + 1;
    return counts;
  }, {});
  const averageFvi = average(intervals.map((interval) => interval.signals.flexibilityValueIndex));
  const topBy = (selector: (interval: BatterySignalInterval) => number) =>
    [...intervals].sort((left, right) => selector(right) - selector(left)).slice(0, 6);

  return {
    source: args.source ?? "battery-signal-engine",
    timezone: args.timezone ?? "Europe/Athens",
    range: args.range,
    generatedAtUtc: new Date().toISOString(),
    intervals,
    summary: {
      intervalCount: intervals.length,
      averageFvi: averageFvi === null ? null : round(averageFvi),
      bestChargeWindows: topBy((interval) => interval.signals.chargeAttractiveness),
      bestDischargeWindows: topBy((interval) => interval.signals.dischargeScarcity),
      highestCurtailmentWindows: topBy((interval) => interval.signals.curtailmentAbsorption),
      regimeCounts,
      dataFreshness: args.dataFreshness ?? {},
      caveats: [
        "System load, RES actuals, residual load, and interconnection constraints are not yet backed by IPTO/ADMIE ingestion.",
        "Curtailment, market fragility, scarcity, and FVI are MVP proxy signals built from DAM prices/volumes, weather features, fuel/carbon context, and battery headroom assumptions.",
        "Use quality fields per interval before presenting a signal as observed rather than proxy-derived.",
      ],
    },
  };
}
