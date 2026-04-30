import type { ReactNode } from "react";
import { formatEurPerMwh, formatMw, formatMwh, formatPercent } from "@/lib/format";
import { formatMtuWindow } from "@/lib/market-time";
import type {
  BatterySignalInterval,
  BatterySignalResponse,
  BatteryTwinConfig,
  ExternalSignalPanel,
} from "@/lib/types";
import { findSignal, Tag, type Tone, toneClass } from "./shared";
import type { View } from "./types";

export function RightRail({
  batterySignals,
  selectedDay,
  signals,
  twin,
  view,
}: {
  batterySignals: BatterySignalResponse | null;
  selectedDay?: string;
  signals: ExternalSignalPanel[];
  twin: BatteryTwinConfig;
  view: View;
}) {
  const bestCharge = batterySignals?.summary.bestChargeWindows[0] ?? null;
  const bestDischarge = batterySignals?.summary.bestDischargeWindows[0] ?? null;
  const peakSurplus = batterySignals?.summary.highestCurtailmentWindows[0] ?? null;
  const highestSpread = highestSignalInterval(batterySignals, "spreadRobustness");
  const weather = findSignal(signals, "Weather");
  const railTitle =
    view === "dispatch" ? "Dispatch Signals" : view === "market" ? "Market Feeds" : "Weather Feed";
  const railSignals = view === "weather" ? [weather ?? railMissingSignal("Weather")] : signals;
  return (
    <aside className="dense-scrollbar flex h-full min-w-0 flex-col overflow-y-auto overflow-x-hidden border-white/10 border-l bg-[var(--bg-panel)]">
      <RailSection title={railTitle}>
        {view === "dispatch" ? (
          <>
            <KvRow label="DAM day" value={selectedDay ?? "loading"} />
            <KvRow label="Best charge window" value={windowLabel(bestCharge)} tone="green" />
            <KvRow label="Best discharge window" value={windowLabel(bestDischarge)} tone="amber" />
            <KvRow label="Signal intervals" value={intervalCountLabel(batterySignals)} />
          </>
        ) : null}
        {view === "market" ? (
          <>
            <KvRow label="Price feed" value="HEnEx DAM" tone="green" />
            <KvRow label="Strongest spread" value={windowLabel(highestSpread)} tone="green" />
            <KvRow label="Best discharge window" value={windowLabel(bestDischarge)} tone="amber" />
            <KvRow label="Signal intervals" value={intervalCountLabel(batterySignals)} />
          </>
        ) : null}
        {view === "weather" ? (
          <>
            <KvRow label="Weather source" value={sourceStatusLabel(weather)} tone={sourceTone(weather)} />
            <KvRow label="Solar surplus peak" value={windowLabel(peakSurplus)} tone="cyan" />
            <KvRow
              label="Irradiance"
              value={percentLabel(maxWeatherInputValue(batterySignals, "solar"))}
              tone="green"
            />
            <KvRow
              label="Wind"
              value={percentLabel(maxWeatherInputValue(batterySignals, "wind"))}
              tone="violet"
            />
          </>
        ) : null}
      </RailSection>
      {view === "dispatch" ? (
        <RailSection title="Battery Assets Specs">
          <KvRow
            label="Asset Config"
            value={`${formatMw(twin.maxDischargeMw)} / ${formatMwh(twin.capacityMwh)}`}
          />
          <KvRow label="Round-Trip Efficiency" value={formatPercent(twin.roundTripEfficiency)} />
          <KvRow label="Degradation Cost" value={formatEurPerMwh(twin.degradationCostEurPerMwh)} />
          <KvRow
            label="Reserve SoC limits"
            value={`${formatMwh(twin.minSocMwh)} / ${formatMwh(twin.maxSocMwh)}`}
          />
        </RailSection>
      ) : null}
      <section className="flex flex-1 flex-col border-white/10 border-b">
        <div className="sticky top-0 z-10 flex items-center justify-between border-white/10 border-b bg-[var(--bg-base)] px-4 py-3">
          <div className="mono text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">
            Source Snapshot
          </div>
          <Tag tone="outline">{railSignals.length}</Tag>
        </div>
        <div className="flex flex-col">
          {railSignals.map((signal) => (
            <MarketSignalRow key={signal.label} signal={signal} />
          ))}
        </div>
      </section>
    </aside>
  );
}

function highestSignalInterval(
  batterySignals: BatterySignalResponse | null,
  signal: keyof BatterySignalInterval["signals"],
) {
  const intervals = batterySignals?.intervals ?? [];
  if (intervals.length === 0) {
    return null;
  }
  return [...intervals].sort((left, right) => right.signals[signal] - left.signals[signal])[0] ?? null;
}

function maxWeatherInputValue(
  batterySignals: BatterySignalResponse | null,
  input: "solar" | "wind" | "cloud",
) {
  const intervals = batterySignals?.intervals ?? [];
  return [...intervals]
    .map((interval) => weatherValue(interval, input))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => right - left)[0];
}

function weatherValue(interval: BatterySignalInterval, input: "solar" | "wind" | "cloud") {
  if (input === "solar") {
    return interval.inputs.solarAvailabilityScore ?? solarProxyForMtu(interval.mtu);
  }
  if (input === "wind") {
    return (
      interval.inputs.windGenerationProxy ?? windProxyForMtu(interval.mtu, interval.inputs.priceJumpStress)
    );
  }
  return (
    interval.inputs.weatherDemandStress ??
    demandStressProxyForMtu(
      interval.mtu,
      interval.inputs.pricePosition,
      interval.inputs.solarAvailabilityScore,
    )
  );
}

function solarProxyForMtu(mtu: number) {
  const hour = ((mtu - 1) * 15) / 60;
  const daylight = Math.sin(((hour - 6) / 14) * Math.PI);
  return clamp01(daylight * 0.78 + 0.08);
}

function windProxyForMtu(mtu: number, priceJumpStress: number | null | undefined) {
  const hour = ((mtu - 1) * 15) / 60;
  const overnightLift = hour < 7 || hour >= 21 ? 0.16 : 0;
  const afternoonMix = Math.sin(((hour + 2) / 24) * Math.PI * 2) * 0.12;
  return clamp01(0.34 + overnightLift + afternoonMix + clamp01(priceJumpStress) * 0.18);
}

function demandStressProxyForMtu(
  mtu: number,
  pricePosition: number | null | undefined,
  solarAvailabilityScore: number | null | undefined,
) {
  const hour = ((mtu - 1) * 15) / 60;
  const eveningPeak = Math.exp(-((hour - 20) ** 2) / 10);
  const morningRamp = Math.exp(-((hour - 8) ** 2) / 14) * 0.35;
  return clamp01(
    0.18 +
      eveningPeak * 0.42 +
      morningRamp +
      clamp01(pricePosition) * 0.24 -
      clamp01(solarAvailabilityScore) * 0.18,
  );
}

function clamp01(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function windowLabel(interval: BatterySignalInterval | null | undefined) {
  if (!interval) {
    return "n/a";
  }
  return formatMtuWindow(interval.marketDate, interval.mtu);
}

function intervalCountLabel(batterySignals: BatterySignalResponse | null) {
  return batterySignals ? String(batterySignals.summary.intervalCount) : "missing";
}

function percentLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function sourceStatusLabel(signal: ExternalSignalPanel | undefined) {
  if (signal?.status === "live") return "live";
  if (signal?.status === "cached") return "ready";
  return "missing";
}

function sourceTone(signal: ExternalSignalPanel | undefined): Tone {
  if (signal?.status === "live") return "green";
  if (signal?.status === "cached") return "blue";
  return "red";
}

function railMissingSignal(label: string): ExternalSignalPanel {
  return {
    label,
    value: "missing",
    detail: "Source data is not loaded.",
    status: "missing",
  };
}

function RailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-white/10 border-b">
      <div className="border-white/10 border-b bg-[var(--bg-base)] px-4 py-3">
        <div className="mono text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">{title}</div>
      </div>
      <div className="flex flex-col gap-2 px-4 py-3">{children}</div>
    </section>
  );
}

function KvRow({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="flex justify-between gap-3 text-[12px] leading-5">
      <span className="min-w-0 truncate text-zinc-500">{label}</span>
      <span className={`mono shrink-0 text-right ${toneClass(tone)}`}>{value}</span>
    </div>
  );
}

function MarketSignalRow({ signal }: { signal: ExternalSignalPanel }) {
  return (
    <div className="flex items-start justify-between gap-3 border-white/10 border-b px-4 py-2.5 hover:bg-white/[0.02]">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="mono truncate text-[12px]">{signal.label}</span>
        <span className="truncate text-[11px] text-zinc-500">{signal.detail}</span>
      </div>
      <div className="shrink-0 text-right">
        <div className="mono text-[12px]">{signal.value}</div>
        <Tag tone={signal.status === "live" ? "cyan" : signal.status === "cached" ? "blue" : "red"}>
          {signal.status}
        </Tag>
      </div>
    </div>
  );
}
