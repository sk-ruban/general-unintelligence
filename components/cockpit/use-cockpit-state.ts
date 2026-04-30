"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BatteryOverrideSaveState,
  BatteryOverrideState,
  ManualOverrideCommand,
} from "@/components/cockpit/control-room";
import type { View } from "@/components/cockpit/types";
import { buildDispatchSchedule, summarizeDispatch } from "@/lib/battery-dispatch";
import {
  type BatteryTwinParameters,
  type BatteryTwinTemplateId,
  buildBatteryTwin,
  evaluateDispatchFeasibility,
} from "@/lib/battery-twin";
import { loadBatterySignalEngine, loadExternalSignals } from "@/lib/convex-signals";
import { getCurveDataClient } from "@/lib/curve-data/client";
import { buildDecisionConfidence } from "@/lib/decision-confidence";
import { getMarketDataClient } from "@/lib/market-data/client";
import { buildPortfolioState } from "@/lib/portfolio";
import { dayRangeForPriceWindow, type PriceRange, priceRangeResolution } from "@/lib/price-range";
import { buildScenarioComparisons } from "@/lib/scenario-comparison";
import type {
  AggregatedCurvePoint,
  BatterySignalResponse,
  BatteryTwinConfig,
  DamPricePoint,
  DataHealth,
  DispatchAction,
  DispatchPoint,
  ExternalSignalPanel,
} from "@/lib/types";
import { summarizeCurves } from "./shared";

const BATTERY_OVERRIDES_STORAGE_KEY = "prometheus:battery-overrides";

export type OptimizerArtifact = {
  asset_slug: string;
  market_date: string;
  resolution_minutes: 15 | 60;
  scenarios: Record<
    string,
    {
      charge_mw: number[];
      discharge_mw: number[];
      soc_mwh: number[];
      cycle_count: number;
      expected_revenue_eur: number;
      degradation_cost_eur: number;
      feasibility_violations: string[];
      solve_status: string;
      solve_time_ms: number;
      input_prices_eur_per_mwh: number[];
    }
  >;
};

export type ModelLabArtifact = {
  model_id: string;
  feature_set: string;
  fold_count: number;
  overall?: Record<string, number>;
  by_year?: Record<string, { mae_eur_per_mwh: number; rows: number }>;
  feature_importance?: Record<string, number>;
};

export type BacktestArtifact = {
  start_date: string | null;
  end_date: string | null;
  results: {
    annualized_eur_per_mw_per_year: Record<string, number>;
    perfect_foresight_eur_per_mw_per_year: Record<string, number>;
    capture_rate: number;
    sharpe: number;
    max_drawdown_eur: number;
    feasibility_violations: number;
  };
};

export function useCockpitState() {
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
  const [curveDisplayDay, setCurveDisplayDay] = useState("");
  const [health, setHealth] = useState<DataHealth | null>(null);
  const [curveHealth, setCurveHealth] = useState<DataHealth | null>(null);
  const [signals, setSignals] = useState<ExternalSignalPanel[]>([]);
  const [batterySignals, setBatterySignals] = useState<BatterySignalResponse | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState("kozani-north");
  const [selectedGridNodeId, setSelectedGridNodeId] = useState("battery-kozani-north");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [batteryOverrides, setBatteryOverrides] = useState<BatteryOverrideState>({});
  const [batteryOverrideSaveState, setBatteryOverrideSaveState] = useState<BatteryOverrideSaveState>({});
  const [selectedTwinId, setSelectedTwinId] = useState<BatteryTwinTemplateId>("metlen-karatzis-thessaly");
  const [twinOverrides, setTwinOverrides] = useState<Partial<BatteryTwinParameters>>({});
  const [optimizerArtifact, setOptimizerArtifact] = useState<OptimizerArtifact | null>(null);
  const [modelLabArtifact, setModelLabArtifact] = useState<ModelLabArtifact | null>(null);
  const [backtestArtifact, setBacktestArtifact] = useState<BacktestArtifact | null>(null);
  const activeBatteryTwin = useMemo(
    () => buildBatteryTwin(selectedTwinId, twinOverrides),
    [selectedTwinId, twinOverrides],
  );
  const twin = activeBatteryTwin.optimizerConfig;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(BATTERY_OVERRIDES_STORAGE_KEY);
      setBatteryOverrides(stored ? JSON.parse(stored) : {});
    } catch {
      setBatteryOverrides({});
    }
  }, []);

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
    const pendingSiteIds = Object.entries(batteryOverrideSaveState)
      .filter(([, status]) => status === "pending")
      .map(([siteId]) => siteId);
    if (pendingSiteIds.length === 0) return;

    const saveTimer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(BATTERY_OVERRIDES_STORAGE_KEY, JSON.stringify(batteryOverrides));
        setBatteryOverrideSaveState((current) => {
          const next = { ...current };
          for (const siteId of pendingSiteIds) {
            if (next[siteId] === "pending") {
              next[siteId] = "saved";
            }
          }
          return next;
        });
      } catch {
        setBatteryOverrideSaveState((current) => {
          const next = { ...current };
          for (const siteId of pendingSiteIds) {
            if (next[siteId] === "pending") {
              next[siteId] = "error";
            }
          }
          return next;
        });
      }
    }, 450);

    return () => window.clearTimeout(saveTimer);
  }, [batteryOverrides, batteryOverrideSaveState]);

  useEffect(() => {
    const savedSiteIds = Object.entries(batteryOverrideSaveState)
      .filter(([, status]) => status === "saved")
      .map(([siteId]) => siteId);
    if (savedSiteIds.length === 0) return;

    const clearTimer = window.setTimeout(() => {
      setBatteryOverrideSaveState((current) => {
        const next = { ...current };
        for (const siteId of savedSiteIds) {
          if (next[siteId] === "saved") {
            next[siteId] = "idle";
          }
        }
        return next;
      });
    }, 1400);

    return () => window.clearTimeout(clearTimer);
  }, [batteryOverrideSaveState]);

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
    async function loadCanonicalSignals() {
      const response = await loadBatterySignalEngine({ date: selectedDay, twin });
      if (!cancelled) {
        setBatterySignals(response);
      }
    }
    loadCanonicalSignals().catch((error) => {
      console.error(error);
      if (!cancelled) {
        setBatterySignals(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedDay, twin]);

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
      let displayDay = selectedDay;
      let curveSlice = await client.getCurveSlice(selectedDay, selectedMtu);
      const fallbackDay = curveDays.at(-1) ?? "";
      if (curveSlice.length === 0 && fallbackDay && fallbackDay !== selectedDay) {
        const fallbackSlice = await client.getCurveSlice(fallbackDay, selectedMtu);
        if (fallbackSlice.length > 0) {
          displayDay = fallbackDay;
          curveSlice = fallbackSlice;
        }
      }
      if (!cancelled) {
        setCurves(curveSlice);
        setCurveDisplayDay(displayDay);
      }
    }
    loadCurveSlice().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [curveDays, selectedDay, selectedMtu]);

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

  useEffect(() => {
    let cancelled = false;
    async function loadArtifacts() {
      const dispatchPath = dispatchArtifactPath(selectedTwinId);
      const [dispatchResult, modelResult, backtestResult] = await Promise.allSettled([
        fetch(dispatchPath).then((response) => (response.ok ? response.json() : null)),
        fetch("/demo_artifacts/model_lab.json").then((response) => (response.ok ? response.json() : null)),
        fetch("/demo_artifacts/backtest_summary.json").then((response) =>
          response.ok ? response.json() : null,
        ),
      ]);
      if (cancelled) return;
      setOptimizerArtifact(dispatchResult.status === "fulfilled" ? dispatchResult.value : null);
      setModelLabArtifact(modelResult.status === "fulfilled" ? modelResult.value : null);
      setBacktestArtifact(backtestResult.status === "fulfilled" ? backtestResult.value : null);
    }
    loadArtifacts().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [selectedTwinId]);

  const heuristicDispatch = useMemo(() => buildDispatchSchedule(prices, twin), [prices, twin]);
  const dispatch = useMemo(
    () => artifactDispatchToRows(optimizerArtifact, prices, twin) ?? heuristicDispatch,
    [optimizerArtifact, prices, twin, heuristicDispatch],
  );
  const summary = useMemo(() => summarizeDispatch(dispatch), [dispatch]);
  const latestPrice = prices.at(-1)?.mcpEurPerMwh ?? null;
  const priceValues = prices.map((point) => point.mcpEurPerMwh);
  const lowPrice = priceValues.length > 0 ? Math.min(...priceValues) : null;
  const highPrice = priceValues.length > 0 ? Math.max(...priceValues) : null;
  const curveStats = useMemo(() => summarizeCurves(curves), [curves]);
  const decisionConfidence = useMemo(
    () =>
      buildDecisionConfidence({
        dispatch,
        prices,
        curves,
        curveStats,
        signals,
        twin,
        health,
      }),
    [dispatch, prices, curves, curveStats, signals, twin, health],
  );
  const feasibilityChecks = useMemo(
    () => evaluateDispatchFeasibility(dispatch, activeBatteryTwin.optimizerConstraints),
    [dispatch, activeBatteryTwin],
  );
  const scenarioComparisons = useMemo(() => buildScenarioComparisons(prices, twin), [prices, twin]);
  const curveDaySet = useMemo(() => new Set(curveDays), [curveDays]);
  const portfolio = useMemo(() => buildPortfolioState(prices), [prices]);
  const selectedGridNode =
    portfolio.grid.nodes.find((node) => node.id === selectedGridNodeId) ??
    portfolio.grid.nodes.find((node) => node.siteId === selectedSiteId) ??
    null;
  const selectedGridSite = selectedGridNode?.siteId
    ? (portfolio.sites.find((site) => site.id === selectedGridNode.siteId) ?? null)
    : null;

  const selectSite = (siteId: string) => {
    setSelectedSiteId(siteId);
    setSelectedGridNodeId(`battery-${siteId}`);
  };

  const selectGridNode = (nodeId: string) => {
    setSelectedGridNodeId(nodeId);
    const node = portfolio.grid.nodes.find((candidate) => candidate.id === nodeId);
    if (node?.siteId) {
      setSelectedSiteId(node.siteId);
    }
  };

  const updateBatteryOverride = useCallback((siteId: string, command: ManualOverrideCommand) => {
    setBatteryOverrides((current) => ({ ...current, [siteId]: command }));
    setBatteryOverrideSaveState((current) => ({ ...current, [siteId]: "pending" }));
  }, []);

  return {
    activeBatteryTwin,
    batteryOverrideSaveState,
    batteryOverrides,
    batterySignals,
    chartPrices,
    curveDaySet,
    curveDisplayDay,
    curveDays,
    curveHealth,
    curves,
    curveStats,
    days,
    decisionConfidence,
    dispatch,
    feasibilityChecks,
    health,
    highPrice,
    latestPrice,
    loading,
    lowPrice,
    backtestArtifact,
    modelLabArtifact,
    optimizerArtifact,
    paletteOpen,
    portfolio,
    priceRange,
    prices,
    scenarioComparisons,
    selectedDay,
    selectedGridNode,
    selectedGridSite,
    selectedMtu,
    selectedTwinId,
    selectGridNode,
    selectSite,
    updateBatteryOverride,
    setPaletteOpen,
    setPriceRange,
    setSelectedMtu,
    setSelectedTwinId,
    setTwinOverrides,
    setView,
    signals,
    summary,
    twin,
    view,
  };
}

function dispatchArtifactPath(selectedTwinId: BatteryTwinTemplateId) {
  const slug = selectedTwinId.replaceAll("-", "_");
  if (slug === "metlen_karatzis_thessaly") {
    return "/demo_artifacts/demo_dispatch.json";
  }
  return `/demo_artifacts/demo_dispatch_${slug}.json`;
}

function artifactDispatchToRows(
  artifact: OptimizerArtifact | null,
  prices: DamPricePoint[],
  twin: BatteryTwinConfig,
): DispatchPoint[] | null {
  const base = artifact?.scenarios.base;
  const marketDate = prices[0]?.interval.marketDate;
  if (!artifact || !base || artifact.market_date !== marketDate || prices.length !== base.charge_mw.length) {
    return null;
  }
  const dt = artifact.resolution_minutes / 60;
  return prices
    .slice()
    .sort((a, b) => a.interval.timestampUtc.localeCompare(b.interval.timestampUtc))
    .map((point, index) => {
      const charge = base.charge_mw[index] ?? 0;
      const discharge = base.discharge_mw[index] ?? 0;
      const action: DispatchAction = discharge > 0.001 ? "discharge" : charge > 0.001 ? "charge" : "idle";
      const mw = action === "charge" ? charge : action === "discharge" ? discharge : 0;
      const mwh = mw * dt;
      const value = point.mcpEurPerMwh * (discharge - charge) * dt;
      return {
        interval: point.interval,
        action,
        mw: Number(mw.toFixed(3)),
        mwh: Number(mwh.toFixed(3)),
        socMwh: Number((base.soc_mwh[index + 1] ?? base.soc_mwh[index] ?? twin.initialSocMwh).toFixed(3)),
        priceEurPerMwh: point.mcpEurPerMwh,
        estimatedValueEur: Number(value.toFixed(2)),
        reason: optimizerReason(action, base.solve_status),
      };
    });
}

function optimizerReason(action: DispatchAction, status: string) {
  if (status !== "optimal") return `MILP status: ${status}`;
  if (action === "charge") {
    return "MILP selected charge while respecting SoC, power, terminal SoC, and cycle constraints.";
  }
  if (action === "discharge") {
    return "MILP selected discharge after degradation and efficiency costs.";
  }
  return "MILP left interval idle because incremental spread did not clear constraints and cost.";
}
