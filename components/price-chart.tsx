"use client";

import { ColorType, createChart, type IChartApi, type ISeriesApi, LineSeries } from "lightweight-charts";
import { DateTime } from "luxon";
import { useEffect, useRef } from "react";
import { MARKET_TIME_ZONE } from "@/lib/market-time";
import type { DamPricePoint } from "@/lib/types";

const DAILY_AVERAGE_THRESHOLD_DAYS = 95;

export function PriceChart({ data }: { data: DamPricePoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const spanDaysRef = useRef(1);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: 300,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
        fontFamily: "IBM Plex Mono",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.12)",
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.12)",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: unknown) => formatTick(time, spanDaysRef.current),
      },
      localization: {
        timeFormatter: (time: unknown) => formatCrosshairTime(time, spanDaysRef.current),
      },
      crosshair: {
        horzLine: { color: "rgba(103,232,249,0.45)" },
        vertLine: { color: "rgba(103,232,249,0.45)" },
      },
    });
    const series = chart.addSeries(LineSeries, {
      color: "#67e8f9",
      lineWidth: 2,
      priceFormat: {
        type: "price",
        precision: 2,
        minMove: 0.01,
      },
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => chart.remove();
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    spanDaysRef.current = priceChartSpanDays(data);
    series.setData(priceChartSeries(data));
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={containerRef} className="h-[300px] w-full" />;
}

export function priceChartSeries(data: DamPricePoint[]) {
  if (priceChartResolution(data) === "daily-average") {
    return dailyAverageSeries(data);
  }
  return intradaySeries(data);
}

export function priceChartResolution(data: DamPricePoint[]) {
  return priceChartSpanDays(data) > DAILY_AVERAGE_THRESHOLD_DAYS ? "daily-average" : "15-minute";
}

function intradaySeries(data: DamPricePoint[]) {
  const byTime = new Map<number, number>();
  for (const point of data) {
    const time = Math.floor(new Date(point.interval.timestampUtc).getTime() / 1000);
    if (Number.isFinite(time) && Number.isFinite(point.mcpEurPerMwh)) {
      byTime.set(time, point.mcpEurPerMwh);
    }
  }

  return [...byTime.entries()]
    .sort(([leftTime], [rightTime]) => leftTime - rightTime)
    .map(([time, value]) => ({
      time: time as never,
      value,
    }));
}

function dailyAverageSeries(data: DamPricePoint[]) {
  const byDay = new Map<string, { sum: number; count: number }>();
  for (const point of data) {
    if (!Number.isFinite(point.mcpEurPerMwh)) continue;
    const bucket = byDay.get(point.interval.marketDate) ?? { sum: 0, count: 0 };
    bucket.sum += point.mcpEurPerMwh;
    bucket.count += 1;
    byDay.set(point.interval.marketDate, bucket);
  }

  return [...byDay.entries()]
    .sort(([leftDay], [rightDay]) => leftDay.localeCompare(rightDay))
    .map(([marketDate, bucket]) => ({
      time: marketDayNoonUtcSeconds(marketDate) as never,
      value: Number((bucket.sum / bucket.count).toFixed(3)),
    }));
}

function priceChartSpanDays(data: DamPricePoint[]) {
  const first = data[0]?.interval.marketDate;
  const last = data.at(-1)?.interval.marketDate;
  if (!first || !last) return 1;
  const firstDate = DateTime.fromISO(first, { zone: MARKET_TIME_ZONE }).startOf("day");
  const lastDate = DateTime.fromISO(last, { zone: MARKET_TIME_ZONE }).startOf("day");
  if (!firstDate.isValid || !lastDate.isValid || firstDate > lastDate) return 1;
  return Math.floor(lastDate.diff(firstDate, "days").days) + 1;
}

function marketDayNoonUtcSeconds(marketDate: string) {
  return Math.floor(
    (DateTime.fromISO(marketDate, { zone: MARKET_TIME_ZONE }).plus({ hours: 12 }).toUTC().toMillis() ?? 0) /
      1000,
  );
}

function formatTick(time: unknown, spanDays: number) {
  const dateTime = timeToAthens(time);
  if (!dateTime) return "";
  if (spanDays <= 2) return dateTime.toFormat("HH:mm");
  if (spanDays <= 95) return dateTime.toFormat("dd LLL");
  return dateTime.toFormat("LLL yy");
}

function formatCrosshairTime(time: unknown, spanDays: number) {
  const dateTime = timeToAthens(time);
  if (!dateTime) return "";
  if (spanDays <= 2) return dateTime.toFormat("dd LLL HH:mm");
  if (spanDays <= 95) return dateTime.toFormat("dd LLL yyyy HH:mm");
  return dateTime.toFormat("dd LLL yyyy");
}

function timeToAthens(time: unknown) {
  const timestamp = typeof time === "number" ? time : Number(time);
  if (!Number.isFinite(timestamp)) return null;
  const parsed = DateTime.fromSeconds(timestamp, { zone: "utc" }).setZone(MARKET_TIME_ZONE);
  return parsed.isValid ? parsed : null;
}
