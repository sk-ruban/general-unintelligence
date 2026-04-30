import { describe, expect, it } from "vitest";
import { defaultBatteryTwin } from "@/lib/battery-dispatch";
import { marketIntervalFromLocal } from "@/lib/market-time";
import {
  buildFourHourTwin,
  buildScenarioComparisons,
  buildScenarioExecutiveSummary,
  perturbGasShock,
  perturbSolarSurplus,
} from "@/lib/scenario-comparison";
import type { DamPricePoint } from "@/lib/types";

describe("scenario comparison", () => {
  it("builds deterministic scenarios by perturbing inputs and rerunning schedules", () => {
    const prices = buildDayAheadPrices();
    const twin = {
      ...defaultBatteryTwin,
      capacityMwh: 80,
      maxChargeMw: 40,
      maxDischargeMw: 40,
      initialSocMwh: 35,
      minSocMwh: 8,
      maxSocMwh: 76,
    };

    const comparisons = buildScenarioComparisons(prices, twin);
    const base = comparisons.find((comparison) => comparison.id === "base");
    const gasShock = comparisons.find((comparison) => comparison.id === "gas-shock");
    const solarSurplus = comparisons.find((comparison) => comparison.id === "solar-surplus");
    const fourHour = comparisons.find((comparison) => comparison.id === "four-hour");

    expect(comparisons.map((comparison) => comparison.id)).toEqual([
      "base",
      "gas-shock",
      "solar-surplus",
      "four-hour",
    ]);
    expect(base?.summary.valueDeltaEur).toBe(0);
    expect(gasShock?.dispatch).toHaveLength(prices.length);
    expect(gasShock?.dispatch[72]?.priceEurPerMwh).toBe((prices[72]?.mcpEurPerMwh ?? 0) + 35);
    expect(solarSurplus?.dispatch[44]?.priceEurPerMwh).toBe((prices[44]?.mcpEurPerMwh ?? 0) - 25);
    expect(gasShock?.summary.valueEur).not.toBe(base?.summary.valueEur);
    expect(gasShock?.summary.valueDeltaEur).toBeCloseTo(
      (gasShock?.summary.valueEur ?? 0) - (base?.summary.valueEur ?? 0),
      2,
    );
    expect(solarSurplus?.summary.chargeWindow).toContain("MTU");
    expect(fourHour?.twin.capacityMwh).toBe(twin.maxDischargeMw * 4);
    expect(fourHour?.summary.equivalentCycles).not.toBe(base?.summary.equivalentCycles);
    expect(comparisons.every((comparison) => comparison.feasibilityStatus === "pass")).toBe(true);
  });

  it("returns scenario deltas and deterministic executive summary text", () => {
    const comparisons = buildScenarioComparisons(buildDayAheadPrices(), defaultBatteryTwin);
    const summary = buildScenarioExecutiveSummary(comparisons);

    expect(summary).toHaveLength(4);
    expect(summary[0]).toContain("Gas shock changes dispatch value");
    expect(summary[1]).toContain("Solar surplus shifts the charge test");
    expect(summary[2]).toContain("The 4h battery case moves");
    expect(summary[3]).toBe("Base schedule remains feasible across all simulated scenarios.");
    expect(summary).toEqual(buildScenarioExecutiveSummary(comparisons));
  });

  it("keeps perturbation helpers pure and applies the requested deterministic rules", () => {
    const prices = buildDayAheadPrices();
    const gasShock = perturbGasShock(prices);
    const solarSurplus = perturbSolarSurplus(prices);
    const fourHourTwin = buildFourHourTwin(defaultBatteryTwin);

    expect(prices[72]?.mcpEurPerMwh).toBe(130);
    expect(gasShock[72]?.mcpEurPerMwh).toBe(165);
    expect(solarSurplus[44]?.mcpEurPerMwh).toBe(0);
    expect(solarSurplus[80]?.mcpEurPerMwh).toBe(140);
    expect(fourHourTwin.capacityMwh).toBe(defaultBatteryTwin.maxDischargeMw * 4);
    expect(fourHourTwin.maxSocMwh).toBe(fourHourTwin.capacityMwh * 0.95);
    expect(fourHourTwin.minSocMwh).toBe(fourHourTwin.capacityMwh * 0.1);
    expect(fourHourTwin.initialSocMwh).toBe(fourHourTwin.capacityMwh * 0.45);
  });
});

function buildDayAheadPrices(): DamPricePoint[] {
  return Array.from({ length: 96 }, (_, index) => {
    const mtu = index + 1;
    return {
      interval: marketIntervalFromLocal("2026-04-30", mtu),
      mcpEurPerMwh: priceForMtu(mtu),
      totalTrades: 12,
      publishedAtLocal: "2026-04-29 14:15",
      version: 1,
      sourceFile: "test.xlsx",
    };
  });
}

function priceForMtu(mtu: number) {
  if (mtu >= 41 && mtu <= 64) return 25;
  if (mtu >= 25 && mtu <= 40) return 35;
  if (mtu >= 73 && mtu <= 88) return 130;
  if (mtu >= 89) return 75;
  if (mtu >= 65) return 65;
  return 55;
}
