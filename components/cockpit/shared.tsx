import type { ComponentType, ReactNode } from "react";
import { Panel } from "@/components/ui/panel";
import type {
  AggregatedCurvePoint,
  BatterySignalInterval,
  BatterySignalResponse,
  ExternalSignalPanel,
} from "@/lib/types";

export type Tone = "cyan" | "green" | "amber" | "red" | "blue" | "violet" | "outline";

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

export function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Panel className="p-3">
      <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">{label}</div>
      <div className="mono mt-1 truncate text-[16px] font-medium text-zinc-100">{value}</div>
      <div className="mt-1 truncate text-[11px] text-zinc-500">{detail}</div>
    </Panel>
  );
}

export function DetailMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-white/10 bg-[var(--bg-base)] p-3">
      <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">{label}</div>
      <div className="mono mt-1 truncate text-[16px] font-medium text-zinc-100">{value}</div>
      <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{detail}</div>
    </div>
  );
}

export function MetricBox({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="flex flex-col gap-1 bg-[var(--bg-panel)] p-3">
      <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">{label}</div>
      <div className={`mono text-[16px] font-medium ${toneClass(tone)}`}>{value}</div>
    </div>
  );
}

export function SignalCard({ signal, compact = false }: { signal: ExternalSignalPanel; compact?: boolean }) {
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

export function SignalMetricCard({
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

export function SignalQualityTag({ batterySignals }: { batterySignals: BatterySignalResponse | null }) {
  if (!batterySignals) {
    return <Tag tone="red">Missing</Tag>;
  }
  const first = batterySignals.intervals[0];
  const missingCount = first
    ? Object.values(first.quality).filter((quality) => quality === "missing").length
    : 0;
  return <Tag tone={missingCount > 0 ? "amber" : "green"}>{missingCount > 0 ? "Proxy" : "Observed"}</Tag>;
}

export function BatterySignalStrip({ batterySignals }: { batterySignals: BatterySignalResponse | null }) {
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

export function SignalSpotlight({
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

export function Legend({ color, label, muted = false }: { color: string; label: string; muted?: boolean }) {
  return (
    <span className={`flex items-center gap-1 ${muted ? "text-zinc-500" : ""}`}>
      <span className="h-2 w-2 border border-white/10" style={{ background: color }} />
      {label}
    </span>
  );
}

export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`mono inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${tagClass(tone)}`}
    >
      {children}
    </span>
  );
}

export function formatScore(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${(value * 10).toFixed(1)} / 10`;
}

export function findSignal(signals: ExternalSignalPanel[], label: string) {
  return signals.find((signal) => signal.label.toLowerCase().includes(label.toLowerCase()));
}

export function missingSignal(label: string): ExternalSignalPanel {
  return {
    label,
    value: "Missing",
    detail: "Convex cache is not linked or hydrated.",
    status: "missing",
  };
}

export function statusLabel(signal: ExternalSignalPanel | undefined) {
  return signal?.status === "live" ? "Live" : signal?.status === "cached" ? "Cached" : "Missing";
}

export function summarizeCurves(curves: AggregatedCurvePoint[]): CurveStats {
  const buy = curves.filter((point) => point.side === "Buy");
  const sell = curves.filter((point) => point.side === "Sell");
  const prices = curves.map((point) => point.unitPriceEurPerMwh);
  const quantities = curves.map((point) => point.quantityMwh);

  return {
    totalPoints: curves.length,
    buyPoints: buy.length,
    sellPoints: sell.length,
    buyMwh: buy.length ? buy.reduce((total, point) => total + point.quantityMwh, 0) : null,
    sellMwh: sell.length ? sell.reduce((total, point) => total + point.quantityMwh, 0) : null,
    lowPrice: minOrNull(prices),
    highPrice: maxOrNull(prices),
    lowQuantity: minOrNull(quantities),
    highQuantity: maxOrNull(quantities),
  };
}

export function tagClass(tone: Tone) {
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

export function toneClass(tone?: Tone) {
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

export function statusDotClass(status: ExternalSignalPanel["status"]) {
  if (status === "missing") return "bg-zinc-600";
  if (status === "live") return "bg-[var(--green)]";
  return "bg-[var(--cyan)]";
}

export function signalIntervalClass(interval: BatterySignalInterval) {
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

function minOrNull(values: number[]) {
  return values.length ? Math.min(...values) : null;
}

function maxOrNull(values: number[]) {
  return values.length ? Math.max(...values) : null;
}
