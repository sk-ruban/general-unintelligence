"use client";

import { Zap } from "lucide-react";
import type { ReactNode } from "react";
import { DispatchTable } from "@/components/dispatch-table";
import { Panel, PanelHeader } from "@/components/ui/panel";
import type { summarizeDispatch } from "@/lib/battery-dispatch";
import type { BatteryTwin as BatteryTwinModel, TwinFeasibilityCheck } from "@/lib/battery-twin";
import type { DecisionConfidenceCard } from "@/lib/decision-confidence";
import { formatEuro, formatEurPerMwh, formatMw, formatMwh, formatPercent } from "@/lib/format";
import { formatMarketIntervalWindow, NOMINAL_MTUS_PER_DAY } from "@/lib/market-time";
import type { PortfolioSummary } from "@/lib/portfolio";
import type {
  BatterySignalInterval,
  BatterySignalResponse,
  BatteryTwinConfig,
  DispatchAction,
  DispatchPoint,
} from "@/lib/types";
import { PageIntro } from "./shared";

type Tone = "cyan" | "green" | "amber" | "red" | "blue" | "violet" | "outline";

export function DispatchPlan({
  dispatch,
  summary,
  batterySignals,
  decisionConfidence,
  feasibilityChecks,
  activeBatteryTwin,
  portfolioSummary,
  twin,
}: {
  dispatch: DispatchPoint[];
  summary: ReturnType<typeof summarizeDispatch>;
  batterySignals: BatterySignalResponse | null;
  decisionConfidence: DecisionConfidenceCard[];
  feasibilityChecks: TwinFeasibilityCheck[];
  activeBatteryTwin: BatteryTwinModel;
  portfolioSummary: PortfolioSummary;
  twin: BatteryTwinConfig;
}) {
  const chargeWindowCount = getActionWindowCount(dispatch, "charge");
  const dischargeWindowCount = getActionWindowCount(dispatch, "discharge");
  const idleWindowCount = getActionWindowCount(dispatch, "idle");
  const throughput = summary.chargeMwh + summary.dischargeMwh;
  const degradationCost = throughput * twin.degradationCostEurPerMwh;
  const equivalentCycles = twin.capacityMwh > 0 ? throughput / (2 * twin.capacityMwh) : 0;

  return (
    <>
      <DecisionHeader activeTwin={activeBatteryTwin} summary={summary} />

      <PortfolioSummaryStrip summary={portfolioSummary} />

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

      <Panel>
        <PanelHeader
          title="State of Charge Trajectory (%)"
          right={
            <Tag tone="outline">
              Constraint: Min {formatPercent(socRatio(twin.minSocMwh, twin.capacityMwh))} / Max{" "}
              {formatPercent(socRatio(twin.maxSocMwh, twin.capacityMwh))}
            </Tag>
          }
        />
        <div className="p-3">
          <SocTrajectory dispatch={dispatch} twin={twin} />
          <ChartAxis />
        </div>
      </Panel>

      <div className="grid gap-4">
        <FeasibilityChecklist checks={feasibilityChecks} />
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
          range={chargeWindowCount}
          title="Solar Surplus Window"
          detail="Residual load drops significantly. Open-Meteo and HEnEx signals push clearing prices toward the lower quantile."
          footerLabel="Confidence"
          footerTag="High"
          footerTone="cyan"
        />
        <EvidenceCard
          tone="amber"
          action="Discharge"
          range={dischargeWindowCount}
          title="Evening Scarcity Peak"
          detail="Solar drops off while demand peaks. Market curve fragility and price quantiles flag intervals that clear degradation cost."
          footerLabel="Confidence"
          footerTag="Medium"
          footerTone="amber"
        />
        <EvidenceCard
          tone="outline"
          action="Idle"
          range={idleWindowCount}
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
            <div className="text-[10px] text-zinc-500">
              Detailed interval table, secondary to the timeline and SoC trajectory
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

function DecisionHeader({
  activeTwin,
  summary,
}: {
  activeTwin: BatteryTwinModel;
  summary: ReturnType<typeof summarizeDispatch>;
}) {
  return (
    <PageIntro
      kicker="Dispatch Plan"
      title="Operating Conditions"
      description={`Shows when the current ${activeTwin.profile.name} schedule charges, discharges, or waits, with battery constraints, state-of-charge movement, feasibility checks, and operator-ready interval rows.`}
      actions={
        <>
          <Tag tone={summary.valueEur >= 0 ? "green" : "red"}>{formatEuro(summary.valueEur)}</Tag>
          <Tag tone="cyan">
            <Zap className="mr-1 size-3" />
            {formatMwh(summary.chargeMwh + summary.dischargeMwh)}
          </Tag>
        </>
      }
    />
  );
}

function DecisionConfidenceStrip({ cards }: { cards: DecisionConfidenceCard[] }) {
  const visibleCards = cards.filter((card) => card.label !== "Market Fragility");

  return (
    <div className="grid gap-2 md:grid-cols-4">
      {visibleCards.map((card) => (
        <Panel key={card.id} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.05em]">
                {card.label}
              </div>
              <div
                className={`mono mt-1 break-words text-[16px] font-medium leading-5 ${toneClass(card.tone)}`}
              >
                {card.value}
              </div>
            </div>
            <Tag tone={cardTone(card)}>{card.status}</Tag>
          </div>
          <div className="mt-2 min-h-8 text-[11px] leading-4 text-zinc-500">{card.detail}</div>
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
  const dispatchByMtu = new Map(dispatch.map((point) => [point.interval.mtu, point]));
  const blocks = Array.from({ length: NOMINAL_MTUS_PER_DAY }, (_, index) => dispatchByMtu.get(index + 1));
  return (
    <div className="flex h-6 gap-px border border-white/10 bg-white/10 p-px">
      {blocks.map((point, index) => {
        const action = point?.action ?? "idle";
        return (
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
            title={`${point?.interval ? formatMarketIntervalWindow(point.interval) : `MTU ${index + 1}`}: ${action}`}
          />
        );
      })}
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

function PortfolioSummaryStrip({ summary }: { summary: PortfolioSummary }) {
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <Metric
        label="Fleet Capacity"
        value={formatMwh(summary.capacityMwh)}
        detail={`${summary.activeSites} ${summary.activeSites === 1 ? "asset" : "assets"}`}
      />
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

function SignalQualityTag({ batterySignals }: { batterySignals: BatterySignalResponse | null }) {
  if (!batterySignals) {
    return <Tag tone="red">Missing</Tag>;
  }
  const first = batterySignals.intervals[0];
  const hasObservedPrice = first?.quality.price === "observed";
  return <Tag tone={hasObservedPrice ? "green" : "amber"}>{hasObservedPrice ? "HEnEx DAM" : "Derived"}</Tag>;
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
  const signalByMtu = new Map(intervals.map((interval) => [interval.mtu, interval]));
  const slots = Array.from({ length: NOMINAL_MTUS_PER_DAY }, (_, index) => signalByMtu.get(index + 1));
  return (
    <div className="flex h-8 gap-px border border-white/10 bg-white/10 p-px">
      {slots.map((interval, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 96-interval timeline slots are stable by index.
          key={index}
          className={`h-full min-w-px flex-1 ${interval ? signalIntervalClass(interval) : "bg-[var(--bg-raised)]"}`}
          title={
            interval
              ? `${formatSignalWindow(interval)} · FVI ${formatScore(interval.signals.flexibilityValueIndex)} · ${interval.regime}`
              : `MTU ${index + 1}: missing signal`
          }
        />
      ))}
    </div>
  );
}

function SocTrajectory({ dispatch, twin }: { dispatch: DispatchPoint[]; twin: BatteryTwinConfig }) {
  const points =
    dispatch.length > 0
      ? [
          `0,${socY(twin.initialSocMwh, twin.capacityMwh).toFixed(2)}`,
          ...dispatch
            .slice()
            .sort((left, right) => left.interval.mtu - right.interval.mtu)
            .map((point) => {
              const x = (point.interval.mtu / NOMINAL_MTUS_PER_DAY) * 100;
              return `${x.toFixed(2)},${socY(point.socMwh, twin.capacityMwh).toFixed(2)}`;
            }),
        ].join(" ")
      : "0,90 30,90 40,15 60,15 70,85 100,85";

  return (
    <div className="relative h-[180px] border-white/10 border-b border-l bg-[repeating-linear-gradient(to_bottom,transparent,transparent_39px,rgba(255,255,255,0.10)_40px)]">
      <div
        className="absolute w-full border-red-300/50 border-t border-dashed"
        style={{ top: `${socY(twin.maxSocMwh, twin.capacityMwh)}%` }}
      />
      <div
        className="absolute w-full border-red-300/50 border-t border-dashed"
        style={{ top: `${socY(twin.minSocMwh, twin.capacityMwh)}%` }}
      />
      <svg
        aria-label="State of charge trajectory synced to the 96-MTU action timeline"
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

function socY(socMwh: number, capacityMwh: number) {
  const pct = socRatio(socMwh, capacityMwh) * 100;
  return 100 - Math.max(0, Math.min(100, pct));
}

function socRatio(socMwh: number, capacityMwh: number) {
  return capacityMwh > 0 ? socMwh / capacityMwh : 0;
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
        title="Dispatch Constraint Checks"
        kicker="Derived from dispatch and selected battery constraints"
        right={<Tag tone={checks.every((check) => check.status === "pass") ? "green" : "amber"}>Twin</Tag>}
      />
      <div className="grid gap-2 p-3 md:grid-cols-2">
        {checks.slice(0, 8).map((check) => (
          <div key={check.id} className="border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] font-medium leading-4 text-zinc-200">{check.label}</div>
              <Tag tone={check.status === "pass" ? "green" : check.status === "review" ? "amber" : "red"}>
                {check.status}
              </Tag>
            </div>
            <div className="mt-1 text-[11px] leading-4 text-zinc-500">{check.detail}</div>
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
      <div className="mono mt-1 break-words text-[16px] font-medium leading-5 text-zinc-100">{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-zinc-500">{detail}</div>
    </Panel>
  );
}

function MetricBox({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="flex flex-col gap-1 bg-[var(--bg-panel)] p-3">
      <div className="text-[11px] font-medium leading-4 text-zinc-500 uppercase tracking-[0.05em]">
        {label}
      </div>
      <div className={`mono break-words text-[16px] font-medium leading-5 ${toneClass(tone)}`}>{value}</div>
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

function getActionWindowCount(dispatch: DispatchPoint[], action: DispatchAction) {
  const runs = getActionRuns(dispatch, action);
  if (runs.length === 0) return "0 windows";
  if (runs.length === 1) return formatWindowCount(runs[0] ?? 0);
  const total = runs.reduce((sum, count) => sum + count, 0);
  const longest = Math.max(...runs);
  return `${formatWindowCount(total)} · longest ${longest}`;
}

function getActionRuns(dispatch: DispatchPoint[], action: DispatchAction) {
  const mtus = dispatch
    .filter((point) => point.action === action)
    .map((point) => point.interval.mtu)
    .sort((left, right) => left - right);
  const runs: number[] = [];
  let currentRun = 0;
  let previousMtu: number | null = null;
  for (const mtu of mtus) {
    if (previousMtu === null || mtu === previousMtu + 1) {
      currentRun += 1;
    } else {
      runs.push(currentRun);
      currentRun = 1;
    }
    previousMtu = mtu;
  }
  if (currentRun > 0) runs.push(currentRun);
  return runs;
}

function formatWindowCount(count: number) {
  return `${count} ${count === 1 ? "window" : "windows"}`;
}

function formatSignalWindow(interval: BatterySignalInterval) {
  return `${interval.localMinute}-${nextLocalMinute(interval.localMinute)}`;
}

function nextLocalMinute(localMinute: string) {
  const [hourRaw, minuteRaw] = localMinute.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return "n/a";
  }
  const total = (hour * 60 + minute + 15) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
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
      return "bg-violet-400/10 text-violet-200";
    case "outline":
      return "border border-white/10 bg-white/[0.03] text-zinc-400";
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
      return "text-violet-200";
    default:
      return "text-zinc-100";
  }
}
