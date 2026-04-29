import { describe, expect, it } from "vitest";
import { priceChartResolution, priceChartSeries } from "@/components/price-chart";
import type { DamPricePoint } from "@/lib/types";

describe("price chart series", () => {
  it("sorts and de-dupes timestamps for lightweight-charts", () => {
    const rows = [
      pricePoint("2026-04-29T21:15:00Z", 110),
      pricePoint("2026-04-29T21:00:00Z", 105),
      pricePoint("2026-04-29T21:15:00Z", 111),
    ];

    expect(priceChartSeries(rows)).toEqual([
      { time: 1_777_496_400, value: 105 },
      { time: 1_777_497_300, value: 111 },
    ]);
  });

  it("aggregates long ranges into daily averages", () => {
    const rows = [
      pricePoint("2026-01-01T00:00:00Z", 100),
      pricePoint("2026-01-01T00:15:00Z", 120),
      pricePoint("2026-04-30T00:00:00Z", 80),
    ];

    expect(priceChartResolution(rows)).toBe("daily-average");
    expect(priceChartSeries(rows)).toEqual([
      { time: 1_767_261_600, value: 110 },
      { time: 1_777_539_600, value: 80 },
    ]);
  });
});

function pricePoint(timestampUtc: string, mcpEurPerMwh: number): DamPricePoint {
  return {
    interval: {
      marketDate: timestampUtc.slice(0, 10),
      mtu: 1,
      timestampUtc,
      athensLabel: timestampUtc,
    },
    mcpEurPerMwh,
    totalTrades: null,
    publishedAtLocal: "",
    version: null,
    sourceFile: "test",
  };
}
