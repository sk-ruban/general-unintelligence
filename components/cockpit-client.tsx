"use client";

import { Command } from "cmdk";
import {
  Activity,
  BarChart3,
  BatteryCharging,
  Box,
  CloudSun,
  Database,
  Flame,
  Gauge,
  Layers,
  MapIcon,
  RotateCw,
  Search,
  Zap,
} from "lucide-react";
import { DateTime } from "luxon";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { type ComponentType, type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import { PanelGroup, PanelResizeHandle, Panel as ResizePanel } from "react-resizable-panels";
import { CurveChart } from "@/components/curve-chart";
import { DispatchTable } from "@/components/dispatch-table";
import { PriceChart, priceChartResolution, priceChartSeries } from "@/components/price-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelHeader } from "@/components/ui/panel";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";
import { buildDispatchSchedule, defaultBatteryTwin, summarizeDispatch } from "@/lib/battery-dispatch";
import { loadExternalSignals } from "@/lib/convex-signals";
import { getCurveDataClient } from "@/lib/curve-data/client";
import { formatEuro, formatEurPerMwh, formatMw, formatMwh, formatPercent } from "@/lib/format";
import { getMarketDataClient } from "@/lib/market-data/client";
import type { PortfolioSiteState, PortfolioSummary } from "@/lib/portfolio";
import { buildPortfolioState } from "@/lib/portfolio";
import {
  dayRangeForPriceWindow,
  PRICE_RANGES,
  type PriceRange,
  priceRangeLabel,
  priceRangeResolution,
} from "@/lib/price-range";
import type {
  AggregatedCurvePoint,
  BatteryTwinConfig,
  DamPricePoint,
  DataHealth,
  DispatchAction,
  DispatchPoint,
  ExternalSignalPanel,
} from "@/lib/types";

type View =
  | "control"
  | "portfolio"
  | "market"
  | "curves"
  | "signals"
  | "twin"
  | "model"
  | "scenarios"
  | "health";
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

const nav: {
  id: View;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string;
}[] = [
  { id: "control", label: "Control Room", icon: Gauge },
  { id: "portfolio", label: "Portfolio Map", icon: MapIcon },
  { id: "market", label: "Market Intelligence", icon: Activity },
  { id: "curves", label: "Market Curves", icon: Layers },
  { id: "signals", label: "Weather & Gas", icon: CloudSun },
  { id: "twin", label: "Battery Twin", icon: BatteryCharging },
  { id: "model", label: "Model Lab", icon: Box, badge: "New" },
  { id: "scenarios", label: "Scenario Planner", icon: BarChart3 },
  { id: "health", label: "Data Health", icon: Database },
];

export function CockpitClient() {
  const [view, setView] = useState<View>("control");
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<string[]>([]);
  const [curveDays, setCurveDays] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedMtu, setSelectedMtu] = useState(1);
  const [prices, setPrices] = useState<DamPricePoint[]>([]);
  const [chartPrices, setChartPrices] = useState<DamPricePoint[]>([]);
  const [priceRange, setPriceRange] = useState<PriceRange>("1M");
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
    const latestDay = days.at(-1) ?? "";
    const firstDay = days[0] ?? "";
    if (!latestDay || !firstDay) return;
    let cancelled = false;
    setChartPrices([]);
    async function loadChartRange() {
      const client = await getMarketDataClient();
      const range = dayRangeForPriceWindow(priceRange, latestDay, firstDay);
      const priceSeries = await client.getDamPriceSeries({
        ...range,
        resolution: priceRangeResolution(priceRange),
      });
      if (!cancelled) {
        setChartPrices(priceSeries);
      }
    }
    loadChartRange().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [days, priceRange]);

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
    <main className="h-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      <SidebarProvider
        className="h-full min-h-0"
        style={
          {
            "--sidebar-width": "15rem",
            "--sidebar-width-icon": "3rem",
          } as CSSProperties
        }
      >
        <AppSidebar activeView={view} onViewChange={setView} />
        <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <TopBar selectedDay={selectedDay} days={days} onDayChange={setSelectedDay} />
          <PanelGroup direction="horizontal" className="min-h-0 flex-1">
            <ResizePanel className="min-h-0 overflow-hidden" defaultSize={76} minSize={54}>
              <main className="dense-scrollbar flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4">
                {view === "control" ? (
                  <ControlRoom
                    prices={prices}
                    chartPrices={chartPrices}
                    priceRange={priceRange}
                    onPriceRangeChange={setPriceRange}
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
                    twin={twin}
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
                {view === "market" ? (
                  <MarketIntelligence
                    chartPrices={chartPrices}
                    curves={curves}
                    priceRange={priceRange}
                    prices={prices}
                    selectedDay={selectedDay}
                    onPriceRangeChange={setPriceRange}
                  />
                ) : null}
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
                {view === "signals" ? <SignalsView signals={signals} /> : null}
                {view === "twin" ? <BatteryTwin twin={twin} setTwin={setTwin} summary={summary} /> : null}
                {view === "model" ? <ModelLab twin={twin} summary={summary} dispatch={dispatch} /> : null}
                {view === "scenarios" ? <Scenarios dispatch={dispatch} /> : null}
                {view === "health" ? (
                  <DataHealthView
                    curveDays={curveDays}
                    curveHealth={curveHealth}
                    health={health}
                    signals={signals}
                    days={days}
                  />
                ) : null}
              </main>
            </ResizePanel>
            <PanelResizeHandle className="w-px bg-white/10 transition hover:bg-cyan-300/60 data-[resize-handle-active]:bg-cyan-300/70" />
            <ResizePanel
              className="min-h-0 overflow-hidden transition-[flex-basis] duration-200 ease-out"
              defaultSize={24}
              minSize={22}
              maxSize={32}
              collapsible
              collapsedSize={0}
            >
              <RightRail dispatch={dispatch} summary={summary} signals={signals} twin={twin} />
            </ResizePanel>
          </PanelGroup>
        </section>
        <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} setView={setView} />
      </SidebarProvider>
    </main>
  );
}

function AppSidebar({ activeView, onViewChange }: { activeView: View; onViewChange: (view: View) => void }) {
  return (
    <Sidebar collapsible="icon" className="border-white/10 border-r bg-[var(--bg-panel)]">
      <SidebarHeader className="h-12 justify-center border-white/10 border-b px-4 py-0">
        <div className="flex w-full items-center gap-2 font-semibold text-[13px] tracking-[1px]">
          <Image src="/prometheus-icon.png" alt="" width={20} height={20} className="rounded-sm" />
          <span className="truncate group-data-[collapsible=icon]:hidden">PROMETHEUS</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="p-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {nav.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      className="relative h-8 rounded-none px-8 text-[13px] font-normal text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-100 data-[active=true]:bg-white/[0.03] data-[active=true]:font-normal data-[active=true]:text-zinc-100 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-none group-data-[collapsible=icon]:data-[active=true]:bg-transparent group-data-[collapsible=icon]:hover:bg-white/[0.03] [&>svg]:size-3.5"
                      onClick={() => onViewChange(item.id)}
                    >
                      {active ? (
                        <span className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-[var(--cyan)] group-data-[collapsible=icon]:hidden" />
                      ) : null}
                      <Icon className={active ? "text-[var(--cyan)]" : "opacity-70"} />
                      <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                    </SidebarMenuButton>
                    {item.badge ? (
                      <SidebarMenuBadge className="border border-white/10 text-[9px] uppercase">
                        {item.badge}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-white/10 border-t p-3">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-semibold">
            OM
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-[12px] font-medium">Operator Mode</div>
            <div className="mono truncate text-[11px] text-zinc-500">ID: BESS-GR-01</div>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function TopBar({
  selectedDay,
  days,
  onDayChange,
}: {
  selectedDay: string;
  days: string[];
  onDayChange: (value: string) => void;
}) {
  const formattedDay = selectedDay
    ? DateTime.fromISO(selectedDay, { zone: "Europe/Athens" }).toFormat("dd-LLL-yyyy").toUpperCase()
    : "LOADING";

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-white/10 border-b bg-[var(--bg-base)] px-4">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)] shadow-[0_0_8px_var(--green)]" />
          Live Mode
        </div>
        <div className="mono hidden truncate text-[11px] text-zinc-500 md:block">
          {formattedDay} | Europe/Athens (EET)
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Tag tone="outline">HEnEx DAM Fresh</Tag>
        <Select value={selectedDay} onValueChange={onDayChange} disabled={days.length === 0}>
          <SelectTrigger
            className="mono h-7 w-[144px] shrink-0 rounded border-white/10 bg-[var(--bg-raised)] px-3 text-[12px] text-zinc-100 shadow-none"
            aria-label="Select market day"
          >
            <SelectValue placeholder="Select day" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {days.map((day) => (
                <SelectItem key={day} value={day}>
                  {day}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-7 rounded border-white/10 bg-[var(--bg-raised)] px-2.5 font-normal text-[12px] text-zinc-100 shadow-none hover:bg-white/[0.08] hover:text-zinc-100"
          type="button"
        >
          <RotateCw className="size-3 text-[var(--cyan)]" />
          Sync Model
        </Button>
      </div>
    </header>
  );
}

function ControlRoom({
  prices,
  chartPrices,
  priceRange,
  onPriceRangeChange,
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
      <div className="flex items-start gap-3 rounded border border-cyan-300/20 bg-cyan-300/[0.05] px-4 py-3">
        <Zap className="mt-0.5 h-5 w-5 shrink-0 text-[var(--cyan)]" />
        <div className="text-[14px] leading-6">
          <strong>Recommended Plan:</strong> Charge during low-price surplus windows ({chargeRange}),
          discharge during high-price scarcity windows ({dischargeRange}), and stay idle elsewhere. Projected
          spreads outside these windows do not cover degradation cost and forecast risk.
        </div>
      </div>

      <PortfolioSummaryStrip summary={portfolioSummary} />
      <SignalDeck signals={signals} />

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
          <div className="p-3">
            {priceChartData.length > 0 ? (
              <PriceChart key={priceChartKey(priceRange, priceChartData)} data={priceChartData} height={220} />
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

      <div className="grid gap-2 md:grid-cols-4">
        <Metric label="Latest MCP" value={formatEurPerMwh(latestPrice)} detail="Final HEnEx DAM" />
        <Metric
          label="Low / high"
          value={`${formatEurPerMwh(lowPrice)} · ${formatEurPerMwh(highPrice)}`}
          detail="Selected day"
        />
        <Metric label="Curve depth" value={String(curves.length)} detail="MTU 01 curve points" />
        <Metric label="Signal feeds" value={String(signals.length)} detail="Convex context panels" />
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

function PriceRangeControl({
  value,
  onChange,
}: {
  value: PriceRange;
  onChange: (range: PriceRange) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[10px] font-medium text-zinc-500 uppercase tracking-[0.05em] sm:inline">
        Duration
      </span>
      <div className="flex flex-wrap items-center gap-1">
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
    <div className="grid gap-4">
      <PortfolioSummaryStrip summary={portfolioSummary} />
      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
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
            <thead className="sticky top-0 bg-[var(--bg-panel)] text-zinc-500 uppercase">
              <tr>
                <th className="h-7 px-3">Site</th>
                <th className="h-7 px-3">Region</th>
                <th className="h-7 px-3">Action</th>
                <th className="h-7 px-3">MW</th>
                <th className="h-7 px-3">SoC</th>
                <th className="h-7 px-3">Value</th>
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
                  <td className="h-8 truncate px-3 text-zinc-200">{site.name}</td>
                  <td className="h-8 truncate px-3 text-zinc-500">{site.region}</td>
                  <td className={`h-8 px-3 font-semibold uppercase ${actionTextClass(site.current?.action)}`}>
                    {site.current?.action ?? "idle"}
                  </td>
                  <td className="mono h-8 px-3">{formatMw(site.current?.mw ?? 0)}</td>
                  <td className="mono h-8 px-3">{formatPercent(site.socPercent / 100)}</td>
                  <td className="mono h-8 px-3">{formatEuro(site.summary.valueEur)}</td>
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
    <div className="relative min-h-[520px] overflow-hidden bg-[var(--bg-base)]">
      <svg
        aria-label="Greece portfolio map"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox="0 0 420 520"
      >
        <rect width="420" height="520" fill="#050506" />
        <path
          d="M157 67 195 48 243 57 278 87 268 125 290 156 271 197 286 226 258 267 282 302 268 354 239 363 219 336 191 354 168 328 181 291 153 258 167 223 139 190 154 151 134 116Z"
          fill="#12151b"
          stroke="#67E8F9"
          strokeOpacity="0.34"
          strokeWidth="2"
        />
        <path
          d="M205 364 240 386 235 425 205 455 167 444 145 411 166 377Z"
          fill="#12151b"
          stroke="#67E8F9"
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
          <span className="h-2 w-2 bg-[var(--green)]" /> Charging
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 bg-[var(--amber)]" /> Discharging
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
            label="Current Action"
            value={currentAction.toUpperCase()}
            detail={site.current?.reason ?? "No dispatch"}
          />
          <DetailMetric
            label="Power"
            value={formatMw(site.current?.mw ?? 0)}
            detail={site.current?.interval.athensLabel ?? "n/a"}
          />
          <DetailMetric
            label="State of Charge"
            value={formatPercent(site.socPercent / 100)}
            detail={formatMwh(site.current?.socMwh ?? site.initialSocMwh)}
          />
          <DetailMetric
            label="Day Value"
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
            <div className="h-full bg-[var(--cyan)]" style={{ width: `${site.socPercent}%` }} />
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
  if (action === "charge") return "border-[var(--green)] text-[var(--green)]";
  if (action === "discharge") return "border-[var(--amber)] text-[var(--amber)]";
  return "border-zinc-600 text-zinc-500";
}

function actionTextClass(action: DispatchPoint["action"] | undefined) {
  if (action === "charge") return "text-[var(--green)]";
  if (action === "discharge") return "text-[var(--amber)]";
  return "text-zinc-500";
}

function SignalDeck({ signals }: { signals: ExternalSignalPanel[] }) {
  const weather = findSignal(signals, "Weather");
  const ttf = findSignal(signals, "TTF gas");
  const eex = findSignal(signals, "EEX");
  return (
    <div className="grid gap-2 md:grid-cols-[1fr_1fr_0.8fr]">
      <SignalSpotlight accent="cyan" icon={CloudSun} kicker="Open-Meteo" signal={weather} title="Weather" />
      <SignalSpotlight accent="amber" icon={Flame} kicker="ICE" signal={ttf} title="TTF gas" />
      <SignalSpotlight accent="zinc" icon={Activity} kicker="EEX" signal={eex} title="Forward Context" />
    </div>
  );
}

function SignalsView({ signals }: { signals: ExternalSignalPanel[] }) {
  const weather = findSignal(signals, "Weather");
  const ttf = findSignal(signals, "TTF gas");
  const eex = findSignal(signals, "EEX");
  return (
    <div className="grid gap-4">
      <SignalDeck signals={signals} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Weather Driver" kicker="Open-Meteo Greek 15-minute grid" />
          <div className="grid gap-2 p-3 md:grid-cols-2">
            <Metric
              label="Solar Signal"
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
              label="Thermal Proxy"
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

function MarketIntelligence({
  chartPrices,
  curves,
  priceRange,
  prices,
  selectedDay,
  onPriceRangeChange,
}: {
  chartPrices: DamPricePoint[];
  curves: AggregatedCurvePoint[];
  priceRange: PriceRange;
  prices: DamPricePoint[];
  selectedDay: string;
  onPriceRangeChange: (range: PriceRange) => void;
}) {
  const priceChartData = chartPrices.length > 0 || priceRange !== "1D" ? chartPrices : prices;
  return (
    <div className="grid gap-4">
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
      <Panel>
        <PanelHeader title="Aggregated Buy / Sell Curves" kicker={`${selectedDay} · MTU 01`} />
        <CurveChart data={curves} />
      </Panel>
      <Panel>
        <PanelHeader title="Curve Points" kicker="Sampled from static Parquet/JSON layer" />
        <DataTable curves={curves} />
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
    <div className="grid gap-4">
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
          label="Curve Points"
          value={String(curveStats.totalPoints)}
          detail={`${curveStats.buyPoints} buy · ${curveStats.sellPoints} sell`}
        />
        <Metric
          label="Bid / Offer Volume"
          value={`${formatMwh(curveStats.buyMwh)} · ${formatMwh(curveStats.sellMwh)}`}
          detail="Displayed MTU"
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
        <PanelHeader title="Curve Points" kicker="Recent AggrCurves static layer" />
        <DataTable curves={curves} />
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
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <Panel>
        <PanelHeader title="Battery Twin Specs" kicker="Local deterministic scheduler" />
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
            <div key={key} className="grid gap-1 text-[11px] text-zinc-500">
              <label htmlFor={`twin-${key}`}>{label}</label>
              <div className="flex items-center gap-2">
                <Input
                  id={`twin-${key}`}
                  value={String(twin[key])}
                  type="number"
                  step="0.01"
                  onChange={(event) =>
                    setTwin({
                      ...twin,
                      [key]: Number(event.target.value) || 0,
                    } as BatteryTwinConfig)
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
            label="Asset Config"
            value={`${formatMw(twin.maxDischargeMw)} / ${formatMwh(twin.capacityMwh)}`}
            detail="Power / energy"
          />
          <Metric
            label="Round-trip efficiency"
            value={formatPercent(twin.roundTripEfficiency)}
            detail="Applied symmetrically"
          />
          <Metric label="Expected value" value={formatEuro(summary.valueEur)} detail="Selected DAM day" />
          <Metric label="Discharged" value={formatMwh(summary.dischargeMwh)} detail="Delivered to grid" />
        </div>
      </Panel>
    </div>
  );
}

function ModelLab({
  twin,
  summary,
  dispatch,
}: {
  twin: BatteryTwinConfig;
  summary: ReturnType<typeof summarizeDispatch>;
  dispatch: DispatchPoint[];
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <ModelCard
          name="Quantile Scheduler"
          status="Active"
          score="8.6"
          detail="Fast deterministic optimizer used for the current schedule."
        />
        <ModelCard
          name="Scarcity Ensemble"
          status="Candidate"
          score="7.9"
          detail="Combines weather, fuel, and market depth signals."
        />
        <ModelCard
          name="Risk-Aware LP"
          status="Queued"
          score="7.3"
          detail="Adds explicit SoC and degradation constraints for stress cases."
        />
      </div>
      <Panel>
        <PanelHeader title="Model Validation Snapshot" kicker="Current Prometheus control loop" />
        <div className="grid gap-2 p-3 md:grid-cols-4">
          <Metric label="Schedule value" value={formatEuro(summary.valueEur)} detail="Current model output" />
          <Metric
            label="Twin RTE"
            value={formatPercent(twin.roundTripEfficiency)}
            detail="Constraint input"
          />
          <Metric
            label="Action windows"
            value={String(dispatch.filter((point) => point.action !== "idle").length)}
            detail="Non-idle MTUs"
          />
          <Metric label="Fallback path" value="JSON / DuckDB" detail="Market layer mode" />
        </div>
      </Panel>
    </div>
  );
}

function Scenarios({ dispatch }: { dispatch: DispatchPoint[] }) {
  const base = dispatch.reduce((total, point) => total + point.estimatedValueEur, 0);
  const stress = base * 0.82;
  const upside = base * 1.18;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Metric label="Base case" value={formatEuro(base)} detail="Current DAM replay" />
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
    <div className="grid gap-4">
      <Panel>
        <PanelHeader title="DAM Price Layer" kicker="Convex prices with static curve overlays" />
        <div className="grid gap-2 p-3 md:grid-cols-4">
          <Metric
            label="Mode"
            value={marketModeLabel(health?.mode)}
            detail="Convex primary, static fallback"
          />
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
            value={`${health?.firstMarketDate ?? "n/a"} -> ${health?.lastMarketDate ?? "n/a"}`}
            detail="Available market range"
          />
        </div>
      </Panel>
      <div className="grid gap-2 md:grid-cols-3">
        {signals.map((signal) => (
          <SignalCard key={signal.label} signal={signal} />
        ))}
      </div>
      <ApiCoverage />
    </div>
  );
}

function ApiCoverage() {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <ApiCoverageGroup
        title="Connected"
        tone="green"
        items={[
          "/market/dam/catalog",
          "/market/dam/prices",
          "/market/dam/dashboard",
          "/weather/open-meteo/panel",
          "/fuel/ttf/latest",
          "/market/eex/context/latest",
        ]}
      />
      <ApiCoverageGroup
        title="Partial / Fallback"
        tone="amber"
        items={[
          "/market/dam/curves - visual falls back to local curve sample when Convex rows are empty",
          "/market/dam/files - summarized via health/catalog, not a file browser",
          "/market/dam/results - covered by price/schedule views, no raw result explorer",
          "/fuel/ttf/panel, contracts, intraday, historical - summarized into signal cards only",
          "/weather/open-meteo/latest, current, series, fetches, coverage, runs - summarized into signal cards only",
          "/market/eex/query - no ad hoc query builder yet",
        ]}
      />
      <ApiCoverageGroup
        title="No Frontend Interaction"
        tone="red"
        items={[
          "POST refresh routes for Open-Meteo, ICE TTF, and EEX",
          "Convex userState APIs: list/save battery twins, list/save scenarios, record run",
          "Internal maintenance cleanup job",
        ]}
      />
    </div>
  );
}

function ApiCoverageGroup({ title, tone, items }: { title: string; tone: Tone; items: string[] }) {
  return (
    <Panel>
      <PanelHeader title={`Backend API Coverage: ${title}`} right={<Tag tone={tone}>{title}</Tag>} />
      <div className="flex flex-col">
        {items.map((item) => (
          <div
            key={item}
            className="border-white/10 border-b px-3 py-2 text-[12px] text-zinc-400 last:border-b-0"
          >
            {item}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RightRail({
  dispatch,
  summary,
  signals,
  twin,
}: {
  dispatch: DispatchPoint[];
  summary: ReturnType<typeof summarizeDispatch>;
  signals: ExternalSignalPanel[];
  twin: BatteryTwinConfig;
}) {
  return (
    <aside className="dense-scrollbar flex h-full min-w-[320px] flex-col overflow-y-auto border-white/10 border-l bg-[var(--bg-panel)]">
      <RailSection title="Signal Engine Summary">
        <KvRow label="Charge Attractiveness" value={scoreForAction(dispatch, "charge")} tone="green" />
        <KvRow label="Discharge Scarcity" value={scoreForAction(dispatch, "discharge")} tone="amber" />
        <KvRow label="Flexibility Value Idx" value={`${Math.max(0, summary.valueEur / 100).toFixed(1)} ▲`} />
        <KvRow
          label="Spread Robustness"
          value={summary.valueEur > 0 ? "Medium" : "Low"}
          tone={summary.valueEur > 0 ? "green" : "red"}
        />
      </RailSection>
      <RailSection title="Battery Twin Specs">
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
      <section className="flex flex-1 flex-col border-white/10 border-b">
        <div className="sticky top-0 z-10 flex items-center justify-between border-white/10 border-b bg-[var(--bg-base)] px-4 py-3">
          <div className="mono text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">
            Market Intelligence
          </div>
          <Tag tone="outline">Live</Tag>
        </div>
        <div className="flex flex-col">
          {signals.map((signal) => (
            <MarketSignalRow key={signal.label} signal={signal} />
          ))}
        </div>
      </section>
    </aside>
  );
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

function DetailMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-white/10 bg-[var(--bg-base)] p-3">
      <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.05em]">{label}</div>
      <div className="mono mt-1 truncate text-[16px] font-medium text-zinc-100">{value}</div>
      <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{detail}</div>
    </div>
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

function ModelCard({
  name,
  status,
  score,
  detail,
}: {
  name: string;
  status: string;
  score: string;
  detail: string;
}) {
  return (
    <Panel className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{name}</div>
          <div className="mt-1 text-[12px] text-zinc-500">{detail}</div>
        </div>
        <Tag tone={status === "Active" ? "green" : "outline"}>{status}</Tag>
      </div>
      <div className="mt-4 flex items-end justify-between border-white/10 border-t pt-3">
        <span className="text-[11px] text-zinc-500">Validation Score</span>
        <span className="mono text-[16px] text-[var(--cyan)]">{score}</span>
      </div>
    </Panel>
  );
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
            className="w-[min(560px,calc(100vw-32px))] rounded border border-white/10 bg-[var(--bg-panel)] shadow-2xl"
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
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-[13px] text-zinc-200 aria-selected:bg-white/10"
                    onSelect={() => {
                      setView(item.id);
                      setOpen(false);
                    }}
                  >
                    <Icon className="h-4 w-4 text-[var(--cyan)]" />
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

function marketModeLabel(mode: DataHealth["mode"] | undefined) {
  if (mode === "convex") return "Convex";
  if (mode === "duckdb") return "DuckDB-WASM";
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

function scoreForAction(dispatch: DispatchPoint[], action: DispatchAction) {
  if (dispatch.length === 0) return "0.0 / 10";
  const count = dispatch.filter((point) => point.action === action).length;
  return `${Math.min(9.8, 3 + (count / dispatch.length) * 20).toFixed(1)} / 10`;
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

function statusDotClass(status: ExternalSignalPanel["status"]) {
  if (status === "missing") return "bg-zinc-600";
  if (status === "live") return "bg-[var(--green)]";
  return "bg-[var(--cyan)]";
}
