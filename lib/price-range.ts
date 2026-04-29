import { DateTime } from "luxon";
import type { DayRange } from "@/lib/market-data/types";
import { MARKET_TIME_ZONE } from "@/lib/market-time";

export const PRICE_RANGES = ["1D", "1W", "1M", "YTD", "1Y", "MAX"] as const;

export type PriceRange = (typeof PRICE_RANGES)[number];

export function dayRangeForPriceWindow(range: PriceRange, latestDay: string, firstDay: string): DayRange {
  const latest = DateTime.fromISO(latestDay, { zone: MARKET_TIME_ZONE }).startOf("day");
  const first = DateTime.fromISO(firstDay, { zone: MARKET_TIME_ZONE }).startOf("day");
  if (!latest.isValid || !first.isValid || first > latest) {
    return { from: latestDay, to: latestDay };
  }

  const from = clampStart(startForRange(range, latest, first), first);
  return {
    from: from.toISODate() ?? latestDay,
    to: latest.toISODate() ?? latestDay,
  };
}

export function priceRangeLabel(range: PriceRange) {
  if (range === "MAX") return "Max";
  return range;
}

function startForRange(range: PriceRange, latest: DateTime, first: DateTime) {
  if (range === "1D") return latest;
  if (range === "1W") return latest.minus({ days: 6 });
  if (range === "1M") return latest.minus({ months: 1 }).plus({ days: 1 });
  if (range === "YTD") {
    return DateTime.fromObject({ year: latest.year, month: 1, day: 1 }, { zone: MARKET_TIME_ZONE });
  }
  if (range === "1Y") return latest.minus({ years: 1 }).plus({ days: 1 });
  return first;
}

function clampStart(value: DateTime, first: DateTime) {
  return value < first ? first : value;
}
