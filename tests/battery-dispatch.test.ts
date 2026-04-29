import { describe, expect, it } from "vitest";
import { buildDispatchSchedule, defaultBatteryTwin, summarizeDispatch } from "@/lib/battery-dispatch";
import { marketIntervalFromLocal } from "@/lib/market-time";
import type { DamPricePoint } from "@/lib/types";

describe("battery dispatch", () => {
  it("returns no dispatch points for an empty price series", () => {
    expect(buildDispatchSchedule([], defaultBatteryTwin)).toEqual([]);
    expect(summarizeDispatch([])).toEqual({ valueEur: 0, chargeMwh: 0, dischargeMwh: 0 });
  });

  it("charges in low-price intervals and discharges in high-price intervals", () => {
    const prices: DamPricePoint[] = [20, 25, 30, 160, 190, 210].map((price, index) => ({
      interval: marketIntervalFromLocal("2026-04-29", index + 1),
      mcpEurPerMwh: price,
      totalTrades: 10,
      publishedAtLocal: "2026-04-28 14:15",
      version: 1,
      sourceFile: "test.xlsx",
    }));

    const schedule = buildDispatchSchedule(prices, {
      ...defaultBatteryTwin,
      initialSocMwh: 40,
      minSocMwh: 10,
      maxSocMwh: 90,
    });
    const actions = schedule.map((point) => point.action);

    expect(actions).toContain("charge");
    expect(actions).toContain("discharge");
    expect(schedule.every((point) => point.socMwh >= 10 && point.socMwh <= 90)).toBe(true);
    expect(summarizeDispatch(schedule).valueEur).toBeGreaterThan(0);
  });

  it("clamps the starting SoC inside configured operating bounds", () => {
    const prices: DamPricePoint[] = [200, 210].map((price, index) => ({
      interval: marketIntervalFromLocal("2026-04-29", index + 1),
      mcpEurPerMwh: price,
      totalTrades: 10,
      publishedAtLocal: "2026-04-28 14:15",
      version: 1,
      sourceFile: "test.xlsx",
    }));

    const schedule = buildDispatchSchedule(prices, {
      ...defaultBatteryTwin,
      initialSocMwh: 500,
      minSocMwh: 20,
      maxSocMwh: 80,
    });

    expect(schedule.every((point) => point.socMwh >= 20 && point.socMwh <= 80)).toBe(true);
    expect(schedule[0]?.socMwh).toBeLessThanOrEqual(80);
  });
});
