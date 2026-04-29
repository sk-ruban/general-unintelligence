import { describe, expect, it } from "vitest";
import { dayRangeForPriceWindow, priceRangeResolution } from "@/lib/price-range";

describe("price range windows", () => {
  it("anchors finance-style ranges to the latest available market day", () => {
    expect(dayRangeForPriceWindow("1D", "2026-04-30", "2024-12-17")).toEqual({
      from: "2026-04-30",
      to: "2026-04-30",
    });
    expect(dayRangeForPriceWindow("1W", "2026-04-30", "2024-12-17")).toEqual({
      from: "2026-04-24",
      to: "2026-04-30",
    });
    expect(dayRangeForPriceWindow("YTD", "2026-04-30", "2024-12-17")).toEqual({
      from: "2026-01-01",
      to: "2026-04-30",
    });
  });

  it("clamps max range to the first available market day", () => {
    expect(dayRangeForPriceWindow("MAX", "2026-04-30", "2024-12-17")).toEqual({
      from: "2024-12-17",
      to: "2026-04-30",
    });
  });

  it("uses interval data for short windows and daily averages for long windows", () => {
    expect(priceRangeResolution("1D")).toBe("interval");
    expect(priceRangeResolution("1W")).toBe("interval");
    expect(priceRangeResolution("1M")).toBe("interval");
    expect(priceRangeResolution("YTD")).toBe("daily-average");
    expect(priceRangeResolution("1Y")).toBe("daily-average");
    expect(priceRangeResolution("MAX")).toBe("daily-average");
  });
});
