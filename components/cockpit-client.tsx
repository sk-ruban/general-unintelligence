"use client";

import { Command } from "cmdk";
import { Activity, BatteryCharging, Braces, Database, Gauge, RadioTower, Search, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { PanelGroup, PanelResizeHandle, Panel as ResizePanel } from "react-resizable-panels";
import { CurveChart } from "@/components/curve-chart";
import { DispatchTable } from "@/components/dispatch-table";
import { PriceChart } from "@/components/price-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { buildDispatchSchedule, defaultBatteryTwin, summarizeDispatch } from "@/lib/battery-dispatch";
import { loadExternalSignals } from "@/lib/convex-signals";
import { formatEuro, formatEurPerMwh, formatMw, formatMwh, formatPercent } from "@/lib/format";
import { getMarketDataClient } from "@/lib/market-data/client";
import type {
  AggregatedCurvePoint,
  BatteryTwinConfig,
  DamPricePoint,
  DataHealth,
  DispatchPoint,
  ExternalSignalPanel,
} from "@/lib/types";

type View = "control" | "curves" | "twin" | "scenarios" | "health";

const nav: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "control", label: "Control Room", icon: Gauge },
  { id: "curves", label: "Market Curves", icon: Activity },
  { id: "twin", label: "Battery Twin", icon: BatteryCharging },
  { id: "scenarios", label: "Scenarios", icon: Braces },
  { id: "health", label: "Data Health", icon: Database },
];

export function CockpitClient() {
  const [view, setView] = useState<View>("control");
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [prices, setPrices] = useState<DamPricePoint[]>([]);
  const [curves, setCurves] = useState<AggregatedCurvePoint[]>([]);
  const [health, setHealth] = useState<DataHealth | null>(null);
  const [signals, setSignals] = useState<ExternalSignalPanel[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [twin, setTwin] = useState<BatteryTwinConfig>(defaultBatteryTwin);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const client = await getMarketDataClient();
      const [healthResult, marketDays, signalResult] = await Promise.all([
        client.getDataHealth(),
        client.getAvailableMarketDays(),
        loadExternalSignals(),
      ]);
      const latestDay = marketDays.at(-1) ?? "";
      const [priceSeries, curveSlice] = await Promise.all([
        client.getDamPriceSeries({ from: latestDay, to: latestDay }),
        client.getCurveSlice(latestDay, 1),
      ]);
      if (!cancelled) {
        setHealth(healthResult);
        setDays(marketDays);
        setSelectedDay(latestDay);
        setPrices(priceSeries);
        setCurves(curveSlice);
        setSignals(signalResult.panels);
        setLoading(false);
      }
    }
    load().catch((error) => {
      console.error(error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedDay) return;
    let cancelled = false;
    async function loadDay() {
      const client = await getMarketDataClient();
      const [priceSeries, curveSlice] = await Promise.all([
        client.getDamPriceSeries({ from: selectedDay, to: selectedDay }),
        client.getCurveSlice(selectedDay, 1),
      ]);
      if (!cancelled) {
        setPrices(priceSeries);
        setCurves(curveSlice);
      }
    }
    loadDay().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [selectedDay]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dispatch = useMemo(() => buildDispatchSchedule(prices, twin), [prices, twin]);
  const summary = useMemo(() => summarizeDispatch(dispatch), [dispatch]);
  const latestPrice = prices.at(-1)?.mcpEurPerMwh ?? null;
  const priceValues = prices.map((point) => point.mcpEurPerMwh);
  const lowPrice = priceValues.length > 0 ? Math.min(...priceValues) : null;
  const highPrice = priceValues.length > 0 ? Math.max(...priceValues) : null;

  return (
    <main className="h-screen overflow-hidden bg-[#050506] text-zinc-100">
      <div className="flex h-full">
        <aside className="flex w-16 flex-col items-center border-white/10 border-r bg-black/70 py-2">
          <div className="mb-3 flex h-10 w-10 items-center justify-center border border-cyan-300/40 bg-cyan-300/10 text-cyan-200">
            <Zap className="h-5 w-5" />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`flex h-10 w-10 items-center justify-center border text-zinc-400 transition hover:text-zinc-100 ${
                    view === item.id
                      ? "border-cyan-300/50 bg-cyan-300/12 text-cyan-200"
                      : "border-transparent"
                  }`}
                  title={item.label}
                  type="button"
                  onClick={() => setView(item.id)}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
          <Button size="icon" variant="ghost" title="Command palette" onClick={() => setPaletteOpen(true)}>
            <Search className="h-4 w-4" />
          </Button>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <TopBar
            health={health}
            selectedDay={selectedDay}
            days={days}
            onDayChange={setSelectedDay}
            loading={loading}
          />
          <PanelGroup direction="horizontal" className="min-h-0 flex-1">
            <ResizePanel defaultSize={72} minSize={48}>
              <div className="dense-scrollbar h-full overflow-auto p-3">
                {view === "control" ? (
                  <ControlRoom
                    prices={prices}
                    curves={curves}
                    dispatch={dispatch}
                    summary={summary}
                    latestPrice={latestPrice}
                    lowPrice={lowPrice}
                    highPrice={highPrice}
                    signals={signals}
                    loading={loading}
                  />
                ) : null}
                {view === "curves" ? <MarketCurves curves={curves} selectedDay={selectedDay} /> : null}
                {view === "twin" ? <BatteryTwin twin={twin} setTwin={setTwin} summary={summary} /> : null}
                {view === "scenarios" ? <Scenarios dispatch={dispatch} /> : null}
                {view === "health" ? <DataHealthView health={health} signals={signals} days={days} /> : null}
              </div>
            </ResizePanel>
            <PanelResizeHandle className="w-1 bg-white/10 transition hover:bg-cyan-300/50" />
            <ResizePanel defaultSize={28} minSize={22}>
              <RightRail dispatch={dispatch} summary={summary} signals={signals} />
            </ResizePanel>
          </PanelGroup>
        </section>
      </div>
      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} setView={setView} />
    </main>
  );
}

function TopBar({
  health,
  selectedDay,
  days,
  onDayChange,
  loading,
}: {
  health: DataHealth | null;
  selectedDay: string;
  days: string[];
  onDayChange: (value: string) => void;
  loading: boolean;
}) {
  return (
    <header className="flex h-12 items-center justify-between border-white/10 border-b bg-black/80 px-3">
      <div className="min-w-0">
        <div className="truncate font-semibold text-sm uppercase">Battery Intelligence OS</div>
        <div className="truncate text-[11px] text-zinc-500">
          Greek DAM cockpit · Europe/Athens · {health?.mode ?? "loading"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <select
          className="h-8 rounded border border-white/10 bg-zinc-950 px-2 font-mono text-[12px] text-zinc-100"
          value={selectedDay}
          onChange={(event) => onDayChange(event.target.value)}
        >
          {days.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
        <div className="hidden items-center gap-2 border border-white/10 px-2 py-1 text-[11px] text-zinc-400 md:flex">
          <RadioTower className="h-3.5 w-3.5 text-cyan-300" />
          {loading ? "Hydrating" : `${health?.priceRows ?? 0} DAM rows`}
        </div>
      </div>
    </header>
  );
}

function ControlRoom({
  prices,
  curves,
  dispatch,
  summary,
  latestPrice,
  lowPrice,
  highPrice,
  signals,
  loading,
}: {
  prices: DamPricePoint[];
  curves: AggregatedCurvePoint[];
  dispatch: DispatchPoint[];
  summary: ReturnType<typeof summarizeDispatch>;
  latestPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  signals: ExternalSignalPanel[];
  loading: boolean;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 md:grid-cols-4">
        <Metric label="Latest MCP" value={formatEurPerMwh(latestPrice)} detail="Final HEnEx DAM" />
        <Metric
          label="Low / high"
          value={`${formatEurPerMwh(lowPrice)} · ${formatEurPerMwh(highPrice)}`}
          detail="Selected day"
        />
        <Metric label="Dispatch value" value={formatEuro(summary.valueEur)} detail="Deterministic twin v0" />
        <Metric
          label="Throughput"
          value={formatMwh(summary.chargeMwh + summary.dischargeMwh)}
          detail="Charge + discharge"
        />
      </div>
      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <Panel>
          <PanelHeader
            title="DAM MCP Price Series"
            kicker={loading ? "Loading static market layer" : "15-minute MTU"}
          />
          <PriceChart data={prices} />
        </Panel>
        <Panel>
          <PanelHeader title="MTU 01 Curve Depth" kicker={`${curves.length} curve points`} />
          {curves.length > 0 ? (
            <CurveChart data={curves} />
          ) : (
            <EmptyCurveState selectedDay={prices[0]?.interval.marketDate ?? ""} />
          )}
        </Panel>
      </div>
      <Panel>
        <PanelHeader title="Operator Dispatch Schedule" kicker="Charge / discharge / idle recommendation" />
        <DispatchTable data={dispatch} />
      </Panel>
      <div className="grid gap-2 md:grid-cols-3">
        {signals.map((signal) => (
          <SignalCard key={signal.label} signal={signal} />
        ))}
      </div>
    </div>
  );
}

function MarketCurves({ curves, selectedDay }: { curves: AggregatedCurvePoint[]; selectedDay: string }) {
  return (
    <div className="grid gap-3">
      <Panel>
        <PanelHeader title="Aggregated Buy / Sell Curves" kicker={`${selectedDay} · MTU 01`} />
        {curves.length > 0 ? <CurveChart data={curves} /> : <EmptyCurveState selectedDay={selectedDay} />}
      </Panel>
      <Panel>
        <PanelHeader title="Curve Points" kicker="Sampled from static Parquet/JSON layer" />
        <div className="dense-scrollbar max-h-[460px] overflow-auto">
          <table className="w-full table-fixed text-left text-[11px]">
            <thead className="sticky top-0 bg-zinc-950 text-zinc-500 uppercase">
              <tr>
                <th className="h-7 px-2">Side</th>
                <th className="h-7 px-2">Order</th>
                <th className="h-7 px-2">Quantity</th>
                <th className="h-7 px-2">Price</th>
              </tr>
            </thead>
            <tbody>
              {curves.slice(0, 220).map((point) => (
                <tr key={`${point.side}-${point.curveOrder}`} className="border-white/5 border-t">
                  <td className="h-7 px-2 text-zinc-300">{point.side}</td>
                  <td className="h-7 px-2 mono">{point.curveOrder}</td>
                  <td className="h-7 px-2 mono">{formatMwh(point.quantityMwh)}</td>
                  <td className="h-7 px-2 mono">{formatEurPerMwh(point.unitPriceEurPerMwh)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function EmptyCurveState({ selectedDay }: { selectedDay: string }) {
  return (
    <div className="flex h-[290px] items-center justify-center px-6 text-center text-[12px] text-zinc-500">
      AggrCurves are loaded for the recent modelling window only. {selectedDay || "This day"} has price
      history, but no local curve slice.
    </div>
  );
}

function BatteryTwin({
  twin,
  setTwin,
  summary,
}: {
  twin: BatteryTwinConfig;
  setTwin: (value: BatteryTwinConfig) => void;
  summary: ReturnType<typeof summarizeDispatch>;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[420px_1fr]">
      <Panel>
        <PanelHeader title="Battery Twin Config" kicker="Local deterministic scheduler" />
        <div className="grid gap-3 p-3">
          {(
            [
              ["capacityMwh", "Capacity", "MWh"],
              ["maxChargeMw", "Max charge", "MW"],
              ["maxDischargeMw", "Max discharge", "MW"],
              ["roundTripEfficiency", "RTE", "0-1"],
              ["initialSocMwh", "Initial SoC", "MWh"],
              ["degradationCostEurPerMwh", "Degradation", "EUR/MWh"],
            ] satisfies [keyof typeof twin, string, string][]
          ).map(([key, label, suffix]) => (
            <div key={key} className="grid gap-1 text-[11px] text-zinc-400">
              <label htmlFor={`twin-${key}`}>{label}</label>
              <div className="flex items-center gap-2">
                <Input
                  id={`twin-${key}`}
                  value={String(twin[key as keyof typeof twin])}
                  type="number"
                  step="0.01"
                  onChange={(event) =>
                    setTwin({ ...twin, [key]: Number(event.target.value) || 0 } as BatteryTwinConfig)
                  }
                />
                <span className="w-16 text-zinc-600">{suffix}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Twin Output" kicker="Scenario-free v0 dispatch summary" />
        <div className="grid gap-2 p-3 md:grid-cols-2">
          <Metric
            label="Round-trip efficiency"
            value={formatPercent(twin.roundTripEfficiency)}
            detail="Applied symmetrically"
          />
          <Metric
            label="Power limits"
            value={`${formatMw(twin.maxChargeMw)} / ${formatMw(twin.maxDischargeMw)}`}
            detail="Charge / discharge"
          />
          <Metric label="Expected value" value={formatEuro(summary.valueEur)} detail="Selected DAM day" />
          <Metric label="Discharged" value={formatMwh(summary.dischargeMwh)} detail="Delivered to grid" />
        </div>
      </Panel>
    </div>
  );
}

function Scenarios({ dispatch }: { dispatch: DispatchPoint[] }) {
  const stress = dispatch.reduce((total, point) => total + point.estimatedValueEur * 0.82, 0);
  const upside = dispatch.reduce((total, point) => total + point.estimatedValueEur * 1.18, 0);
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Metric
        label="Base case"
        value={formatEuro(dispatch.reduce((total, point) => total + point.estimatedValueEur, 0))}
        detail="Current DAM replay"
      />
      <Metric label="Gas shock" value={formatEuro(upside)} detail="Higher evening scarcity premium" />
      <Metric label="Solar flood" value={formatEuro(stress)} detail="More zero-price compression" />
    </div>
  );
}

function DataHealthView({
  health,
  signals,
  days,
}: {
  health: DataHealth | null;
  signals: ExternalSignalPanel[];
  days: string[];
}) {
  return (
    <div className="grid gap-3">
      <Panel>
        <PanelHeader title="Static DAM Layer" kicker="Generated from local ENEX XLSX" />
        <div className="grid gap-2 p-3 md:grid-cols-4">
          <Metric label="Mode" value={health?.mode ?? "loading"} detail="DuckDB-WASM or JSON fallback" />
          <Metric
            label="Price rows"
            value={String(health?.priceRows ?? 0)}
            detail={`${days.length} market days`}
          />
          <Metric label="Curve rows" value={String(health?.curveRows ?? 0)} detail="Recent curve window" />
          <Metric
            label="Coverage"
            value={`${health?.firstMarketDate ?? "n/a"} → ${health?.lastMarketDate ?? "n/a"}`}
            detail="Manifest range"
          />
        </div>
      </Panel>
      <div className="grid gap-2 md:grid-cols-3">
        {signals.map((signal) => (
          <SignalCard key={signal.label} signal={signal} />
        ))}
      </div>
    </div>
  );
}

function RightRail({
  dispatch,
  summary,
  signals,
}: {
  dispatch: DispatchPoint[];
  summary: ReturnType<typeof summarizeDispatch>;
  signals: ExternalSignalPanel[];
}) {
  const nextActions = dispatch.filter((point) => point.action !== "idle").slice(0, 8);
  return (
    <aside className="dense-scrollbar h-full overflow-auto border-white/10 border-l bg-black/45 p-3">
      <div className="grid gap-3">
        <Panel>
          <PanelHeader title="Action Tape" kicker={formatEuro(summary.valueEur)} />
          <div className="grid gap-1 p-2">
            {nextActions.map((point) => (
              <div
                key={point.interval.timestampUtc}
                className="grid grid-cols-[44px_1fr_auto] gap-2 border-white/5 border-b py-2 text-[11px]"
              >
                <span className="mono text-zinc-500">{String(point.interval.mtu).padStart(2, "0")}</span>
                <span className={point.action === "charge" ? "text-emerald-300" : "text-orange-300"}>
                  {point.action.toUpperCase()}
                </span>
                <span className="mono text-zinc-300">{formatMw(point.mw)}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Signals" kicker="Optional Convex context" />
          <div className="grid gap-2 p-2">
            {signals.map((signal) => (
              <SignalCard key={signal.label} signal={signal} compact />
            ))}
          </div>
        </Panel>
      </div>
    </aside>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Panel className="p-3">
      <div className="text-[10px] text-zinc-500 uppercase">{label}</div>
      <div className="mono mt-1 truncate font-medium text-base text-zinc-100">{value}</div>
      <div className="mt-1 truncate text-[11px] text-zinc-500">{detail}</div>
    </Panel>
  );
}

function SignalCard({ signal, compact = false }: { signal: ExternalSignalPanel; compact?: boolean }) {
  return (
    <div className="border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-zinc-500 uppercase">{signal.label}</span>
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            signal.status === "missing"
              ? "bg-zinc-600"
              : signal.status === "live"
                ? "bg-emerald-300"
                : "bg-cyan-300"
          }`}
        />
      </div>
      <div className="mono mt-1 truncate text-sm text-zinc-100">{signal.value}</div>
      {!compact ? <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{signal.detail}</div> : null}
    </div>
  );
}

function CommandPalette({
  open,
  setOpen,
  setView,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  setView: (view: View) => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <Command
            className="w-[min(560px,calc(100vw-32px))] border border-white/10 bg-zinc-950 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-11 items-center gap-2 border-white/10 border-b px-3">
              <Search className="h-4 w-4 text-zinc-500" />
              <Command.Input
                className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
                placeholder="Jump to view..."
              />
            </div>
            <Command.List className="p-2">
              <Command.Empty className="p-3 text-[12px] text-zinc-500">No command found.</Command.Empty>
              {nav.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.id}
                    className="flex cursor-pointer items-center gap-2 px-2 py-2 text-[13px] text-zinc-200 aria-selected:bg-white/10"
                    onSelect={() => {
                      setView(item.id);
                      setOpen(false);
                    }}
                  >
                    <Icon className="h-4 w-4 text-cyan-300" />
                    {item.label}
                  </Command.Item>
                );
              })}
            </Command.List>
          </Command>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
