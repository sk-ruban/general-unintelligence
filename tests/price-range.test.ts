import { describe, expect, it } from "vitest";
import { dayRangeForPriceWindow } from "@/lib/price-range";

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
});
