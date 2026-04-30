"use client";

import type { CSSProperties } from "react";
import { PanelGroup, PanelResizeHandle, Panel as ResizePanel } from "react-resizable-panels";
import { BatteryCopilot } from "@/components/cockpit/battery-copilot";
import { AppSidebar, CommandPalette, TopBar } from "@/components/cockpit/cockpit-shell";
import {
  BatteryTwin,
  DataHealthView,
  ModelLab,
  PortfolioView,
  policyOverrides,
  RightRail,
  Scenarios,
} from "@/components/cockpit/cockpit-views";
import { ControlRoom } from "@/components/cockpit/control-room";
import { DispatchPlan } from "@/components/cockpit/dispatch-plan";
import { GasView, MarketIntelligence, WeatherView } from "@/components/cockpit/market-views";
import { useCockpitState } from "@/components/cockpit/use-cockpit-state";
import { SidebarProvider } from "@/components/ui/sidebar";

export function CockpitClient() {
  const {
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
    setPaletteOpen,
    setPriceRange,
    setSelectedMtu,
    setSelectedTwinId,
    setTwinOverrides,
    setView,
    signals,
    summary,
    twin,
    updateBatteryOverride,
    view,
  } = useCockpitState();
  const rightRail =
    view === "dispatch" ? (
      <RightRail
        batterySignals={batterySignals}
        signals={signals}
        twin={twin}
        view={view}
        selectedDay={selectedDay}
      />
    ) : view === "market" || view === "weather" || view === "gas" ? (
      <RightRail batterySignals={batterySignals} signals={signals} twin={twin} view={view} />
    ) : null;
  const showRightRail = rightRail !== null;
  const marketCurveDay = curveDisplayDay || selectedDay;

  return (
    <main className="h-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      <SidebarProvider
        className="h-full min-h-0"
        style={
          {
            "--sidebar-width": "13rem",
            "--sidebar-width-icon": "3rem",
          } as CSSProperties
        }
      >
        <AppSidebar activeView={view} onViewChange={setView} />
        <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <TopBar selectedDay={selectedDay} />
          <PanelGroup direction="horizontal" className="min-h-0 flex-1">
            <ResizePanel
              className="min-h-0 overflow-hidden"
              defaultSize={showRightRail ? 76 : 100}
              minSize={showRightRail ? 54 : 100}
            >
              <main className="dense-scrollbar flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4">
                {view === "control" ? (
                  <ControlRoom
                    overrides={batteryOverrides}
                    overrideSaveState={batteryOverrideSaveState}
                    sites={portfolio.sites}
                    onOverrideChange={updateBatteryOverride}
                  />
                ) : null}
                {view === "dispatch" ? (
                  <DispatchPlan
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
                    batterySignals={batterySignals}
                    decisionConfidence={decisionConfidence}
                    feasibilityChecks={feasibilityChecks}
                    activeBatteryTwin={activeBatteryTwin}
                    health={health}
                    curveHealth={curveHealth}
                    portfolioSummary={portfolio.summary}
                    loading={loading}
                    twin={twin}
                  />
                ) : null}
                {view === "portfolio" ? (
                  <PortfolioView
                    gridFlows={portfolio.grid.flows}
                    gridNodes={portfolio.grid.nodes}
                    selectedNode={selectedGridNode}
                    selectedGridSite={selectedGridSite}
                    selectedNodeId={selectedGridNode?.id ?? null}
                    sites={portfolio.sites}
                    onSelectNode={selectGridNode}
                    onSelectSite={selectSite}
                  />
                ) : null}
                {view === "market" ? (
                  <MarketIntelligence
                    chartPrices={chartPrices}
                    curveStats={curveStats}
                    curves={curves}
                    hasCurveDay={curveDaySet.has(marketCurveDay)}
                    priceRange={priceRange}
                    prices={prices}
                    selectedDay={marketCurveDay}
                    selectedMtu={selectedMtu}
                    onMtuChange={setSelectedMtu}
                    onPriceRangeChange={setPriceRange}
                  />
                ) : null}
                {view === "weather" ? (
                  <WeatherView batterySignals={batterySignals} signals={signals} />
                ) : null}
                {view === "gas" ? <GasView signals={signals} /> : null}
                {view === "twin" ? (
                  <BatteryTwin
                    activeTwin={activeBatteryTwin}
                    selectedTwinId={selectedTwinId}
                    onTemplateChange={(id) => {
                      setSelectedTwinId(id);
                      setTwinOverrides({});
                    }}
                    onParameterChange={(key, value) =>
                      setTwinOverrides((current) => ({ ...current, [key]: value }))
                    }
                    onApplyPolicy={(policy) =>
                      setTwinOverrides((current) => ({ ...current, ...policyOverrides(policy) }))
                    }
                    summary={summary}
                    dispatch={dispatch}
                  />
                ) : null}
                {view === "model" ? (
                  <ModelLab
                    artifact={modelLabArtifact}
                    backtest={backtestArtifact}
                    twin={twin}
                    summary={summary}
                    dispatch={dispatch}
                  />
                ) : null}
                {view === "scenarios" ? (
                  <Scenarios
                    comparisons={scenarioComparisons}
                    optimizerArtifact={optimizerArtifact}
                    dispatch={dispatch}
                  />
                ) : null}
                {view === "health" ? (
                  <DataHealthView
                    curveDays={curveDays}
                    curveHealth={curveHealth}
                    health={health}
                    signals={signals}
                    batterySignals={batterySignals}
                    days={days}
                  />
                ) : null}
              </main>
            </ResizePanel>
            {showRightRail ? (
              <>
                <PanelResizeHandle className="w-px bg-white/10 transition hover:bg-cyan-300/60 data-[resize-handle-active]:bg-cyan-300/70" />
                <ResizePanel
                  className="min-h-0 overflow-hidden transition-[flex-basis] duration-200 ease-out"
                  defaultSize={24}
                  minSize={22}
                  maxSize={32}
                  collapsible
                  collapsedSize={0}
                >
                  {rightRail}
                </ResizePanel>
              </>
            ) : null}
          </PanelGroup>
        </section>
        <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} setView={setView} />
        <BatteryCopilot
          backtest={backtestArtifact}
          batterySignals={batterySignals}
          dispatch={dispatch}
          health={health}
          model={modelLabArtifact}
          optimizer={optimizerArtifact}
          selectedDay={selectedDay}
          signals={signals}
          twin={twin}
        />
      </SidebarProvider>
    </main>
  );
}
