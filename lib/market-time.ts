import { DateTime } from "luxon";
import type { MarketInterval } from "@/lib/types";

export const MARKET_TIME_ZONE = "Europe/Athens";
export const MTU_MINUTES = 15;
export const NOMINAL_MTUS_PER_DAY = 96;

export function marketDateFromUtc(timestampUtc: string) {
  return DateTime.fromISO(timestampUtc, { zone: "utc" }).setZone(MARKET_TIME_ZONE).toISODate() ?? "";
}

export function marketIntervalFromLocal(marketDate: string, mtu: number): MarketInterval {
  const start = DateTime.fromISO(marketDate, { zone: MARKET_TIME_ZONE }).plus({
    minutes: (mtu - 1) * MTU_MINUTES,
  });

  return {
    marketDate,
    mtu,
    timestampUtc: start.toUTC().toISO({ suppressMilliseconds: true }) ?? "",
    athensLabel: start.toFormat("dd LLL HH:mm"),
  };
}

export function generateMarketIntervals(marketDate: string): MarketInterval[] {
  const start = DateTime.fromISO(marketDate, { zone: MARKET_TIME_ZONE }).startOf("day");
  const end = start.plus({ days: 1 });
  const intervals: MarketInterval[] = [];
  let cursor = start;
  let mtu = 1;

  while (cursor < end) {
    intervals.push({
      marketDate,
      mtu,
      timestampUtc: cursor.toUTC().toISO({ suppressMilliseconds: true }) ?? "",
      athensLabel: cursor.toFormat("dd LLL HH:mm"),
    });
    cursor = cursor.plus({ minutes: MTU_MINUTES });
    mtu += 1;
  }

  return intervals;
}

export function athensLabelFromUtc(timestampUtc: string) {
  return DateTime.fromISO(timestampUtc, { zone: "utc" }).setZone(MARKET_TIME_ZONE).toFormat("dd LLL HH:mm");
}
