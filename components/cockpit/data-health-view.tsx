import { Panel, PanelHeader } from "@/components/ui/panel";
import type { BatterySignalResponse, DataHealth, ExternalSignalPanel } from "@/lib/types";
import { Metric, Tag, type Tone } from "./shared";

type SourceCard = {
  name: string;
  status: "live" | "cached" | "missing";
  detail: string;
  coverage: string;
  action: string;
};

export function DataSourcesView({
  health,
  curveHealth,
  signals,
  batterySignals,
  days,
  curveDays,
}: {
  health: DataHealth | null;
  curveHealth: DataHealth | null;
  signals: ExternalSignalPanel[];
  batterySignals: BatterySignalResponse | null;
  days: string[];
  curveDays: string[];
}) {
  const sources = sourceCards({ health, curveHealth, signals, batterySignals, days, curveDays });
  const liveCount = sources.filter((source) => source.status === "live").length;
  const availableCount = sources.filter((source) => source.status !== "missing").length;

  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHeader title="Data Sources" kicker="Operational inputs available to the cockpit" />
        <div className="grid gap-2 p-3 md:grid-cols-4">
          <Metric
            label="Available Sources"
            value={`${availableCount} / ${sources.length}`}
            detail="Ready or cached"
          />
          <Metric label="Live Sources" value={String(liveCount)} detail="Fresh source panels" />
          <Metric label="Market Days" value={String(days.length)} detail={dateRangeLabel(health)} />
          <Metric
            label="Curve Days"
            value={String(curveDays.length)}
            detail={curveRangeLabel(curveHealth, health)}
          />
        </div>
      </Panel>
      <div className="grid gap-2 xl:grid-cols-2">
        {sources.map((source) => (
          <DataSourceCard key={source.name} source={source} />
        ))}
      </div>
    </div>
  );
}

export { DataSourcesView as DataHealthView };

function DataSourceCard({ source }: { source: SourceCard }) {
  return (
    <Panel className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-zinc-100">{source.name}</div>
          <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{source.detail}</div>
        </div>
        <Tag tone={statusTone(source.status)}>{statusLabel(source.status)}</Tag>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <SourceFact label="Coverage" value={source.coverage} />
        <SourceFact label="State" value={source.action} />
      </div>
    </Panel>
  );
}

function SourceFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-[var(--bg-base)] p-2">
      <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.05em]">{label}</div>
      <div className="mt-1 line-clamp-2 text-[11px] text-zinc-300">{value}</div>
    </div>
  );
}

function sourceCards({
  health,
  curveHealth,
  signals,
  batterySignals,
  days,
  curveDays,
}: {
  health: DataHealth | null;
  curveHealth: DataHealth | null;
  signals: ExternalSignalPanel[];
  batterySignals: BatterySignalResponse | null;
  days: string[];
  curveDays: string[];
}): SourceCard[] {
  const weather = findSignal(signals, "Weather");
  const ttf = findSignal(signals, "TTF gas");
  const eex = findSignal(signals, "EEX");

  return [
    {
      name: "HEnEx DAM prices",
      status: health && health.priceRows > 0 ? "live" : "missing",
      detail: `${health?.priceRows ?? 0} price rows loaded${lastUpdated(health)}`,
      coverage: dateRangeLabel(health),
      action: health && health.priceRows > 0 ? "Used by Market and Dispatch views" : "Waiting for price data",
    },
    {
      name: "Aggregated DAM curves",
      status: (curveHealth?.curveRows ?? health?.curveRows ?? 0) > 0 ? "cached" : "missing",
      detail: `${curveHealth?.curveRows ?? health?.curveRows ?? 0} curve points loaded${lastUpdated(curveHealth ?? health)}`,
      coverage: curveDays.length > 0 ? curveDays.join(", ") : "No curve days loaded",
      action: curveDays.length > 0 ? "Available in the Market curve view" : "Waiting for curve data",
    },
    signalSource("Open-Meteo weather", weather, "Weather tab and weather-linked dispatch proxies"),
    signalSource("ICE TTF gas", ttf, "Gas tab fuel-cost context"),
    signalSource("EEX Greek power forwards", eex, "Forward context beside market and gas views"),
    {
      name: "Battery signal intervals",
      status: batterySignals ? "live" : "missing",
      detail: batterySignals
        ? `${batterySignals.summary.intervalCount} intervals generated for ${batterySignals.timezone}`
        : "Signal intervals are not loaded",
      coverage: batterySignals
        ? `${batterySignals.range.from} -> ${batterySignals.range.to}`
        : `${days.length} market days available for modelling`,
      action: batterySignals
        ? "Feeds weather, dispatch and rail annotations"
        : "Waiting for signal model output",
    },
  ];
}

function signalSource(name: string, signal: ExternalSignalPanel | undefined, action: string): SourceCard {
  return {
    name,
    status: signal?.status ?? "missing",
    detail: signal ? `${signal.value} · ${signal.detail}` : "No source panel loaded",
    coverage: signal?.status === "missing" ? "No coverage reported" : "Latest source panel",
    action: signal?.status === "missing" ? "Waiting for source data" : action,
  };
}

function findSignal(signals: ExternalSignalPanel[], label: string) {
  return signals.find((signal) => signal.label.toLowerCase().includes(label.toLowerCase()));
}

function lastUpdated(health: DataHealth | null | undefined) {
  return health?.generatedAtUtc ? ` · updated ${formatTimestamp(health.generatedAtUtc)}` : "";
}

function dateRangeLabel(health: DataHealth | null) {
  if (!health?.firstMarketDate || !health.lastMarketDate) {
    return "No market range loaded";
  }
  return `${health.firstMarketDate} -> ${health.lastMarketDate}`;
}

function curveRangeLabel(curveHealth: DataHealth | null, health: DataHealth | null) {
  const source = curveHealth ?? health;
  if (!source?.firstMarketDate || !source.lastMarketDate) {
    return "No curve range loaded";
  }
  return `${source.firstMarketDate} -> ${source.lastMarketDate}`;
}

function formatTimestamp(value: string) {
  return value.replace("T", " ").replace(/\.\d+Z$/, "Z");
}

function statusLabel(status: SourceCard["status"]) {
  if (status === "live") return "Live";
  if (status === "cached") return "Ready";
  return "Missing";
}

function statusTone(status: SourceCard["status"]): Tone {
  if (status === "live") return "green";
  if (status === "cached") return "blue";
  return "red";
}
