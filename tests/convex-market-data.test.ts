import { describe, expect, it } from "vitest";
import { marketDaysFromCatalog, priceFromConvexRow, splitDateRange } from "@/lib/market-data/convex-client";
import { marketDaysFromCoverage, splitDateRange as splitHttpDateRange } from "@/lib/market-data/convex-http";

describe("Convex market data client normalization", () => {
  it("expands catalog coverage into market days", () => {
    expect(
      marketDaysFromCatalog({
        coverage: {
          firstDate: "2026-04-28",
          lastDate: "2026-04-30",
          marketDates: 3,
        },
      }),
    ).toEqual(["2026-04-28", "2026-04-29", "2026-04-30"]);
  });

  it("expands Convex HTTP coverage into market days", () => {
    expect(
      marketDaysFromCoverage({
        firstDate: "2026-04-28",
        lastDate: "2026-04-30",
        marketDates: 3,
      }),
    ).toEqual(["2026-04-28", "2026-04-29", "2026-04-30"]);
  });

  it("maps Convex DAM price rows to canonical UTC intervals", () => {
    expect(
      priceFromConvexRow({
        marketDate: "2026-04-24",
        timestamp: "2026-04-24T00:15:00+03:00",
        mtu: 2,
        mcpEurPerMwh: 111.78,
        totalTrades: 9524.332,
      }),
    ).toMatchObject({
      interval: {
        marketDate: "2026-04-24",
        mtu: 2,
        timestampUtc: "2026-04-23T21:15:00Z",
        athensLabel: "24 Apr 00:15",
      },
      mcpEurPerMwh: 111.78,
      totalTrades: 9524.332,
      sourceFile: "convex-dam",
    });
  });

  it("chunks long Convex DAM price ranges under the route limit", () => {
    expect(splitDateRange("2026-01-01", "2026-04-30")).toEqual([
      { from: "2026-01-01", to: "2026-02-14" },
      { from: "2026-02-15", to: "2026-03-31" },
      { from: "2026-04-01", to: "2026-04-30" },
    ]);
  });

  it("chunks long Convex HTTP DAM price ranges under the route limit", () => {
    expect(splitHttpDateRange("2026-01-01", "2026-04-30")).toEqual([
      { from: "2026-01-01", to: "2026-02-14" },
      { from: "2026-02-15", to: "2026-03-31" },
      { from: "2026-04-01", to: "2026-04-30" },
    ]);
  });
});
