import { describe, expect, it } from "vitest";
import { generateMarketIntervals, marketIntervalFromLocal } from "@/lib/market-time";

describe("market time", () => {
  it("generates 96 intervals on a normal Europe/Athens market day", () => {
    const intervals = generateMarketIntervals("2026-04-29");

    expect(intervals).toHaveLength(96);
    expect(intervals[0]).toMatchObject({
      marketDate: "2026-04-29",
      mtu: 1,
      timestampUtc: "2026-04-28T21:00:00Z",
    });
    expect(intervals.at(-1)).toMatchObject({
      mtu: 96,
      timestampUtc: "2026-04-29T20:45:00Z",
    });
  });

  it("represents daylight-saving transition days by actual local interval count", () => {
    expect(generateMarketIntervals("2026-03-29")).toHaveLength(92);
    expect(generateMarketIntervals("2026-10-25")).toHaveLength(100);
  });

  it("maps MTU indexes to UTC instants with Europe/Athens as source of truth", () => {
    expect(marketIntervalFromLocal("2026-04-29", 48)).toMatchObject({
      marketDate: "2026-04-29",
      mtu: 48,
      timestampUtc: "2026-04-29T08:45:00Z",
    });
  });
});
