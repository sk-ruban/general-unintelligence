"use client";

import { Activity, CloudSun, Flame, Zap } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { CurveChart } from "@/components/curve-chart";
import { DispatchTable } from "@/components/dispatch-table";
import { PriceChart, priceChartResolution, priceChartSeries } from "@/components/price-chart";
import { Panel, PanelHeader } from "@/components/ui/panel";
import type { summarizeDispatch } from "@/lib/battery-dispatch";
import type { BatteryTwin as BatteryTwinModel, TwinFeasibilityCheck } from "@/lib/battery-twin";
import type { DecisionConfidenceCard } from "@/lib/decision-confidence";
import { formatEuro, formatEurPerMwh, formatMw, formatMwh, formatPercent } from "@/lib/format";
import type { PortfolioSummary } from "@/lib/portfolio";
import { PRICE_RANGES, type PriceRange, priceRangeLabel } from "@/lib/price-range";
import type {
  AggregatedCurvePoint,
  BatterySignalInterval,
  BatterySignalResponse,
  BatteryTwinConfig,
  DamPricePoint,
  DataHealth,
  DispatchAction,
  DispatchPoint,
  ExternalSignalPanel,
} from "@/lib/types";

type Tone = "cyan" | "green" | "amber" | "red" | "blue" | "violet" | "outline";

type CurveStats = {
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

export function DispatchPlan({
  prices,
  chartPrices,
  priceRange,
  onPriceRangeChange,
  curves,
  curveStats,
  selectedMtu,
  dispatch,
  summary,
  signals,
  batterySignals,
  decisionConfidence,
  feasibilityChecks,
  activeBatteryTwin,
  health,
  curveHealth,
  portfolioSummary,
  loading,
  twin,
}: {
  prices: DamPricePoint[];
  chartPrices: DamPricePoint[];
  priceRange: PriceRange;
  onPriceRangeChange: (range: PriceRange) => void;
  curves: AggregatedCurvePoint[];
  curveStats: CurveStats;
  selectedMtu: number;
  dispatch: DispatchPoint[];
  summary: ReturnType<typeof summarizeDispatch>;
  latestPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  signals: ExternalSignalPanel[];
  batterySignals: BatterySignalResponse | null;
  decisionConfidence: DecisionConfidenceCard[];
  feasibilityChecks: TwinFeasibilityCheck[];
  activeBatteryTwin: BatteryTwinModel;
  health: DataHealth | null;
  curveHealth: DataHealth | null;
  portfolioSummary: PortfolioSummary;
  loading: boolean;
  twin: BatteryTwinConfig;
}) {
  const chargeRange = getActionRange(dispatch, "charge");
  const dischargeRange = getActionRange(dispatch, "discharge");
  const throughput = summary.chargeMwh + summary.dischargeMwh;
  const degradationCost = throughput * twin.degradationCostEurPerMwh;
  const equivalentCycles = twin.capacityMwh > 0 ? throughput / (2 * twin.capacityMwh) : 0;
  const priceChartData = chartPrices.length > 0 || priceRange !== "1D" ? chartPrices : prices;

  return (
    <>
      <DecisionHeader activeTwin={activeBatteryTwin} />

      <PortfolioSummaryStrip summary={portfolioSummary} />
      <SignalDeck batterySignals={batterySignals} signals={signals} />

      <DecisionConfidenceStrip cards={decisionConfidence} />

      <Panel>
        <PanelHeader
          title="Dispatch Signal Strip"
          kicker={
            batterySignals
              ? `${batterySignals.summary.intervalCount} operating intervals`
              : "Waiting for operating intervals"
          }
          right={<SignalQualityTag batterySignals={batterySignals} />}
        />
        <div className="flex flex-col gap-2 p-3">
          <BatterySignalStrip batterySignals={batterySignals} />
          <div className="mono flex justify-between text-[10px] text-zinc-500">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:45</span>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="96-Interval MTU Action Timeline"
          right={
            <div className="flex gap-3 text-[11px]">
              <Legend color="var(--green)" label="Charge" />
              <Legend color="var(--amber)" label="Discharge" />
              <Legend color="var(--bg-raised)" label="Idle" muted />
            </div>
          }
        />
        <div className="flex flex-col gap-2 p-3">
          <ActionTimeline dispatch={dispatch} />
          <div className="mono flex justify-between text-[10px] text-zinc-500">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:45</span>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="DAM MCP Price Series"
            kicker={loading ? "Loading market layer" : priceSeriesKicker(chartPrices, priceRange)}
            right={<PriceRangeControl value={priceRange} onChange={onPriceRangeChange} />}
          />
          <div className="px-3 pt-2 pb-3">
            {priceChartData.length > 0 ? (
              <PriceChart
                key={priceChartKey(priceRange, priceChartData)}
                data={priceChartData}
                height={340}
              />
            ) : (
              <EmptyPriceState range={priceRange} />
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title={`MTU ${String(selectedMtu).padStart(2, "0")} Curve Depth`}
            kicker={`${curveStats.totalPoints} curve points`}
          />
          <div className="p-3">
            {curves.length > 0 ? (
              <CurveChart data={curves} />
            ) : (
              <EmptyCurveState selectedDay={prices[0]?.interval.marketDate ?? ""} selectedMtu={selectedMtu} />
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="State of Charge Trajectory (%)"
          right={<Tag tone="outline">Constraint: Min 10% / Max 95%</Tag>}
        />
        <div className="p-3">
          <SocTrajectory dispatch={dispatch} twin={twin} />
          <ChartAxis />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <FeasibilityChecklist checks={feasibilityChecks} />
        <DecisionInputStack
          batterySignals={batterySignals}
          curveHealth={curveHealth}
          curveStats={curveStats}
          health={health}
          signals={signals}
        />
      </div>

      <div className="grid overflow-hidden rounded border border-white/10 bg-white/10 md:grid-cols-5">
        <MetricBox label="Expected Daily Value" value={formatEuro(summary.valueEur)} tone="cyan" />
        <MetricBox label="Degradation Cost (Est.)" value={formatEuro(-degradationCost)} tone="red" />
        <MetricBox label="Energy Throughput" value={formatMwh(throughput)} />
        <MetricBox label="Equivalent Cycles" value={`${equivalentCycles.toFixed(2)} / day`} />
        <div className="flex items-center justify-center bg-[var(--bg-panel)] p-3">
          <Tag tone={dispatch.length > 0 ? "green" : "outline"}>Feasible Schedule</Tag>
        </div>
      </div>

      <h2 className="mt-2 text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">
        Decision Evidence Log
      </h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <EvidenceCard
          tone="green"
          action="Charge"
          range={chargeRange}
          title="Solar Surplus Window"
          detail="Residual load drops significantly. Open-Meteo and HEnEx signals push clearing prices toward the lower quantile."
          footerLabel="Confidence"
          footerTag="High"
          footerTone="cyan"
        />
        <EvidenceCard
          tone="amber"
          action="Discharge"
          range={dischargeRange}
          title="Evening Scarcity Peak"
          detail="Solar drops off while demand peaks. Market curve fragility and price quantiles flag intervals that clear degradation cost."
          footerLabel="Confidence"
          footerTag="Medium"
          footerTone="amber"
        />
        <EvidenceCard
          tone="outline"
          action="Idle"
          range="Other MTUs"
          title="Spread Robustness Fail"
          detail={`Remaining intervals do not exceed round-trip loss plus ${formatEurPerMwh(twin.degradationCostEurPerMwh)} degradation cost.`}
          footerLabel="Asset Rule"
          footerTag="Cost Filter"
          footerTone="violet"
        />
      </div>

      <details className="group rounded border border-white/10 bg-[var(--bg-panel)]">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 px-3 py-1.5 marker:hidden">
          <div className="min-w-0">
            <div className="mono truncate font-medium text-[11px] text-zinc-500 uppercase tracking-[0.05em]">
              Operator Dispatch Rows
            </div>
            <div className="truncate text-[10px] text-zinc-500">
              Detailed MTU table, secondary to the timeline and SoC trajectory
            </div>
          </div>
          <span className="rounded border border-white/10 px-2 py-1 text-[10px] text-zinc-500 uppercase group-open:text-zinc-300">
            <span className="group-open:hidden">Expand</span>
            <span className="hidden group-open:inline">Collapse</span>
          </span>
        </summary>
        <div className="border-white/10 border-t">
          <DispatchTable data={dispatch} />
        </div>
      </details>
    </>
  );
}

function DecisionHeader({ activeTwin }: { activeTwin: BatteryTwinModel }) {
  return (
    <Panel className="border-cyan-300/20 bg-cyan-300/[0.05]">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <Zap className="mt-1 h-5 w-5 shrink-0 text-[var(--cyan)]" />
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-cyan-200 uppercase tracking-[0.08em]">
              Operating Conditions
            </div>
            <div className="mt-2 text-[18px] font-semibold leading-7 text-zinc-50">
              Midday solar pressure, evening scarcity risk, and forward-market context define today&apos;s
              operating backdrop.
            </div>
            <div className="mt-2 max-w-4xl text-[13px] leading-6 text-zinc-400">
              Weather and solar signals indicate production pressure around the middle of the day, while fuel
              and forward-market inputs set the risk envelope for the evening peak. Current DAM prices and
              curve liquidity suggest a day with meaningful intraday shape, but one still exposed to source
              freshness, curve coverage, and commodity-price uncertainty for the selected{" "}
              {activeTwin.profile.name} twin.
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function DecisionConfidenceStrip({ cards }: { cards: DecisionConfidenceCard[] }) {
  return (
    <div className="grid gap-2 md:grid-cols-5">
      {cards.map((card) => (
        <Panel key={card.id} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.05em]">
                {card.label}
              </div>
              <div className={`mono mt-1 truncate text-[16px] font-medium ${toneClass(card.tone)}`}>
                {card.value}
              </div>
            </div>
            <Tag tone={cardTone(card)}>{card.status}</Tag>
          </div>
          <div className="mt-2 line-clamp-2 min-h-8 text-[11px] leading-4 text-zinc-500">{card.detail}</div>
        </Panel>
      ))}
    </div>
  );
}

function cardTone(card: DecisionConfidenceCard): Tone {
  if (card.tone === "green") return "green";
  if (card.tone === "amber") return "amber";
  if (card.tone === "red") return "red";
  return "outline";
}

function ActionTimeline({ dispatch }: { dispatch: DispatchPoint[] }) {
  const blocks = Array.from({ length: 96 }, (_, index) => dispatch[index]?.action ?? "idle");
  return (
    <div className="flex h-6 gap-px border border-white/10 bg-white/10 p-px">
      {blocks.map((action, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 96-interval timeline slots are stable by index.
          key={index}
          className={`h-full flex-1 ${
            action === "charge"
              ? "bg-[var(--green)] opacity-80"
              : action === "discharge"
                ? "bg-[var(--amber)] opacity-80"
                : "bg-[var(--bg-raised)]"
          }`}
          title={`MTU ${index + 1}: ${action}`}
        />
      ))}
    </div>
  );
}

function EvidenceCard({
  tone,
  action,
  range,
  title,
  detail,
  footerLabel,
  footerTag,
  footerTone,
}: {
  tone: Tone;
  action: string;
  range: string;
  title: string;
  detail: string;
  footerLabel: string;
  footerTag: string;
  footerTone: Tone;
}) {
  return (
    <div className="flex flex-col gap-2 rounded border border-white/10 bg-[var(--bg-base)] p-3">
      <div className="flex items-center justify-between gap-2">
        <Tag tone={tone}>{action.toUpperCase()}</Tag>
        <span className="mono text-[11px] text-zinc-400">{range}</span>
      </div>
      <div>
        <div className="mb-1 font-medium">{title}</div>
        <div className="text-[12px] text-zinc-500">{detail}</div>
      </div>
      <div className="mt-auto flex justify-between border-white/10 border-t pt-2">
        <span className="text-[11px] text-zinc-500">{footerLabel}</span>
        <Tag tone={footerTone}>{footerTag}</Tag>
      </div>
    </div>
  );
}

function DecisionInputStack({
  batterySignals,
  curveHealth,
  curveStats,
  health,
  signals,
}: {
  batterySignals: BatterySignalResponse | null;
  curveHealth: DataHealth | null;
  curveStats: CurveStats;
  health: DataHealth | null;
  signals: ExternalSignalPanel[];
}) {
  const weather = findSignal(signals, "Weather");
  const ttf = findSignal(signals, "TTF");
  const eex = findSignal(signals, "EEX");
  return (
    <Panel>
      <PanelHeader title="Decision Inputs" kicker="Observed, cached, fallback, and proxy sources" />
      <div className="grid gap-2 p-3 md:grid-cols-2">
        <InputStackCard
          detail={`${health?.firstMarketDate ?? "n/a"} -> ${health?.lastMarketDate ?? "n/a"}`}
          label="HEnEx DAM"
          status={health ? marketModeLabel(health.mode) : "Missing"}
          tone={health ? "green" : "red"}
          value={`${health?.priceRows ?? 0} rows`}
        />
        <InputStackCard
          detail={curveHealth ? `${curveHealth.curveRows} derived rows` : "Static fallback if unavailable"}
          label="HEnEx Curves"
          status={curveStats.totalPoints > 0 ? "Loaded" : "Fallback"}
          tone={curveStats.totalPoints > 0 ? "green" : "amber"}
          value={`${curveStats.totalPoints} points`}
        />
        <InputStackCard
          detail={weather?.detail ?? "No weather cache"}
          label="Open-Meteo"
          status={statusLabel(weather)}
          tone={weather?.status === "missing" ? "red" : "cyan"}
          value={weather?.value ?? "Missing"}
        />
        <InputStackCard
          detail={`${ttf?.value ?? "TTF n/a"} · ${eex?.value ?? "EEX n/a"}`}
          label="Fuel / Forward Context"
          status={ttf || eex ? "Context" : "Missing"}
          tone={ttf || eex ? "blue" : "red"}
          value={batterySignals ? "Scored" : "Proxy"}
        />
      </div>
    </Panel>
  );
}

function InputStackCard({
  detail,
  label,
  status,
  tone,
  value,
}: {
  detail: string;
  label: string;
  status: string;
  tone: Tone;
  value: string;
}) {
  return (
    <div className="border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.05em]">{label}</div>
        <Tag tone={tone}>{status}</Tag>
      </div>
      <div className="mono mt-1 truncate text-[14px] text-zinc-100">{value}</div>
      <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{detail}</div>
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
            className={`mono h-6 rounded-sm border px-2 text-[10px] transition ${
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

function PortfolioSummaryStrip({ summary }: { summary: PortfolioSummary }) {
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <Metric label="Fleet Capacity" value={formatMwh(summary.capacityMwh)} detail="Demo Greek portfolio" />
      <Metric label="Charging" value={formatMw(summary.chargingMw)} detail="Current interval" />
      <Metric label="Discharging" value={formatMw(summary.dischargingMw)} detail="Current interval" />
      <Metric
        label="Average SoC"
        value={formatPercent(summary.averageSocPercent === null ? null : summary.averageSocPercent / 100)}
        detail={`${summary.activeSites} active sites`}
      />
    </div>
  );
}

function SignalDeck({
  batterySignals,
  signals,
}: {
  batterySignals: BatterySignalResponse | null;
  signals: ExternalSignalPanel[];
}) {
  const weather = findSignal(signals, "Weather");
  const ttf = findSignal(signals, "TTF gas");
  const eex = findSignal(signals, "EEX");
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      <SignalMetricCard
        detail={
          batterySignals
            ? `${batterySignals.summary.intervalCount} operating intervals`
            : "No operating intervals loaded"
        }
        label="Signal Coverage"
        tone="cyan"
        value={batterySignals ? String(batterySignals.summary.intervalCount) : "n/a"}
      />
      <SignalSpotlight accent="cyan" icon={CloudSun} kicker="Open-Meteo" signal={weather} title="Weather" />
      <SignalSpotlight accent="amber" icon={Flame} kicker="ICE" signal={ttf} title="TTF gas" />
      <SignalSpotlight accent="zinc" icon={Activity} kicker="EEX" signal={eex} title="Forward Context" />
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

function SignalQualityTag({ batterySignals }: { batterySignals: BatterySignalResponse | null }) {
  if (!batterySignals) {
    return <Tag tone="red">Missing</Tag>;
  }
  const first = batterySignals.intervals[0];
  const missingCount = first
    ? Object.values(first.quality).filter((quality) => quality === "missing").length
    : 0;
  return <Tag tone={missingCount > 0 ? "amber" : "green"}>{missingCount > 0 ? "Proxy" : "Observed"}</Tag>;
}

function BatterySignalStrip({ batterySignals }: { batterySignals: BatterySignalResponse | null }) {
  const intervals = batterySignals?.intervals ?? [];
  if (intervals.length === 0) {
    return (
      <div className="flex h-8 items-center justify-center border border-white/10 bg-black/20 text-[11px] text-zinc-500">
        No canonical battery signals loaded.
      </div>
    );
  }
  return (
    <div className="flex h-8 gap-px border border-white/10 bg-white/10 p-px">
      {intervals.map((interval) => (
        <div
          key={`${interval.marketDate}-${interval.mtu}`}
          className={`h-full min-w-px flex-1 ${signalIntervalClass(interval)}`}
          title={`MTU ${interval.mtu} · FVI ${formatScore(interval.signals.flexibilityValueIndex)} · ${interval.regime}`}
        />
      ))}
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

function EmptyCurveState({
  selectedDay,
  selectedMtu,
  hasCurveDay = false,
}: {
  selectedDay: string;
  selectedMtu?: number;
  hasCurveDay?: boolean;
}) {
  const mtuLabel = selectedMtu ? ` MTU ${String(selectedMtu).padStart(2, "0")}` : "";
  return (
    <div className="flex h-[290px] items-center justify-center px-6 text-center text-[12px] text-zinc-500">
      {hasCurveDay
        ? `No local AggrCurve points for ${selectedDay}${mtuLabel}.`
        : `AggrCurves are loaded for the recent modelling window only. ${selectedDay || "This day"} has price history, but no local curve day.`}
    </div>
  );
}

function SocTrajectory({ dispatch, twin }: { dispatch: DispatchPoint[]; twin: BatteryTwinConfig }) {
  const points =
    dispatch.length > 0
      ? dispatch
          .map((point, index) => {
            const x = dispatch.length > 1 ? (index / (dispatch.length - 1)) * 100 : 0;
            const pct = twin.capacityMwh > 0 ? (point.socMwh / twin.capacityMwh) * 100 : 0;
            const y = 100 - Math.max(0, Math.min(100, pct));
            return `${x.toFixed(2)},${y.toFixed(2)}`;
          })
          .join(" ")
      : "0,90 30,90 40,15 60,15 70,85 100,85";

  return (
    <div className="relative h-[180px] border-white/10 border-b border-l bg-[repeating-linear-gradient(to_bottom,transparent,transparent_39px,rgba(255,255,255,0.10)_40px)]">
      <div className="absolute top-[5%] w-full border-red-300/50 border-t border-dashed" />
      <div className="absolute top-[90%] w-full border-red-300/50 border-t border-dashed" />
      <svg
        aria-label="State of charge trajectory"
        className="absolute inset-0 h-full w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 100 100"
      >
        <polyline
          fill="none"
          points={points}
          stroke="var(--green)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function ChartAxis() {
  return (
    <div className="mono mt-1 flex justify-between text-[11px] text-zinc-500">
      <span>0</span>
      <span>24</span>
      <span>48</span>
      <span>72</span>
      <span>96</span>
    </div>
  );
}

function FeasibilityChecklist({ checks }: { checks: TwinFeasibilityCheck[] }) {
  return (
    <Panel>
      <PanelHeader
        title="Twin Feasibility Proof"
        kicker="Derived from dispatch and selected battery constraints"
        right={<Tag tone={checks.every((check) => check.status === "pass") ? "green" : "amber"}>Twin</Tag>}
      />
      <div className="grid gap-2 p-3 md:grid-cols-2">
        {checks.slice(0, 8).map((check) => (
          <div key={check.id} className="border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-[12px] font-medium text-zinc-200">{check.label}</div>
              <Tag tone={check.status === "pass" ? "green" : check.status === "review" ? "amber" : "red"}>
                {check.status}
              </Tag>
            </div>
            <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-500">{check.detail}</div>
          </div>
        ))}
      </div>
    </Panel>
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

function MetricBox({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="flex flex-col gap-1 bg-[var(--bg-panel)] p-3">
      <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">{label}</div>
      <div className={`mono text-[16px] font-medium ${toneClass(tone)}`}>{value}</div>
    </div>
  );
}

function Legend({ color, label, muted = false }: { color: string; label: string; muted?: boolean }) {
  return (
    <span className={`flex items-center gap-1 ${muted ? "text-zinc-500" : ""}`}>
      <span className="h-2 w-2 border border-white/10" style={{ background: color }} />
      {label}
    </span>
  );
}

function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`mono inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${tagClass(tone)}`}
    >
      {children}
    </span>
  );
}

function getActionRange(dispatch: DispatchPoint[], action: DispatchAction) {
  const mtus = dispatch.filter((point) => point.action === action).map((point) => point.interval.mtu);
  if (mtus.length === 0) return "No MTUs";
  const ranges: string[] = [];
  let start = mtus[0] ?? 0;
  let previous = start;
  for (const mtu of mtus.slice(1)) {
    if (mtu === previous + 1) {
      previous = mtu;
      continue;
    }
    ranges.push(start === previous ? `MTU ${start}` : `MTU ${start}-${previous}`);
    start = mtu;
    previous = mtu;
  }
  ranges.push(start === previous ? `MTU ${start}` : `MTU ${start}-${previous}`);
  return ranges.join(", ");
}

function formatScore(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${(value * 10).toFixed(1)} / 10`;
}

function signalIntervalClass(interval: BatterySignalInterval) {
  const { chargeAttractiveness, curtailmentAbsorption, dischargeScarcity, marketFragility } =
    interval.signals;
  if (marketFragility >= 0.72) {
    return "bg-[var(--red)] opacity-90";
  }
  if (dischargeScarcity >= chargeAttractiveness && dischargeScarcity >= curtailmentAbsorption) {
    return "bg-[var(--amber)] opacity-85";
  }
  if (chargeAttractiveness >= curtailmentAbsorption) {
    return "bg-[var(--green)] opacity-85";
  }
  return "bg-[var(--cyan)] opacity-80";
}

function marketModeLabel(mode: DataHealth["mode"] | undefined) {
  if (mode === "convex") return "Convex";
  if (mode === "convex-http") return "Convex HTTP";
  if (mode === "json-fallback") return "JSON fallback";
  return "loading";
}

function findSignal(signals: ExternalSignalPanel[], label: string) {
  return signals.find((signal) => signal.label.toLowerCase().includes(label.toLowerCase()));
}

function missingSignal(label: string): ExternalSignalPanel {
  return {
    label,
    value: "Missing",
    detail: "Convex cache is not linked or hydrated.",
    status: "missing",
  };
}

function statusLabel(signal: ExternalSignalPanel | undefined) {
  return signal?.status === "live" ? "Live" : signal?.status === "cached" ? "Cached" : "Missing";
}

function tagClass(tone: Tone) {
  switch (tone) {
    case "cyan":
      return "bg-[var(--tag-cyan-bg)] text-[var(--cyan)]";
    case "green":
      return "bg-[var(--tag-green-bg)] text-[var(--green)]";
    case "amber":
      return "bg-[var(--tag-amber-bg)] text-[var(--amber)]";
    case "red":
      return "bg-[var(--tag-red-bg)] text-[var(--red)]";
    case "blue":
      return "bg-[var(--tag-blue-bg)] text-[var(--blue)]";
    case "violet":
      return "bg-[var(--tag-violet-bg)] text-[var(--violet)]";
    case "outline":
      return "border border-white/10 bg-transparent text-zinc-500";
  }
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
