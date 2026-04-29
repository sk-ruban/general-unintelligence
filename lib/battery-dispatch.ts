import type { BatteryTwinConfig, DamPricePoint, DispatchPoint } from "@/lib/types";

export const defaultBatteryTwin: BatteryTwinConfig = {
  capacityMwh: 100,
  maxChargeMw: 50,
  maxDischargeMw: 50,
  roundTripEfficiency: 0.88,
  minSocMwh: 10,
  maxSocMwh: 95,
  initialSocMwh: 45,
  degradationCostEurPerMwh: 4,
};

export function buildDispatchSchedule(
  prices: DamPricePoint[],
  config: BatteryTwinConfig = defaultBatteryTwin,
): DispatchPoint[] {
  if (prices.length === 0) {
    return [];
  }

  const sorted = [...prices].sort((a, b) => a.interval.timestampUtc.localeCompare(b.interval.timestampUtc));
  const values = sorted.map((point) => point.mcpEurPerMwh).sort((a, b) => a - b);
  const lowThreshold = quantile(values, 0.28);
  const highThreshold = quantile(values, 0.72);
  const intervalHours = 0.25;
  // v0 assumes charge and discharge losses are symmetric around round-trip efficiency.
  const chargeEfficiency = Math.sqrt(config.roundTripEfficiency);
  const dischargeEfficiency = Math.sqrt(config.roundTripEfficiency);
  let soc = clamp(config.initialSocMwh, config.minSocMwh, config.maxSocMwh);

  return sorted.map((point) => {
    const price = point.mcpEurPerMwh;
    let action: DispatchPoint["action"] = "idle";
    let mw = 0;
    let mwh = 0;
    let estimatedValueEur = 0;
    let reason = "Price is inside the neutral band.";

    if (price <= lowThreshold && soc < config.maxSocMwh) {
      action = "charge";
      const gridMwh = Math.min(
        config.maxChargeMw * intervalHours,
        (config.maxSocMwh - soc) / chargeEfficiency,
      );
      mwh = Number(gridMwh.toFixed(3));
      mw = Number((gridMwh / intervalHours).toFixed(3));
      soc += gridMwh * chargeEfficiency;
      estimatedValueEur = -gridMwh * price;
      reason = "Low-price interval; reserve energy for later discharge.";
    } else if (price >= highThreshold && soc > config.minSocMwh) {
      action = "discharge";
      const batteryMwh = Math.min(config.maxDischargeMw * intervalHours, soc - config.minSocMwh);
      const deliveredMwh = batteryMwh * dischargeEfficiency;
      mwh = Number(deliveredMwh.toFixed(3));
      mw = Number((deliveredMwh / intervalHours).toFixed(3));
      soc -= batteryMwh;
      estimatedValueEur = deliveredMwh * (price - config.degradationCostEurPerMwh);
      reason = "High-price interval clears degradation and efficiency cost.";
    }

    return {
      interval: point.interval,
      action,
      mw,
      mwh,
      socMwh: Number(soc.toFixed(3)),
      priceEurPerMwh: price,
      estimatedValueEur: Number(estimatedValueEur.toFixed(2)),
      reason,
    };
  });
}

export function summarizeDispatch(schedule: DispatchPoint[]) {
  return schedule.reduce(
    (summary, point) => {
      summary.valueEur += point.estimatedValueEur;
      if (point.action === "charge") summary.chargeMwh += point.mwh;
      if (point.action === "discharge") summary.dischargeMwh += point.mwh;
      return summary;
    },
    { valueEur: 0, chargeMwh: 0, dischargeMwh: 0 },
  );
}

function quantile(values: number[], q: number) {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * q)));
  return values[index] ?? values[0] ?? 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
