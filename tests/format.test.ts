import { describe, expect, it } from "vitest";
import { formatEurPerMwh, formatMwh, formatPercent } from "@/lib/format";

describe("formatters", () => {
  it("uses explicit market units", () => {
    expect(formatEurPerMwh(97.009)).toContain("/MWh");
    expect(formatMwh(12.25)).toBe("12.3 MWh");
    expect(formatPercent(0.884)).toBe("88.4%");
  });
});
