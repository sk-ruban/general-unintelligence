import { describe, expect, it } from "vitest";
import { defaultBatteryTwin } from "@/lib/battery-dispatch";
import { buildDecisionConfidence } from "@/lib/decision-confidence";
import { marketIntervalFromLocal } from "@/lib/market-time";
import type {
  AggregatedCurvePoint,
  DamPricePoint,
  DispatchAction,
  DispatchPoint,
  ExternalSignalPanel,
} from "@/lib/types";

describe("decision confidence scoring", () => {
  it("handles an empty schedule honestly", () => {
    const cards = buildDecisionConfidence({
      dispatch: [],
      prices: [],
      curves: [],
      signals: [],
      twin: defaultBatteryTwin,
      health: null,
    });

    expect(cards).toHaveLength(5);
    expect(card(cards, "spread-coverage").value).toBe("Missing");
    expect(card(cards, "curtailment-fit").value).toBe("Missing");
    expect(card(cards, "battery-stress").value).toBe("Missing");
    expect(card(cards, "data-confidence").value).toBe("Missing");
  });

  it("scores a strong spread when discharge windows clear losses", () => {
    const prices = priceSeries([20, 25, 170, 190], 41);
    const dispatch = [
      dispatchPoint("charge", 50, 12.5, 45, prices[0]),
      dispatchPoint("charge", 50, 12.5, 55, prices[1]),
      dispatchPoint("discharge", 50, 12.5, 45, prices[2]),
      dispatchPoint("discharge", 50, 12.5, 35, prices[3]),
    ];

    const cards = buildDecisionConfidence({
      dispatch,
      prices,
      curves: curvePoints(160, 10, 120),
      signals: availableSignals(),
      twin: defaultBatteryTwin,
      health: {
        mode: "convex",
        priceRows: 96,
        curveRows: 160,
        firstMarketDate: "2026-04-29",
        lastMarketDate: "2026-04-29",
        generatedAtUtc: "2026-04-29T10:00:00Z",
      },
    });

    expect(card(cards, "spread-coverage")).toMatchObject({
      value: "Strong",
      tone: "green",
      status: "strong",
    });
    expect(card(cards, "spread-coverage").score).toBeGreaterThanOrEqual(20);
  });

  it("marks market fragility missing when curves are unavailable", () => {
    const prices = priceSeries([20, 180], 1);
    const cards = buildDecisionConfidence({
      dispatch: [
        dispatchPoint("charge", 20, 5, 50, prices[0]),
        dispatchPoint("discharge", 20, 5, 45, prices[1]),
      ],
      prices,
      curves: [],
      curveStats: { totalPoints: 0, lowPrice: null, highPrice: null },
      signals: availableSignals(),
      twin: defaultBatteryTwin,
      health: null,
    });

    expect(card(cards, "market-fragility")).toMatchObject({
      value: "Missing",
      tone: "outline",
      status: "missing",
    });
  });

  it("flags high stress for aggressive cycling and SoC extremes", () => {
    const twin = {
      ...defaultBatteryTwin,
      capacityMwh: 50,
      minSocMwh: 5,
      maxSocMwh: 50,
      maxChargeMw: 50,
      maxDischargeMw: 50,
    };
    const prices = priceSeries([10, 12, 15, 180, 190, 200], 1);
    const dispatch = [
      dispatchPoint("charge", 50, 25, 48, prices[0]),
      dispatchPoint("charge", 50, 25, 49, prices[1]),
      dispatchPoint("charge", 50, 25, 50, prices[2]),
      dispatchPoint("discharge", 50, 25, 6, prices[3]),
      dispatchPoint("discharge", 50, 25, 5, prices[4]),
      dispatchPoint("discharge", 50, 25, 5, prices[5]),
    ];

    const cards = buildDecisionConfidence({
      dispatch,
      prices,
      curves: curvePoints(20, -50, 350),
      signals: availableSignals(),
      twin,
      health: null,
    });

    expect(card(cards, "battery-stress")).toMatchObject({
      value: "High",
      tone: "red",
      status: "high",
    });
  });

  it("keeps data confidence medium when non-critical context is partial", () => {
    const prices = priceSeries([25, 180], 1);
    const cards = buildDecisionConfidence({
      dispatch: [
        dispatchPoint("charge", 20, 5, 40, prices[0]),
        dispatchPoint("discharge", 20, 5, 35, prices[1]),
      ],
      prices,
      curves: [],
      signals: [
        { label: "Weather", value: "Missing", detail: "not linked", status: "missing" },
        { label: "TTF gas", value: "42 EUR/MWh", detail: "cached", status: "cached" },
      ],
      twin: defaultBatteryTwin,
      health: {
        mode: "json-fallback",
        priceRows: 96,
        curveRows: 0,
        firstMarketDate: "2026-04-29",
        lastMarketDate: "2026-04-29",
        generatedAtUtc: null,
      },
    });

    expect(card(cards, "data-confidence")).toMatchObject({
      value: "Medium",
      tone: "amber",
      status: "medium",
      score: 70,
    });
    expect(card(cards, "data-confidence").detail).toContain("curves");
    expect(card(cards, "data-confidence").detail).toContain("weather");
  });
});

function card(
  cards: ReturnType<typeof buildDecisionConfidence>,
  id: ReturnType<typeof buildDecisionConfidence>[number]["id"],
) {
  const match = cards.find((candidate) => candidate.id === id);
  expect(match).toBeDefined();
  if (!match) {
    throw new Error(`Missing card ${id}`);
  }
  return match;
}

function priceSeries(values: number[], firstMtu: number): DamPricePoint[] {
  return values.map((price, index) => ({
    interval: marketIntervalFromLocal("2026-04-29", firstMtu + index),
    mcpEurPerMwh: price,
    totalTrades: 10,
    publishedAtLocal: "2026-04-28 14:15",
    version: 1,
    sourceFile: "test.xlsx",
  }));
}

function dispatchPoint(
  action: DispatchAction,
  mw: number,
  mwh: number,
  socMwh: number,
  price: DamPricePoint | undefined,
): DispatchPoint {
  if (!price) {
    throw new Error("missing test price");
  }
  return {
    interval: price.interval,
    action,
    mw,
    mwh,
    socMwh,
    priceEurPerMwh: price.mcpEurPerMwh,
    estimatedValueEur: 0,
    reason: "test",
  };
}

function curvePoints(count: number, lowPrice: number, highPrice: number): AggregatedCurvePoint[] {
  return Array.from({ length: count }, (_, index) => ({
    interval: marketIntervalFromLocal("2026-04-29", 1),
    side: index % 2 === 0 ? "Buy" : "Sell",
    curveOrder: index + 1,
    quantityMwh: index + 1,
    unitPriceEurPerMwh: lowPrice + ((highPrice - lowPrice) * index) / Math.max(1, count - 1),
    publishedAtLocal: "2026-04-28 14:15",
    version: 1,
    sourceFile: "curve.csv",
  }));
}

function availableSignals(): ExternalSignalPanel[] {
  return [
    { label: "Weather", value: "82% solar surplus", detail: "cached", status: "cached" },
    { label: "TTF gas", value: "42 EUR/MWh", detail: "cached", status: "cached" },
    { label: "EEX context", value: "90 EUR/MWh", detail: "cached", status: "cached" },
  ];
}
