"use client";

import { Command } from "cmdk";
import {
  Activity,
  BatteryCharging,
  Braces,
  CloudSun,
  Database,
  Flame,
  Gauge,
  MapIcon,
  RadioTower,
  Search,
  Zap,
} from "lucide-react";
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
import { getCurveDataClient } from "@/lib/curve-data/client";
import { formatEuro, formatEurPerMwh, formatMw, formatMwh, formatPercent } from "@/lib/format";
import { getMarketDataClient } from "@/lib/market-data/client";
import type { PortfolioSiteState, PortfolioSummary } from "@/lib/portfolio";
import { buildPortfolioState } from "@/lib/portfolio";
import type {
  AggregatedCurvePoint,
  BatteryTwinConfig,
  DamPricePoint,
  DataHealth,
  DispatchPoint,
  ExternalSignalPanel,
} from "@/lib/types";

type View = "control" | "portfolio" | "signals" | "curves" | "twin" | "scenarios" | "health";

const nav: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "control", label: "Control Room", icon: Gauge },
  { id: "portfolio", label: "Portfolio Map", icon: MapIcon },
  { id: "signals", label: "Weather & Gas", icon: CloudSun },
  { id: "curves", label: "Market Curves", icon: Activity },
  { id: "twin", label: "Battery Twin", icon: BatteryCharging },
  { id: "scenarios", label: "Scenarios", icon: Braces },
  { id: "health", label: "Data Health", icon: Database },
];

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

export function CockpitClient() {
  const [view, setView] = useState<View>("control");
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<string[]>([]);
  const [curveDays, setCurveDays] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedMtu, setSelectedMtu] = useState(1);
  const [prices, setPrices] = useState<DamPricePoint[]>([]);
  const [curves, setCurves] = useState<AggregatedCurvePoint[]>([]);
  const [health, setHealth] = useState<DataHealth | null>(null);
  const [curveHealth, setCurveHealth] = useState<DataHealth | null>(null);
  const [signals, setSignals] = useState<ExternalSignalPanel[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("kozani-north");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [twin, setTwin] = useState<BatteryTwinConfig>(defaultBatteryTwin);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [marketClient, curveClient] = await Promise.all([getMarketDataClient(), getCurveDataClient()]);
      const [healthResult, curveHealthResult, marketDays, availableCurveDays, signalResult] =
        await Promise.all([
          marketClient.getDataHealth(),
          curveClient.getCurveHealth(),
          marketClient.getAvailableMarketDays(),
          curveClient.getAvailableCurveDays(),
          loadExternalSignals(),
        ]);
      const latestDay = marketDays.at(-1) ?? availableCurveDays.at(-1) ?? "";
      if (!cancelled) {
        setHealth(healthResult);
        setCurveHealth(curveHealthResult);
        setDays(marketDays);
        setCurveDays(availableCurveDays);
        setSelectedDay(latestDay);
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
      const priceSeries = await client.getDamPriceSeries({ from: selectedDay, to: selectedDay });
      if (!cancelled) {
        setPrices(priceSeries);
      }
    }
    loadDay().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [selectedDay]);

  useEffect(() => {
    if (!selectedDay) return;
    let cancelled = false;
    async function loadCurveSlice() {
      const client = await getCurveDataClient();
      const curveSlice = await client.getCurveSlice(selectedDay, selectedMtu);
      if (!cancelled) {
        setCurves(curveSlice);
      }
    }
    loadCurveSlice().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [selectedDay, selectedMtu]);

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
  const curveStats = useMemo(() => summarizeCurves(curves), [curves]);
  const curveDaySet = useMemo(() => new Set(curveDays), [curveDays]);
  const portfolio = useMemo(() => buildPortfolioState(prices), [prices]);
  const selectedSite =
    portfolio.sites.find((site) => site.id === selectedSiteId) ?? portfolio.sites[0] ?? null;

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
                    curveStats={curveStats}
                    selectedMtu={selectedMtu}
                    dispatch={dispatch}
                    summary={summary}
                    latestPrice={latestPrice}
                    lowPrice={lowPrice}
                    highPrice={highPrice}
                    signals={signals}
                    portfolioSummary={portfolio.summary}
                    loading={loading}
                  />
                ) : null}
                {view === "portfolio" ? (
                  <PortfolioView
                    portfolioSummary={portfolio.summary}
                    selectedSite={selectedSite}
                    selectedSiteId={selectedSite?.id ?? selectedSiteId}
                    sites={portfolio.sites}
                    onSelectSite={setSelectedSiteId}
                  />
                ) : null}
                {view === "signals" ? <SignalsView signals={signals} /> : null}
                {view === "curves" ? (
                  <MarketCurves
                    curves={curves}
                    curveStats={curveStats}
                    selectedDay={selectedDay}
                    selectedMtu={selectedMtu}
                    onMtuChange={setSelectedMtu}
                    hasCurveDay={curveDaySet.has(selectedDay)}
                  />
                ) : null}
                {view === "twin" ? <BatteryTwin twin={twin} setTwin={setTwin} summary={summary} /> : null}
                {view === "scenarios" ? <Scenarios dispatch={dispatch} /> : null}
                {view === "health" ? (
                  <DataHealthView
                    health={health}
                    curveHealth={curveHealth}
                    signals={signals}
                    days={days}
                    curveDays={curveDays}
                  />
                ) : null}
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
  curveStats,
  selectedMtu,
  dispatch,
  summary,
  latestPrice,
  lowPrice,
  highPrice,
  signals,
  portfolioSummary,
  loading,
}: {
  prices: DamPricePoint[];
  curves: AggregatedCurvePoint[];
  curveStats: CurveStats;
  selectedMtu: number;
  dispatch: DispatchPoint[];
  summary: ReturnType<typeof summarizeDispatch>;
  latestPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  signals: ExternalSignalPanel[];
  portfolioSummary: PortfolioSummary;
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
      <PortfolioSummaryStrip summary={portfolioSummary} />
      <SignalDeck signals={signals} />
      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <Panel>
          <PanelHeader
            title="DAM MCP Price Series"
            kicker={loading ? "Loading static market layer" : "15-minute MTU"}
          />
          <PriceChart data={prices} />
        </Panel>
        <Panel>
          <PanelHeader
            title={`MTU ${String(selectedMtu).padStart(2, "0")} Curve Depth`}
            kicker={`${curveStats.totalPoints} curve points`}
          />
          {curves.length > 0 ? (
            <CurveChart data={curves} />
          ) : (
            <EmptyCurveState selectedDay={prices[0]?.interval.marketDate ?? ""} selectedMtu={selectedMtu} />
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

function PortfolioSummaryStrip({ summary }: { summary: PortfolioSummary }) {
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <Metric label="Fleet capacity" value={formatMwh(summary.capacityMwh)} detail="Demo Greek portfolio" />
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

function PortfolioView({
  sites,
  selectedSite,
  selectedSiteId,
  portfolioSummary,
  onSelectSite,
}: {
  sites: PortfolioSiteState[];
  selectedSite: PortfolioSiteState | null;
  selectedSiteId: string;
  portfolioSummary: PortfolioSummary;
  onSelectSite: (siteId: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <PortfolioSummaryStrip summary={portfolioSummary} />
      <div className="grid gap-3 xl:grid-cols-[1.45fr_0.95fr]">
        <Panel>
          <PanelHeader title="Greek Battery Portfolio" kicker="Demo BESS sites · current dispatch state" />
          <GreeceBatteryMap selectedSiteId={selectedSiteId} sites={sites} onSelectSite={onSelectSite} />
        </Panel>
        <SiteDetailPanel site={selectedSite} />
      </div>
      <Panel>
        <PanelHeader title="Site Tape" kicker="Fleet state by asset" />
        <div className="dense-scrollbar max-h-[340px] overflow-auto">
          <table className="w-full table-fixed text-left text-[11px]">
            <thead className="sticky top-0 bg-zinc-950 text-zinc-500 uppercase">
              <tr>
                <th className="h-7 px-2">Site</th>
                <th className="h-7 px-2">Region</th>
                <th className="h-7 px-2">Action</th>
                <th className="h-7 px-2">MW</th>
                <th className="h-7 px-2">SoC</th>
                <th className="h-7 px-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr
                  key={site.id}
                  className={`cursor-pointer border-white/5 border-t transition hover:bg-white/[0.04] ${
                    selectedSiteId === site.id ? "bg-cyan-300/[0.06]" : ""
                  }`}
                  onClick={() => onSelectSite(site.id)}
                >
                  <td className="h-8 truncate px-2 text-zinc-200">{site.name}</td>
                  <td className="h-8 truncate px-2 text-zinc-500">{site.region}</td>
                  <td className={`h-8 px-2 font-semibold uppercase ${actionTextClass(site.current?.action)}`}>
                    {site.current?.action ?? "idle"}
                  </td>
                  <td className="h-8 px-2 mono">{formatMw(site.current?.mw ?? 0)}</td>
                  <td className="h-8 px-2 mono">{formatPercent(site.socPercent / 100)}</td>
                  <td className="h-8 px-2 mono">{formatEuro(site.summary.valueEur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function GreeceBatteryMap({
  sites,
  selectedSiteId,
  onSelectSite,
}: {
  sites: PortfolioSiteState[];
  selectedSiteId: string;
  onSelectSite: (siteId: string) => void;
}) {
  return (
    <div className="relative min-h-[520px] overflow-hidden bg-black/30">
      <svg
        aria-label="Greece portfolio map"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 420 520"
      >
        <rect width="420" height="520" fill="#050506" />
        <path
          d="M157 67 195 48 243 57 278 87 268 125 290 156 271 197 286 226 258 267 282 302 268 354 239 363 219 336 191 354 168 328 181 291 153 258 167 223 139 190 154 151 134 116Z"
          fill="#12151b"
          stroke="#2dd4bf"
          strokeOpacity="0.34"
          strokeWidth="2"
        />
        <path
          d="M205 364 240 386 235 425 205 455 167 444 145 411 166 377Z"
          fill="#12151b"
          stroke="#2dd4bf"
          strokeOpacity="0.28"
          strokeWidth="2"
        />
        <path
          d="M292 245 315 262 303 294 278 284Z M317 330 348 346 337 382 303 372Z M118 292 139 305 126 337 102 320Z M315 151 337 167 325 194 300 181Z"
          fill="#101216"
          stroke="#71717a"
          strokeOpacity="0.32"
          strokeWidth="1.5"
        />
        <path
          d="M83 82H337M64 162H356M58 242H362M73 322H347M103 402H317"
          stroke="#ffffff"
          strokeOpacity="0.045"
        />
        <path d="M120 39V474M190 26V489M260 39V474M330 78V438" stroke="#ffffff" strokeOpacity="0.045" />
      </svg>
      <div className="absolute inset-0">
        {sites.map((site) => {
          const position = projectSite(site);
          const selected = selectedSiteId === site.id;
          return (
            <button
              key={site.id}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center outline-none"
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
              title={site.name}
              type="button"
              onClick={() => onSelectSite(site.id)}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center border bg-black/80 shadow-[0_0_24px_rgba(0,0,0,0.7)] transition ${
                  selected ? "scale-110 border-white" : markerClass(site.current?.action)
                }`}
              >
                <span
                  className={`h-3.5 w-3.5 ${site.current?.action === "idle" ? "bg-zinc-500" : "bg-current"}`}
                  style={{ opacity: 0.45 + site.socPercent / 180 }}
                />
              </span>
              <span className="pointer-events-none absolute top-10 hidden min-w-32 border border-white/10 bg-zinc-950/95 px-2 py-1 text-left text-[10px] shadow-xl md:block">
                <span className="block truncate text-zinc-200">{site.name}</span>
                <span className={`block uppercase ${actionTextClass(site.current?.action)}`}>
                  {site.current?.action ?? "idle"} · {formatPercent(site.socPercent / 100)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="absolute right-3 bottom-3 grid gap-1 border border-white/10 bg-black/70 p-2 text-[10px] text-zinc-500 uppercase">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 bg-cyan-300" /> Charging
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 bg-orange-300" /> Discharging
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 bg-zinc-500" /> Idle
        </div>
      </div>
    </div>
  );
}

function SiteDetailPanel({ site }: { site: PortfolioSiteState | null }) {
  if (!site) {
    return (
      <Panel>
        <PanelHeader title="Site Detail" kicker="No site selected" />
        <div className="p-3 text-[12px] text-zinc-500">Portfolio data is loading.</div>
      </Panel>
    );
  }
  const nextAction = site.schedule.find((point) => point.action !== "idle");
  const currentAction = site.current?.action ?? "idle";
  return (
    <Panel>
      <PanelHeader title={site.name} kicker={`${site.region} · ${site.constraint}`} />
      <div className="grid gap-3 p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
          <DetailMetric
            label="Current action"
            value={currentAction.toUpperCase()}
            detail={site.current?.reason ?? "No dispatch"}
          />
          <DetailMetric
            label="Power"
            value={formatMw(site.current?.mw ?? 0)}
            detail={site.current?.interval.athensLabel ?? "n/a"}
          />
          <DetailMetric
            label="State of charge"
            value={formatPercent(site.socPercent / 100)}
            detail={formatMwh(site.current?.socMwh ?? site.initialSocMwh)}
          />
          <DetailMetric
            label="Day value"
            value={formatEuro(site.summary.valueEur)}
            detail="Local deterministic schedule"
          />
        </div>
        <div className="border border-white/10 bg-black/25 p-3">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
            <span>SoC band</span>
            <span className="mono">
              {formatMwh(site.minSocMwh)} / {formatMwh(site.maxSocMwh)}
            </span>
          </div>
          <div className="mt-2 h-2 bg-white/10">
            <div className="h-full bg-cyan-300" style={{ width: `${site.socPercent}%` }} />
          </div>
        </div>
        <div className="grid gap-1 border border-white/10 bg-black/25 p-3 text-[11px]">
          <div className="text-[10px] text-zinc-500 uppercase">Next useful interval</div>
          <div className="mono text-zinc-100">
            {nextAction
              ? `${nextAction.interval.athensLabel} · ${nextAction.action.toUpperCase()}`
              : "No action"}
          </div>
          <div className="text-zinc-500">
            {nextAction?.reason ?? "No non-idle interval in the selected day."}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function projectSite(site: Pick<PortfolioSiteState, "latitude" | "longitude">) {
  const minLon = 19.2;
  const maxLon = 29.8;
  const minLat = 34.3;
  const maxLat = 41.4;
  return {
    x: 12 + ((site.longitude - minLon) / (maxLon - minLon)) * 76,
    y: 8 + ((maxLat - site.latitude) / (maxLat - minLat)) * 84,
  };
}

function markerClass(action: DispatchPoint["action"] | undefined) {
  if (action === "charge") return "border-cyan-300 text-cyan-300";
  if (action === "discharge") return "border-orange-300 text-orange-300";
  return "border-zinc-600 text-zinc-500";
}

function actionTextClass(action: DispatchPoint["action"] | undefined) {
  if (action === "charge") return "text-cyan-300";
  if (action === "discharge") return "text-orange-300";
  return "text-zinc-500";
}

function SignalDeck({ signals }: { signals: ExternalSignalPanel[] }) {
  const weather = findSignal(signals, "Weather");
  const ttf = findSignal(signals, "TTF gas");
  const eex = findSignal(signals, "EEX");
  return (
    <div className="grid gap-2 md:grid-cols-[1fr_1fr_0.8fr]">
      <SignalSpotlight accent="cyan" icon={CloudSun} kicker="Open-Meteo" signal={weather} title="Weather" />
      <SignalSpotlight accent="orange" icon={Flame} kicker="ICE" signal={ttf} title="TTF gas" />
      <SignalSpotlight accent="zinc" icon={Activity} kicker="EEX" signal={eex} title="Forward context" />
    </div>
  );
}

function SignalsView({ signals }: { signals: ExternalSignalPanel[] }) {
  const weather = findSignal(signals, "Weather");
  const ttf = findSignal(signals, "TTF gas");
  const eex = findSignal(signals, "EEX");
  return (
    <div className="grid gap-3">
      <SignalDeck signals={signals} />
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Weather Driver" kicker="Open-Meteo Greek 15-minute grid" />
          <div className="grid gap-2 p-3 md:grid-cols-2">
            <Metric
              label="Solar signal"
              value={weather?.value ?? "Missing"}
              detail={weather?.detail ?? "No cache"}
            />
            <Metric label="Status" value={statusLabel(weather)} detail="Weather cache" />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Gas Driver" kicker="ICE Dutch TTF fuel-cost proxy" />
          <div className="grid gap-2 p-3 md:grid-cols-2">
            <Metric
              label="Thermal proxy"
              value={ttf?.value ?? "Missing"}
              detail={ttf?.detail ?? "No cache"}
            />
            <Metric label="Status" value={statusLabel(ttf)} detail="TTF cache" />
          </div>
        </Panel>
      </div>
      <Panel>
        <PanelHeader title="Signal Tape" kicker="Convex HTTP surfaces" />
        <div className="grid gap-2 p-3 md:grid-cols-3">
          <SignalCard signal={weather ?? missingSignal("Weather")} />
          <SignalCard signal={ttf ?? missingSignal("TTF gas")} />
          <SignalCard signal={eex ?? missingSignal("EEX context")} />
        </div>
      </Panel>
    </div>
  );
}

function MarketCurves({
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
    <div className="grid gap-3">
      <Panel>
        <PanelHeader
          title="Aggregated Buy / Sell Curves"
          kicker={`${selectedDay} · MTU ${String(selectedMtu).padStart(2, "0")}`}
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
          label="Curve points"
          value={String(curveStats.totalPoints)}
          detail={`${curveStats.buyPoints} buy · ${curveStats.sellPoints} sell`}
        />
        <Metric
          label="Bid / offer volume"
          value={`${formatMwh(curveStats.buyMwh)} · ${formatMwh(curveStats.sellMwh)}`}
          detail="Displayed MTU"
        />
        <Metric
          label="Price range"
          value={`${formatEurPerMwh(curveStats.lowPrice)} · ${formatEurPerMwh(curveStats.highPrice)}`}
          detail="Curve stack"
        />
        <Metric
          label="Quantity range"
          value={`${formatMwh(curveStats.lowQuantity)} · ${formatMwh(curveStats.highQuantity)}`}
          detail="Per submitted point"
        />
      </div>
      <Panel>
        <PanelHeader title="Curve Points" kicker="Recent AggrCurves static layer" />
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

function MtuControl({
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
  curveHealth,
  signals,
  days,
  curveDays,
}: {
  health: DataHealth | null;
  curveHealth: DataHealth | null;
  signals: ExternalSignalPanel[];
  days: string[];
  curveDays: string[];
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
          <Metric
            label="Curve rows"
            value={String(curveHealth?.curveRows ?? health?.curveRows ?? 0)}
            detail={`${curveDays.length} curve days`}
          />
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

function DetailMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.035] p-3">
      <div className="text-[10px] text-zinc-500 uppercase">{label}</div>
      <div className="mono mt-1 truncate font-medium text-base text-zinc-100">{value}</div>
      <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{detail}</div>
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
  icon: React.ComponentType<{ className?: string }>;
  accent: "cyan" | "orange" | "zinc";
}) {
  const resolved = signal ?? missingSignal(title);
  const accentClass =
    accent === "cyan"
      ? "border-cyan-300/25 bg-cyan-300/[0.055] text-cyan-200"
      : accent === "orange"
        ? "border-orange-300/25 bg-orange-300/[0.055] text-orange-200"
        : "border-zinc-300/15 bg-white/[0.035] text-zinc-200";
  return (
    <Panel className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] text-zinc-500 uppercase">{kicker}</div>
          <div className="mt-1 font-semibold text-[12px] text-zinc-100 uppercase">{title}</div>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center border ${accentClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mono mt-3 truncate text-lg text-zinc-100">{resolved.value}</div>
      <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{resolved.detail}</div>
    </Panel>
  );
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

function summarizeCurves(curves: AggregatedCurvePoint[]): CurveStats {
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

function minOrNull(values: number[]) {
  return values.length ? Math.min(...values) : null;
}

function maxOrNull(values: number[]) {
  return values.length ? Math.max(...values) : null;
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
