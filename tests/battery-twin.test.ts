import { describe, expect, it } from "vitest";
import { buildDispatchSchedule } from "@/lib/battery-dispatch";
import {
  BATTERY_TWIN_TEMPLATES,
  buildBatteryTwin,
  buildCapacityStack,
  evaluateDispatchFeasibility,
  getMissingSpecs,
  toOptimizerConstraints,
} from "@/lib/battery-twin";
import { marketIntervalFromLocal } from "@/lib/market-time";
import type { DamPricePoint, DispatchPoint } from "@/lib/types";

function prices(values: number[]): DamPricePoint[] {
  return values.map((price, index) => ({
    interval: marketIntervalFromLocal("2026-04-30", index + 1),
    mcpEurPerMwh: price,
    totalTrades: 10,
    publishedAtLocal: "2026-04-29 14:15",
    version: 1,
    sourceFile: "test.xlsx",
  }));
}

describe("battery twin templates", () => {
  it("includes the Greek project templates and custom-friendly manufacturer archetypes", () => {
    const ids = BATTERY_TWIN_TEMPLATES.map((template) => template.profile.id);

    expect(ids).toEqual([
      "generic-greece-2h-lfp",
      "generic-greece-4h-lfp",
      "ppc-amyntaio-trina",
      "metlen-karatzis-thessaly",
      "ppc-melitis-1",
      "ppc-ptolemaida-4",
      "jinko-suntera",
      "sungrow-powertitan",
      "byd-mc-cube-t",
      "custom",
    ]);
  });

  it("builds the Amyntaio capacity stack from known Trina nameplate and contracted energy", () => {
    const twin = buildBatteryTwin("ppc-amyntaio-trina");

    expect(twin.capacityStack).toMatchObject({
      nameplateMwhDc: 244,
      nameplateEstimated: false,
      contractedUsableMwh: 200,
      operationalWindowMwh: 160,
      availableAfterSohMwh: 160,
    });
    expect(twin.capacityStack.acDispatchableMwhEstimate).toBeCloseTo(150.944, 3);
    expect(twin.capacityStack.nameplateToUsableGap).toBeCloseTo(0.1803, 4);
  });

  it("estimates missing nameplate capacity for scarce-spec assets", () => {
    const twin = buildBatteryTwin("metlen-karatzis-thessaly");

    expect(twin.capacityStack.nameplateEstimated).toBe(true);
    expect(twin.capacityStack.nameplateMwhDc).toBeCloseTo(929.412, 3);
    expect(getMissingSpecs(twin).map((spec) => spec.label)).toContain("supplier");
  });

  it("honors operator overrides when calculating the stack", () => {
    const stack = buildCapacityStack({
      ...buildBatteryTwin("generic-greece-4h-lfp").parameters,
      minSocPct: 15,
      maxSocPct: 85,
      stateOfHealthPct: 95,
      roundTripEfficiencyAc: 0.88,
    });

    expect(stack.operationalWindowMwh).toBe(140);
    expect(stack.availableAfterSohMwh).toBe(133);
    expect(stack.acDispatchableMwhEstimate).toBeCloseTo(124.765, 3);
  });
});

describe("battery twin optimizer mapping", () => {
  it("maps rich twin parameters to the existing optimizer-compatible config", () => {
    const twin = buildBatteryTwin("ppc-melitis-1", {
      minSocPct: 15,
      maxSocPct: 85,
      initialSocPct: 50,
      availabilityPct: 90,
    });

    expect(twin.optimizerConfig).toEqual({
      capacityMwh: 96,
      maxChargeMw: 43.2,
      maxDischargeMw: 43.2,
      roundTripEfficiency: 0.89,
      minSocMwh: 14.4,
      maxSocMwh: 81.6,
      initialSocMwh: 48,
      degradationCostEurPerMwh: 4,
    });
    expect(twin.optimizerConstraints.reserveSocMwh).toBe(9.6);
  });

  it("uses derived constraints with the existing dispatch scheduler", () => {
    const twin = buildBatteryTwin("generic-greece-2h-lfp", {
      maxChargePowerMw: 20,
      maxDischargePowerMw: 20,
      availabilityPct: 100,
      minSocPct: 20,
      maxSocPct: 80,
      initialSocPct: 50,
    });
    const schedule = buildDispatchSchedule(prices([10, 20, 30, 150, 180, 220]), twin.optimizerConfig);

    expect(schedule.every((point) => point.socMwh >= 20 && point.socMwh <= 80)).toBe(true);
    expect(schedule.every((point) => point.mw <= 20)).toBe(true);
    expect(schedule.some((point) => point.action === "charge")).toBe(true);
    expect(schedule.some((point) => point.action === "discharge")).toBe(true);
  });

  it("exposes symmetric charge and discharge efficiencies for preview UI", () => {
    const constraints = toOptimizerConstraints(buildBatteryTwin("generic-greece-2h-lfp").parameters);

    expect(constraints.chargeEfficiency).toBeCloseTo(Math.sqrt(0.89), 5);
    expect(constraints.dischargeEfficiency).toBeCloseTo(Math.sqrt(0.89), 5);
  });
});

describe("battery twin feasibility", () => {
  it("passes a schedule generated from matching twin constraints", () => {
    const twin = buildBatteryTwin("ppc-ptolemaida-4", {
      reserveSocPct: 0,
      terminalSocPolicy: "none",
    });
    const schedule = buildDispatchSchedule(prices([20, 25, 30, 160, 190, 210]), twin.optimizerConfig);
    const report = evaluateDispatchFeasibility(schedule, twin.optimizerConstraints);

    expect(report.find((check) => check.id === "soc-bounds")?.status).toBe("pass");
    expect(report.find((check) => check.id === "power-limits")?.status).toBe("pass");
    expect(report.find((check) => check.id === "capacity-stack")?.status).toBe("pass");
  });

  it("flags dispatch points that violate selected twin constraints", () => {
    const twin = buildBatteryTwin("generic-greece-2h-lfp", {
      maxChargePowerMw: 10,
      maxDischargePowerMw: 10,
      maxCyclesPerDay: 0.01,
      reserveSocPct: 20,
      terminalSocPolicy: "equal-start",
    });
    const badSchedule: DispatchPoint[] = [
      {
        interval: marketIntervalFromLocal("2026-04-30", 1),
        action: "charge",
        mw: 12,
        mwh: 3,
        socMwh: 95,
        priceEurPerMwh: 10,
        estimatedValueEur: -30,
        reason: "test violation",
      },
      {
        interval: marketIntervalFromLocal("2026-04-30", 2),
        action: "discharge",
        mw: 12,
        mwh: 3,
        socMwh: 11,
        priceEurPerMwh: 200,
        estimatedValueEur: 600,
        reason: "test violation",
      },
    ];

    const statuses = new Map(
      evaluateDispatchFeasibility(badSchedule, twin.optimizerConstraints).map((check) => [
        check.id,
        check.status,
      ]),
    );

    expect(statuses.get("soc-bounds")).toBe("review");
    expect(statuses.get("power-limits")).toBe("review");
    expect(statuses.get("cycle-policy")).toBe("review");
    expect(statuses.get("reserve-soc")).toBe("review");
    expect(statuses.get("terminal-soc")).toBe("review");
  });
});
