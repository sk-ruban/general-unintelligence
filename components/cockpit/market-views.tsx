"use client";

import { Activity, CalendarRange, CloudSun, Flame, Gauge } from "lucide-react";
import type { ComponentType } from "react";
import { CurveChart } from "@/components/curve-chart";
import { PriceChart, priceChartResolution, priceChartSeries } from "@/components/price-chart";
import { Input } from "@/components/ui/input";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { formatEurPerMwh, formatMwh } from "@/lib/format";
import { formatMtuWindow } from "@/lib/market-time";
import { PRICE_RANGES, type PriceRange, priceRangeLabel } from "@/lib/price-range";
import type {
  AggregatedCurvePoint,
  BatterySignalResponse,
  DamPricePoint,
  ExternalSignalPanel,
} from "@/lib/types";
import { PageActionButton, PageIntro, Tag } from "./shared";

type Tone = "cyan" | "green" | "amber" | "red" | "blue" | "violet" | "outline";

export type CurveStats = {
  totalPoints: number;
  buyPoints: number;
  sellPoints: number;
  buyMwh: number | null;
  sellMwh: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  lowQuantity: number | null;
  highQuantity: number | null;
};

export function SignalDeck({ signals }: { signals: ExternalSignalPanel[] }) {
  const weather = findSignal(signals, "Weather");
  const ttf = findSignal(signals, "TTF gas");
  const eex = findSignal(signals, "EEX");
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <SignalSpotlight accent="cyan" icon={CloudSun} kicker="Open-Meteo" signal={weather} title="Weather" />
      <SignalSpotlight accent="amber" icon={Flame} kicker="ICE" signal={ttf} title="TTF gas" />
      <SignalSpotlight accent="zinc" icon={Activity} kicker="EEX" signal={eex} title="Forward Power" />
    </div>
  );
}

export function WeatherView({
  batterySignals,
  signals,
}: {
  batterySignals: BatterySignalResponse | null;
  signals: ExternalSignalPanel[];
}) {
  const weather = findSignal(signals, "Weather");
  const eex = findSignal(signals, "EEX");
  const weatherPoints = weatherGraphPoints(batterySignals);
  const peakSurplus = batterySignals?.summary.highestCurtailmentWindows[0] ?? null;
  const peakSolar = maxWeatherPoint(weatherPoints, "solar");
  const peakWind = maxWeatherPoint(weatherPoints, "wind");
  const peakCloud = maxWeatherPoint(weatherPoints, "cloud");
  return (
    <div className="grid gap-4">
      <PageIntro
        kicker="Weather"
        title="Weather Operating Picture"
        description="Connects solar, cloud, wind, and demand-stress signals to the day-ahead battery schedule and highlights weather windows that need operator review."
        actions={
          <>
            <Tag tone={weather ? (weather.status === "missing" ? "red" : "cyan") : "red"}>
              {statusLabel(weather)}
            </Tag>
            {peakSurplus ? (
              <Tag tone="green">Peak {formatMtuWindow(peakSurplus.marketDate, peakSurplus.mtu)}</Tag>
            ) : null}
          </>
        }
      />
      <Panel>
        <PanelHeader
          title="Weather Operating Picture"
          kicker="Open-Meteo plus model-derived weather series by MTU"
        />
        <div className="grid gap-2 p-3 md:grid-cols-4">
          <SignalMetricCard
            detail={
              peakSurplus
                ? `${formatMtuWindow(peakSurplus.marketDate, peakSurplus.mtu)} · ${peakSurplus.regime}`
                : "No surplus window"
            }
            label="Solar Surplus"
            tone="cyan"
            value={formatPercentLike(peakSurplus?.signals.curtailmentAbsorption)}
          />
          <SignalMetricCard
            detail={
              peakSolar
                ? formatMtuWindow(peakSolar.marketDate, peakSolar.mtu)
                : (weather?.detail ?? "No weather signal")
            }
            label="Irradiance"
            tone="green"
            value={formatPercentLike(peakSolar?.value)}
          />
          <SignalMetricCard
            detail={peakCloud ? formatMtuWindow(peakCloud.marketDate, peakCloud.mtu) : "No cloud proxy"}
            label="Cloud / Demand"
            tone="blue"
            value={formatPercentLike(peakCloud?.value)}
          />
          <SignalMetricCard
            detail={peakWind ? formatMtuWindow(peakWind.marketDate, peakWind.mtu) : "No wind proxy"}
            label="Wind"
            tone="violet"
            value={formatPercentLike(peakWind?.value)}
          />
        </div>
        <WeatherSignalGraph points={weatherPoints} />
      </Panel>
      <Panel>
        <PanelHeader
          title="Weather-linked Power Signals"
          kicker="Power context for weather-driven dispatch"
        />
        <div className="grid gap-2 p-3 md:grid-cols-2">
          <SignalCard signal={weather ?? missingSignal("Weather")} />
          <SignalCard signal={eex ?? missingSignal("EEX context")} />
        </div>
      </Panel>
    </div>
  );
}

type WeatherGraphPoint = {
  key: string;
  marketDate: string;
  mtu: number;
  solar: number | null;
  cloud: number | null;
  wind: number | null;
  surplus: number | null;
};

function WeatherSignalGraph({ points }: { points: WeatherGraphPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="mx-3 mb-3 flex h-[260px] items-center justify-center border border-white/10 bg-black/20 text-[12px] text-zinc-500">
        Weather proxies are waiting for signal intervals.
      </div>
    );
  }

  return (
    <div className="px-3 pb-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <WeatherSeriesChart
          color="var(--cyan)"
          detail="Intervals where weather-linked surplus is strongest."
          points={points}
          seriesKey="surplus"
          title="Solar Surplus"
        />
        <WeatherSeriesChart
          color="var(--green)"
          detail="Relative production strength across the day."
          points={points}
          seriesKey="solar"
          title="Irradiance"
        />
        <WeatherSeriesChart
          color="var(--blue)"
          detail="Demand or cloud pressure when available."
          points={points}
          seriesKey="cloud"
          title="Cloud / Demand"
        />
        <WeatherSeriesChart
          color="var(--violet)"
          detail="Wind contribution when the source includes it."
          points={points}
          seriesKey="wind"
          title="Wind"
        />
      </div>
    </div>
  );
}

function WeatherSeriesChart({
  color,
  detail,
  points,
  seriesKey,
  title,
}: {
  color: string;
  detail: string;
  points: WeatherGraphPoint[];
  seriesKey: keyof Pick<WeatherGraphPoint, "solar" | "cloud" | "wind" | "surplus">;
  title: string;
}) {
  const sampled = points
    .map((point, index) => ({
      index,
      marketDate: point.marketDate,
      mtu: point.mtu,
      value: point[seriesKey],
    }))
    .filter(
      (point): point is { index: number; marketDate: string; mtu: number; value: number } =>
        point.value !== null,
    );
  const peak = sampled.reduce<{ marketDate: string; mtu: number; value: number } | null>(
    (current, point) => (!current || point.value > current.value ? point : current),
    null,
  );
  const linePoints = sampled
    .map((point) => `${weatherX(point.index, points.length)},${weatherY(point.value)}`)
    .join(" ");
  const areaPath =
    sampled.length > 0
      ? `M ${weatherX(sampled[0]?.index ?? 0, points.length)} 100 L ${linePoints.replaceAll(",", " ")} L ${weatherX(sampled.at(-1)?.index ?? 0, points.length)} 100 Z`
      : "";

  return (
    <div className="rounded border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">{title}</div>
          <div className="mt-1 text-[11px] text-zinc-500">{detail}</div>
        </div>
        <div className="mono shrink-0 text-[14px] text-zinc-100">
          {peak ? formatPercentLike(peak.value) : "n/a"}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[34px_minmax(0,1fr)] gap-2">
        <div className="flex h-[150px] flex-col justify-between text-right text-[10px] text-zinc-600">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
        <div className="relative h-[150px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:100%_50%]">
          {sampled.length > 0 ? (
            <svg
              aria-label={`${title} by MTU`}
              className="absolute inset-0 h-full w-full overflow-visible"
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
            >
              <path d={areaPath} fill={color} opacity="0.12" />
              <polyline
                fill="none"
                points={linePoints}
                stroke={color}
                strokeWidth="1.8"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-zinc-600">
              Source not available
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-5 pl-[42px] text-[10px] text-zinc-600">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span className="text-right">23:45</span>
      </div>
      <div className="mt-2 text-[11px] text-zinc-500">
        {peak
          ? `Peak at ${formatMtuWindow(peak.marketDate, peak.mtu)}.`
          : "No numeric series in the loaded weather feed."}
      </div>
    </div>
  );
}

function weatherX(index: number, total: number) {
  if (total <= 1) return 0;
  return (index / (total - 1)) * 100;
}

function weatherY(value: number) {
  return 100 - normalizeSignal(value) * 100;
}

export function GasView({ signals }: { signals: ExternalSignalPanel[] }) {
  const ttf = findSignal(signals, "TTF gas");
  const eex = findSignal(signals, "EEX");
  return (
    <div className="grid gap-4">
      <PageIntro
        kicker="Gas"
        title="Fuel And Forward Context"
        description="Monitors thermal fuel costs and Greek forward power to show whether the dispatch case is supported or exposed to a fragile day-ahead spread."
        actions={
          <>
            <Tag tone={ttf?.status === "live" ? "green" : ttf ? "blue" : "red"}>TTF {statusLabel(ttf)}</Tag>
            <Tag tone={eex?.status === "live" ? "green" : eex ? "blue" : "red"}>EEX {statusLabel(eex)}</Tag>
          </>
        }
      />
      <div className="grid gap-2 md:grid-cols-2">
        <SignalSpotlight accent="amber" icon={Flame} kicker="ICE" signal={ttf} title="TTF gas" />
        <SignalSpotlight accent="zinc" icon={Activity} kicker="EEX" signal={eex} title="Forward Power" />
      </div>
      <Panel>
        <PanelHeader title="Gas Driver" kicker="ICE Dutch TTF fuel-cost proxy" />
        <div className="grid gap-2 p-3 md:grid-cols-2">
          <Metric label="Thermal Proxy" value={ttf?.value ?? "Missing"} detail={ttf?.detail ?? "No cache"} />
          <Metric label="Status" value={statusLabel(ttf)} detail="TTF cache" />
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Forward Power Feed" kicker="EEX Greek base maturity" />
        <div className="grid gap-2 p-3 md:grid-cols-2">
          <Metric label="Greek Base" value={eex?.value ?? "Missing"} detail={eex?.detail ?? "No cache"} />
          <Metric label="Status" value={statusLabel(eex)} detail="EEX cache" />
        </div>
      </Panel>
    </div>
  );
}

export function MarketIntelligence({
  chartPrices,
  curveStats,
  curves,
  hasCurveDay,
  priceRange,
  prices,
  selectedDay,
  selectedMtu,
  signals,
  onMtuChange,
  onPriceRangeChange,
}: {
  chartPrices: DamPricePoint[];
  curveStats: CurveStats;
  curves: AggregatedCurvePoint[];
  hasCurveDay: boolean;
  priceRange: PriceRange;
  prices: DamPricePoint[];
  selectedDay: string;
  selectedMtu: number;
  signals: ExternalSignalPanel[];
  onMtuChange: (mtu: number) => void;
  onPriceRangeChange: (range: PriceRange) => void;
}) {
  const priceChartData = chartPrices.length > 0 || priceRange !== "1D" ? chartPrices : prices;
  return (
    <div className="grid gap-4">
      <PageIntro
        kicker="Market"
        title="Price And Curve Intelligence"
        description="Surfaces the price shape, liquidity, and curve depth behind the recommended schedule, with controls for changing horizon or inspecting a specific MTU."
        actions={
          <>
            <PageActionButton onClick={() => onPriceRangeChange("1D")}>
              <CalendarRange className="size-3.5" />
              Today
            </PageActionButton>
            <PageActionButton onClick={() => onMtuChange(72)}>
              <Gauge className="size-3.5" />
              Evening Window
            </PageActionButton>
            <Tag tone={curveStats.totalPoints > 0 ? "green" : "amber"}>
              {curveStats.totalPoints} curve points
            </Tag>
          </>
        }
      />
      <SignalDeck signals={signals} />
      <Panel>
        <PanelHeader
          title="DAM MCP Price History"
          kicker={priceSeriesKicker(chartPrices, priceRange)}
          right={<PriceRangeControl value={priceRange} onChange={onPriceRangeChange} />}
        />
        <div className="p-3">
          {priceChartData.length > 0 ? (
            <PriceChart key={priceChartKey(priceRange, priceChartData)} data={priceChartData} />
          ) : (
            <EmptyPriceState range={priceRange} />
          )}
        </div>
      </Panel>
      <MarketCurves
        curves={curves}
        curveStats={curveStats}
        selectedDay={selectedDay}
        selectedMtu={selectedMtu}
        onMtuChange={onMtuChange}
        hasCurveDay={hasCurveDay}
      />
    </div>
  );
}

export function MarketCurves({
  curves,
  curveStats,
  selectedDay,
  selectedMtu,
  onMtuChange,
  hasCurveDay,
}: {
  curves: AggregatedCurvePoint[];
  curveStats: CurveStats;
  selectedDay: string;
  selectedMtu: number;
  onMtuChange: (mtu: number) => void;
  hasCurveDay: boolean;
}) {
  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHeader
          title="Aggregated Buy / Sell Curves"
          kicker={`${selectedDay} · ${formatMtuWindow(selectedDay, selectedMtu)}`}
          right={<MtuControl selectedMtu={selectedMtu} onMtuChange={onMtuChange} />}
        />
        {curves.length > 0 ? (
          <CurveChart data={curves} />
        ) : (
          <EmptyCurveState selectedDay={selectedDay} selectedMtu={selectedMtu} hasCurveDay={hasCurveDay} />
        )}
      </Panel>
      <div className="grid gap-2 md:grid-cols-4">
        <Metric
          label="Curve Points"
          value={String(curveStats.totalPoints)}
          detail={`${curveStats.buyPoints} buy · ${curveStats.sellPoints} sell`}
        />
        <Metric
          label="Bid / Offer Volume"
          value={`${formatMwh(curveStats.buyMwh)} · ${formatMwh(curveStats.sellMwh)}`}
          detail="Displayed window"
        />
        <Metric
          label="Price Range"
          value={`${formatEurPerMwh(curveStats.lowPrice)} · ${formatEurPerMwh(curveStats.highPrice)}`}
          detail="Curve stack"
        />
        <Metric
          label="Quantity Range"
          value={`${formatMwh(curveStats.lowQuantity)} · ${formatMwh(curveStats.highQuantity)}`}
          detail="Per submitted point"
        />
      </div>
      <Panel>
        <PanelHeader title="Curve Points" kicker="Local AggrCurves layer" />
        <DataTable curves={curves} />
      </Panel>
    </div>
  );
}

export function MtuControl({
  selectedMtu,
  onMtuChange,
}: {
  selectedMtu: number;
  onMtuChange: (mtu: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
      <span className="uppercase">MTU</span>
      <Input
        className="h-7 w-16 px-2 text-center font-mono text-[12px]"
        max={100}
        min={1}
        type="number"
        value={selectedMtu}
        onChange={(event) => {
          const next = Math.max(1, Math.min(100, Number(event.target.value) || 1));
          onMtuChange(next);
        }}
      />
    </div>
  );
}

export function EmptyCurveState({
  selectedDay,
  selectedMtu,
  hasCurveDay = false,
}: {
  selectedDay: string;
  selectedMtu?: number;
  hasCurveDay?: boolean;
}) {
  const mtuLabel = selectedMtu ? ` ${formatMtuWindow(selectedDay, selectedMtu)}` : "";
  return (
    <div className="flex h-[290px] items-center justify-center px-6 text-center text-[12px] text-zinc-500">
      {hasCurveDay
        ? `No local AggrCurve points for ${selectedDay}${mtuLabel}.`
        : `No local AggrCurve day is loaded for ${selectedDay || "this day"}. Showing the latest bundled AggrCurves when available.`}
    </div>
  );
}

function PriceRangeControl({
  value,
  onChange,
}: {
  value: PriceRange;
  onChange: (range: PriceRange) => void;
}) {
  return (
    <div className="flex items-center">
      <div className="flex items-center gap-1">
        {PRICE_RANGES.map((range) => (
          <button
            key={range}
            className={`mono h-6 rounded-sm border px-2 text-[10px] ${
              value === range
                ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100"
                : "border-white/10 bg-[var(--bg-base)] text-zinc-500 hover:text-zinc-200"
            }`}
            type="button"
            onClick={() => onChange(range)}
          >
            {priceRangeLabel(range)}
          </button>
        ))}
      </div>
    </div>
  );
}

function priceSeriesKicker(prices: DamPricePoint[], range: PriceRange) {
  if (prices.length === 0) {
    return `${priceRangeLabel(range)} · loading`;
  }
  const first = prices[0]?.interval.marketDate ?? "n/a";
  const last = prices.at(-1)?.interval.marketDate ?? "n/a";
  const resolution = priceChartResolution(prices) === "daily-average" ? "daily avg" : "15-minute MTU";
  return `${priceRangeLabel(range)} · ${first} -> ${last} · ${priceChartSeries(prices).length} ${resolution}`;
}

function priceChartKey(range: PriceRange, prices: DamPricePoint[]) {
  const first = prices[0]?.interval.timestampUtc ?? "none";
  const last = prices.at(-1)?.interval.timestampUtc ?? "none";
  return `${range}:${first}:${last}:${prices.length}:${priceChartResolution(prices)}`;
}

function EmptyPriceState({ range }: { range: PriceRange }) {
  return (
    <div className="flex h-[220px] items-center justify-center px-6 text-center text-[12px] text-zinc-500">
      Loading {priceRangeLabel(range)} price history from Convex.
    </div>
  );
}

function DataTable({ curves }: { curves: AggregatedCurvePoint[] }) {
  return (
    <div className="dense-scrollbar max-h-[460px] overflow-auto">
      <table className="w-full table-fixed text-left text-[11px]">
        <thead className="sticky top-0 bg-[var(--bg-panel)] text-zinc-500 uppercase">
          <tr>
            <th className="h-7 px-3">Side</th>
            <th className="h-7 px-3">Order</th>
            <th className="h-7 px-3">Quantity</th>
            <th className="h-7 px-3">Price</th>
          </tr>
        </thead>
        <tbody>
          {curves.slice(0, 220).map((point) => (
            <tr
              key={`${point.side}-${point.curveOrder}`}
              className="border-white/5 border-t hover:bg-white/[0.02]"
            >
              <td className="h-7 px-3 text-zinc-300">{point.side}</td>
              <td className="mono h-7 px-3">{point.curveOrder}</td>
              <td className="mono h-7 px-3">{formatMwh(point.quantityMwh)}</td>
              <td className="mono h-7 px-3">{formatEurPerMwh(point.unitPriceEurPerMwh)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Panel className="p-3">
      <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">{label}</div>
      <div className="mono mt-1 truncate text-[16px] font-medium text-zinc-100">{value}</div>
      <div className="mt-1 truncate text-[11px] text-zinc-500">{detail}</div>
    </Panel>
  );
}

function SignalCard({ signal, compact = false }: { signal: ExternalSignalPanel; compact?: boolean }) {
  return (
    <div className="rounded border border-white/10 bg-[var(--bg-base)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">
          {signal.label}
        </span>
        <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(signal.status)}`} />
      </div>
      <div className="mono mt-1 truncate text-sm text-zinc-100">{signal.value}</div>
      {!compact ? <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{signal.detail}</div> : null}
    </div>
  );
}

function SignalMetricCard({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: Tone;
  value: string;
}) {
  return (
    <div className="rounded border border-white/10 bg-[var(--bg-base)] p-3">
      <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">{label}</div>
      <div className={`mono mt-2 text-[18px] font-medium ${toneClass(tone)}`}>{value}</div>
      <div className="mt-1 truncate text-[11px] text-zinc-500">{detail}</div>
    </div>
  );
}

function SignalSpotlight({
  signal,
  title,
  kicker,
  icon: Icon,
  accent,
}: {
  signal: ExternalSignalPanel | undefined;
  title: string;
  kicker: string;
  icon: ComponentType<{ className?: string }>;
  accent: "cyan" | "amber" | "zinc";
}) {
  const resolved = signal ?? missingSignal(title);
  const accentClass =
    accent === "cyan"
      ? "border-cyan-300/25 bg-cyan-300/[0.055] text-cyan-200"
      : accent === "amber"
        ? "border-amber-300/25 bg-amber-300/[0.055] text-amber-200"
        : "border-zinc-300/15 bg-white/[0.035] text-zinc-200";
  return (
    <Panel className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">{kicker}</div>
          <div className="mt-1 font-medium text-[12px] text-zinc-100 uppercase tracking-[0.02em]">
            {title}
          </div>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center border ${accentClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mono mt-3 truncate text-[16px] font-medium text-zinc-100">{resolved.value}</div>
      <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{resolved.detail}</div>
    </Panel>
  );
}

function weatherGraphPoints(batterySignals: BatterySignalResponse | null): WeatherGraphPoint[] {
  const intervals = batterySignals?.intervals ?? [];
  return intervals.map((interval) => ({
    key: `${interval.marketDate}-${interval.mtu}`,
    marketDate: interval.marketDate,
    mtu: interval.mtu,
    solar: nullableSignal(interval.inputs.solarAvailabilityScore) ?? solarProxyForMtu(interval.mtu),
    cloud:
      nullableSignal(interval.inputs.weatherDemandStress) ??
      demandStressProxyForMtu(
        interval.mtu,
        interval.inputs.pricePosition,
        interval.inputs.solarAvailabilityScore,
      ),
    wind:
      nullableSignal(interval.inputs.windGenerationProxy) ??
      windProxyForMtu(interval.mtu, interval.inputs.priceJumpStress),
    surplus: nullableSignal(interval.signals.curtailmentAbsorption),
  }));
}

function maxWeatherPoint(
  points: WeatherGraphPoint[],
  seriesKey: keyof Pick<WeatherGraphPoint, "solar" | "cloud" | "wind" | "surplus">,
) {
  return points
    .map((point) => ({ marketDate: point.marketDate, mtu: point.mtu, value: point[seriesKey] }))
    .filter(
      (point): point is { marketDate: string; mtu: number; value: number } => typeof point.value === "number",
    )
    .sort((left, right) => right.value - left.value)[0];
}

function solarProxyForMtu(mtu: number) {
  const hour = ((mtu - 1) * 15) / 60;
  const daylight = Math.sin(((hour - 6) / 14) * Math.PI);
  return normalizeSignal(daylight * 0.78 + 0.08);
}

function windProxyForMtu(mtu: number, priceJumpStress: number | null | undefined) {
  const hour = ((mtu - 1) * 15) / 60;
  const overnightLift = hour < 7 || hour >= 21 ? 0.16 : 0;
  const afternoonMix = Math.sin(((hour + 2) / 24) * Math.PI * 2) * 0.12;
  return normalizeSignal(0.34 + overnightLift + afternoonMix + normalizeSignal(priceJumpStress) * 0.18);
}

function demandStressProxyForMtu(
  mtu: number,
  pricePosition: number | null | undefined,
  solarAvailabilityScore: number | null | undefined,
) {
  const hour = ((mtu - 1) * 15) / 60;
  const eveningPeak = Math.exp(-((hour - 20) ** 2) / 10);
  const morningRamp = Math.exp(-((hour - 8) ** 2) / 14) * 0.35;
  return normalizeSignal(
    0.18 +
      eveningPeak * 0.42 +
      morningRamp +
      normalizeSignal(pricePosition) * 0.24 -
      normalizeSignal(solarAvailabilityScore) * 0.18,
  );
}

function normalizeSignal(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function nullableSignal(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return normalizeSignal(value);
}

function formatPercentLike(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${Math.round(normalizeSignal(value) * 100)}%`;
}

function findSignal(signals: ExternalSignalPanel[], label: string) {
  return signals.find((signal) => signal.label.toLowerCase().includes(label.toLowerCase()));
}

function missingSignal(label: string): ExternalSignalPanel {
  return {
    label,
    value: "Missing",
    detail: "Source data is not loaded.",
    status: "missing",
  };
}

function statusLabel(signal: ExternalSignalPanel | undefined) {
  return signal?.status === "live" ? "Live" : signal?.status === "cached" ? "Cached" : "Missing";
}

function toneClass(tone?: Tone) {
  switch (tone) {
    case "cyan":
      return "text-[var(--cyan)]";
    case "green":
      return "text-[var(--green)]";
    case "amber":
      return "text-[var(--amber)]";
    case "red":
      return "text-[var(--red)]";
    case "blue":
      return "text-[var(--blue)]";
    case "violet":
      return "text-[var(--violet)]";
    default:
      return "text-zinc-100";
  }
}

function statusDotClass(status: ExternalSignalPanel["status"]) {
  if (status === "missing") return "bg-zinc-600";
  if (status === "live") return "bg-[var(--green)]";
  return "bg-[var(--cyan)]";
}
