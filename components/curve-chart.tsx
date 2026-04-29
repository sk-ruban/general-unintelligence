"use client";

import ReactECharts from "echarts-for-react";
import type { AggregatedCurvePoint } from "@/lib/types";

export function CurveChart({ data }: { data: AggregatedCurvePoint[] }) {
  const buy = data
    .filter((point) => point.side === "Buy")
    .slice(0, 140)
    .map((point) => [point.quantityMwh, point.unitPriceEurPerMwh]);
  const sell = data
    .filter((point) => point.side === "Sell")
    .slice(0, 140)
    .map((point) => [point.quantityMwh, point.unitPriceEurPerMwh]);

  return (
    <ReactECharts
      style={{ height: 290, width: "100%" }}
      option={{
        backgroundColor: "transparent",
        animation: false,
        textStyle: { color: "#a1a1aa", fontFamily: "IBM Plex Mono", fontSize: 11 },
        grid: { left: 48, right: 18, top: 18, bottom: 34 },
        tooltip: {
          trigger: "axis",
          backgroundColor: "#09090b",
          borderColor: "rgba(255,255,255,0.14)",
          textStyle: { color: "#e5e7eb", fontFamily: "IBM Plex Mono" },
        },
        xAxis: {
          name: "MWh",
          type: "value",
          splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
          axisLine: { lineStyle: { color: "rgba(255,255,255,0.12)" } },
        },
        yAxis: {
          name: "EUR/MWh",
          type: "value",
          splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
          axisLine: { lineStyle: { color: "rgba(255,255,255,0.12)" } },
        },
        series: [
          {
            name: "Buy",
            type: "line",
            showSymbol: false,
            data: buy,
            lineStyle: { color: "#22c55e", width: 2 },
          },
          {
            name: "Sell",
            type: "line",
            showSymbol: false,
            data: sell,
            lineStyle: { color: "#f97316", width: 2 },
          },
        ],
      }}
    />
  );
}
