"use client";

import { ColorType, createChart, type IChartApi, type ISeriesApi, LineSeries } from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { DamPricePoint } from "@/lib/types";

export function PriceChart({ data }: { data: DamPricePoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

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
    series.setData(
      data.map((point) => ({
        time: Math.floor(new Date(point.interval.timestampUtc).getTime() / 1000) as never,
        value: point.mcpEurPerMwh,
      })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={containerRef} className="h-[300px] w-full" />;
}
