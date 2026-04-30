import { describe, expect, it } from "vitest";
import { buildBatterySignals, type SignalPricePoint } from "../convex/signalScoring";

const priceSeries: SignalPricePoint[] = [
  {
    marketDate: "2026-04-29",
    timestamp: "2026-04-29T12:00:00+03:00",
    mtu: 49,
    mcpEurPerMwh: 25,
    totalTrades: 1200,
  },
  {
    marketDate: "2026-04-29",
    timestamp: "2026-04-29T12:15:00+03:00",
    mtu: 50,
    mcpEurPerMwh: 30,
    totalTrades: 1100,
  },
  {
    marketDate: "2026-04-29",
    timestamp: "2026-04-29T20:00:00+03:00",
    mtu: 81,
    mcpEurPerMwh: 180,
    totalTrades: 900,
  },
  {
    marketDate: "2026-04-29",
    timestamp: "2026-04-29T20:15:00+03:00",
    mtu: 82,
    mcpEurPerMwh: 210,
    totalTrades: 800,
  },
];

describe("battery signal scoring", () => {
  it("creates graph-ready interval signals from existing source features", () => {
    const weatherByLocalMinute = new Map([
      [
        "2026-04-29T12:00",
        {
          timestamp: "2026-04-29T12:00",
          solarAvailabilityScore: 0.95,
          windGenerationProxy: 0.25,
          weatherDemandStress: 0.1,
        },
      ],
      [
        "2026-04-29T20:00",
        {
          timestamp: "2026-04-29T20:00",
          solarAvailabilityScore: 0.02,
          windGenerationProxy: 0.15,
          weatherDemandStress: 0.75,
        },
      ],
    ]);

    const response = buildBatterySignals({
      priceSeries,
      range: { from: "2026-04-29", to: "2026-04-29" },
      context: {
        weatherByLocalMinute,
        fuelCostEurPerMwhElectric: 115,
        euaPriceEurPerTonne: 70,
        greekForwardPriceEurPerMwh: 145,
        battery: { initialSocMwh: 100, minSocMwh: 20, maxSocMwh: 180 },
      },
    });

    expect(response.intervals).toHaveLength(4);
    expect(response.summary.bestChargeWindows[0]?.mtu).toBe(49);
    expect(response.summary.bestDischargeWindows[0]?.mtu).toBe(82);
    expect(response.intervals[0]?.signals.chargeAttractiveness).toBeGreaterThan(
      response.intervals[0]?.signals.dischargeScarcity ?? 1,
    );
    expect(response.intervals[3]?.signals.dischargeScarcity).toBeGreaterThan(
      response.intervals[3]?.signals.chargeAttractiveness ?? 1,
    );
  });

  it("marks missing fundamentals as missing while still returning proxy signals", () => {
    const response = buildBatterySignals({
      priceSeries,
      range: { from: "2026-04-29", to: "2026-04-29" },
    });

    expect(response.intervals[0]?.quality.systemLoad).toBe("missing");
    expect(response.intervals[0]?.quality.residualLoad).toBe("missing");
    expect(response.intervals[0]?.quality.curtailment).toBe("proxy");
    expect(response.summary.caveats.join(" ")).toContain("IPTO/ADMIE");
  });
});
