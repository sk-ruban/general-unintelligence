"use client";

import { BarChart3, BrainCircuit, GitCompareArrows, ServerCog, Target, Upload } from "lucide-react";
import { useState } from "react";
import { Panel, PanelHeader } from "@/components/ui/panel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { summarizeDispatch } from "@/lib/battery-dispatch";
import { formatEuro, formatEurPerMwh, formatMwh, formatPercent } from "@/lib/format";
import { formatMarketIntervalWindow } from "@/lib/market-time";
import { buildScenarioExecutiveSummary, type ScenarioComparison } from "@/lib/scenario-comparison";
import type { BatteryTwinConfig, DispatchPoint } from "@/lib/types";
import { Metric, PageActionButton, PageIntro, Tag, type Tone, toneClass } from "./shared";
import type { BacktestArtifact, ModelLabArtifact, OptimizerArtifact } from "./use-cockpit-state";

type ProprietaryModelDraft = {
  modelName: string;
  ownerCompany: string;
  modelType: string;
  endpointRoute: string;
  authMethod: string;
  credentialRef: string;
  inputSchema: string;
  outputFields: string;
  backtestWindow: string;
  validationGoal: string;
  notes: string;
};

const MODEL_TYPES = [
  "Price forecast",
  "Dispatch optimizer",
  "Risk overlay",
  "Hybrid forecast + optimizer",
] as const;

const AUTH_METHODS = ["API key ref", "OAuth client", "mTLS", "Private network", "Signed upload"] as const;

const VALIDATION_GOALS = [
  "Revenue capture vs incumbent",
  "Forecast error reduction",
  "Risk-adjusted dispatch",
  "Constraint feasibility",
] as const;

const DEFAULT_IMPORT_MODEL_DRAFT: ProprietaryModelDraft = {
  modelName: "Proprietary DAM optimizer",
  ownerCompany: "Trading analytics",
  modelType: "Hybrid forecast + optimizer",
  endpointRoute: "https://models.company.example/v1/dam-dispatch or s3://model-imports/dam/",
  authMethod: "API key ref",
  credentialRef: "vault://energy-models/dam-optimizer-prod",
  inputSchema:
    "DAM prices, 96 MTU index, battery constraints, SoC limits, forecast quantiles, weather/fuel context.",
  outputFields:
    "charge_mw, discharge_mw, expected_revenue_eur, soc_percent, p10_price, p50_price, p90_price.",
  backtestWindow: "2024-12-17 -> 2026-04-30",
  validationGoal: "Revenue capture vs incumbent",
  notes: "Run shadow validation first. Do not promote until feasibility violations are zero.",
};

export function ModelLab({
  artifact,
  backtest,
  twin,
  summary,
  dispatch,
}: {
  artifact: ModelLabArtifact | null;
  backtest: BacktestArtifact | null;
  twin: BatteryTwinConfig;
  summary: ReturnType<typeof summarizeDispatch>;
  dispatch: DispatchPoint[];
}) {
  const [importModelOpen, setImportModelOpen] = useState(false);
  const [importDraft, setImportDraft] = useState<ProprietaryModelDraft>(DEFAULT_IMPORT_MODEL_DRAFT);
  const topFeatures = Object.entries(artifact?.feature_importance ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  function updateImportDraft<Key extends keyof ProprietaryModelDraft>(
    key: Key,
    value: ProprietaryModelDraft[Key],
  ) {
    setImportDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="grid gap-4">
      <PageIntro
        kicker="Model Lab"
        title="Forecast And Optimizer Validation"
        description="Validates the forecast and optimizer artifacts, showing revenue capture, error bands, feature drivers, and the evidence behind the schedule."
        actions={
          <>
            <PageActionButton onClick={() => setImportModelOpen(true)}>
              <Upload className="size-3.5" />
              Import model
            </PageActionButton>
            <PageActionButton onClick={() => scrollToCockpitSection("model-validation")}>
              <BrainCircuit className="size-3.5" />
              Validation
            </PageActionButton>
            <PageActionButton onClick={() => scrollToCockpitSection("model-features")}>
              <BarChart3 className="size-3.5" />
              Features
            </PageActionButton>
            <Tag tone={artifact ? "green" : "amber"}>{artifact ? "Artifact ready" : "Building"}</Tag>
          </>
        }
      />
      <ImportModelSheet
        draft={importDraft}
        open={importModelOpen}
        onDraftChange={updateImportDraft}
        onOpenChange={setImportModelOpen}
      />
      <div className="grid gap-3 md:grid-cols-4">
        <ModelCard
          name="LightGBM Quantile"
          status={artifact ? "Walk-forward" : "Building"}
          score={artifact?.overall?.mae_eur_per_mwh?.toFixed(1) ?? "..."}
          detail={
            artifact ? `${artifact.fold_count} folds across DAM regime history.` : "Model artifact pending."
          }
        />
        <ModelCard
          name="MILP Dispatch"
          status="Active"
          score={String(dispatch.filter((point) => point.action !== "idle").length)}
          detail="HiGHS MILP with SoC, terminal SoC, power, cycle, and no-simultaneous constraints."
        />
        <ModelCard
          name="Backtest Capture"
          status={backtest ? "Cached" : "Building"}
          score={backtest ? `${Math.round(backtest.results.capture_rate * 100)}%` : "..."}
          detail={
            backtest
              ? `${backtest.start_date} -> ${backtest.end_date}`
              : "Forecast/perfect-foresight artifact pending."
          }
        />
        <ModelCard
          name="Risk-Aware Capture"
          status={backtest?.results.risk_adjusted ? "Quantile" : "Building"}
          score={
            backtest?.results.risk_adjusted
              ? `${Math.round(backtest.results.risk_adjusted.capture_rate * 100)}%`
              : "..."
          }
          detail="Conservative MILP consumes p10-p90 forecast width as an uncertainty penalty."
        />
      </div>
      <Panel>
        <PanelHeader title="Model Validation Snapshot" kicker={artifact?.model_id ?? "artifact pending"} />
        <div id="model-validation" className="grid scroll-mt-4 gap-2 p-3 md:grid-cols-4">
          <Metric label="Schedule value" value={formatEuro(summary.valueEur)} detail="Current model output" />
          <Metric
            label="Twin RTE"
            value={formatPercent(twin.roundTripEfficiency)}
            detail="Constraint input"
          />
          <Metric
            label="Forecast RMSE"
            value={
              artifact?.overall?.rmse_eur_per_mwh
                ? formatEurPerMwh(artifact.overall.rmse_eur_per_mwh)
                : "Building"
            }
            detail="Walk-forward mean"
          />
          <Metric
            label="Quantile coverage"
            value={
              artifact?.overall?.p10_p90_coverage
                ? formatPercent(artifact.overall.p10_p90_coverage)
                : "Building"
            }
            detail="p10-p90 realized hit rate"
          />
        </div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Top Features" kicker={artifact?.feature_set ?? "No artifact yet"} />
          <div id="model-features" className="grid scroll-mt-4 gap-2 p-3">
            {topFeatures.length > 0 ? (
              topFeatures.map(([name, weight]) => (
                <div key={name} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-[11px]">
                  <span className="truncate text-zinc-400">{name}</span>
                  <div className="h-2 bg-white/10">
                    <div
                      className="h-full bg-[var(--cyan)]"
                      style={{ width: `${Math.max(4, weight * 100)}%` }}
                    />
                  </div>
                  <span className="mono text-right text-zinc-500">{Math.round(weight * 100)}%</span>
                </div>
              ))
            ) : (
              <div className="p-3 text-[12px] text-zinc-500">Forecast artifact is still building.</div>
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title="Supporting Context"
            kicker="Shown to operators, not claimed as full-history CV features"
          />
          <div className="grid gap-2 p-3">
            {(artifact?.supporting_context ?? []).length > 0 ? (
              artifact?.supporting_context?.map((context) => (
                <div key={context.name} className="border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12px] font-medium text-zinc-100">{context.name}</div>
                    <Tag tone="amber">Context</Tag>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-400">{context.role}</div>
                  <div className="mt-2 text-[10px] text-zinc-500">{context.history}</div>
                </div>
              ))
            ) : (
              <div className="p-3 text-[12px] text-zinc-500">
                Supporting context artifact is still building.
              </div>
            )}
          </div>
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Backtest Headline" kicker="Forecast-driven vs perfect foresight" />
          <div className="grid gap-2 p-3 md:grid-cols-2">
            <Metric
              label="Capture Rate"
              value={backtest ? formatPercent(backtest.results.capture_rate) : "Building"}
              detail="Realized / perfect"
            />
            <Metric
              label="Sharpe"
              value={backtest ? backtest.results.sharpe.toFixed(2) : "Building"}
              detail="Daily P&L annualized"
            />
            <Metric
              label="Max Drawdown"
              value={backtest ? formatEuro(backtest.results.max_drawdown_eur) : "Building"}
              detail="Forecast-driven path"
            />
            <Metric
              label="Violations"
              value={backtest ? String(backtest.results.feasibility_violations) : "Building"}
              detail="Should stay zero"
            />
            <Metric
              label="Risk-Adj Capture"
              value={
                backtest?.results.risk_adjusted
                  ? formatPercent(backtest.results.risk_adjusted.capture_rate)
                  : "Building"
              }
              detail="Quantile-penalized MILP"
            />
            <Metric
              label="Risk-Adj Cycles"
              value={
                backtest?.results.risk_adjusted
                  ? backtest.results.risk_adjusted.mean_cycles_per_day.toFixed(2)
                  : "Building"
              }
              detail="Mean cycles / day"
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ImportModelSheet({
  draft,
  onDraftChange,
  onOpenChange,
  open,
}: {
  draft: ProprietaryModelDraft;
  onDraftChange: <Key extends keyof ProprietaryModelDraft>(
    key: Key,
    value: ProprietaryModelDraft[Key],
  ) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full gap-0 border-white/10 bg-[var(--bg-panel)] text-zinc-100 sm:max-w-3xl"
        showCloseButton
      >
        <SheetHeader className="border-b border-white/10 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="text-zinc-50">Import proprietary model</SheetTitle>
              <SheetDescription className="mt-1 text-[12px] leading-5 text-zinc-500">
                Register a company model for local shadow testing against cockpit backtests and optimizer
                validation.
              </SheetDescription>
            </div>
            <Tag tone="outline">Local draft</Tag>
          </div>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4">
          <div className="grid gap-3 rounded-md border border-cyan-300/20 bg-cyan-300/[0.04] p-3 md:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[12px] font-medium text-cyan-100">
                <ServerCog className="size-3.5" />
                Shadow validation profile
              </div>
              <div className="mt-1 text-[11px] leading-4 text-zinc-500">
                The imported model is treated as a test artifact until its outputs match the 96-MTU dispatch
                contract and clear feasibility checks.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-500 md:w-56">
              <ModelImportFact label="Mode" value="Test only" />
              <ModelImportFact label="Backend" value="Not wired" />
            </div>
          </div>

          <div className="grid gap-3 border border-white/10 bg-[var(--bg-base)] p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <ImportField
                label="Model name"
                value={draft.modelName}
                onChange={(value) => onDraftChange("modelName", value)}
              />
              <ImportField
                label="Owner / company"
                value={draft.ownerCompany}
                onChange={(value) => onDraftChange("ownerCompany", value)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <ImportSelect
                label="Model type"
                options={MODEL_TYPES}
                value={draft.modelType}
                onChange={(value) => onDraftChange("modelType", value)}
              />
              <ImportField
                label="Endpoint or upload route"
                value={draft.endpointRoute}
                onChange={(value) => onDraftChange("endpointRoute", value)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <ImportSelect
                label="Auth method"
                options={AUTH_METHODS}
                value={draft.authMethod}
                onChange={(value) => onDraftChange("authMethod", value)}
              />
              <ImportField
                label="Credential reference"
                value={draft.credentialRef}
                onChange={(value) => onDraftChange("credentialRef", value)}
              />
            </div>

            <ImportTextArea
              label="Input schema expectations"
              value={draft.inputSchema}
              onChange={(value) => onDraftChange("inputSchema", value)}
            />
            <ImportTextArea
              label="Output fields"
              value={draft.outputFields}
              onChange={(value) => onDraftChange("outputFields", value)}
            />

            <div className="grid gap-3 md:grid-cols-2">
              <ImportField
                label="Backtest window"
                value={draft.backtestWindow}
                onChange={(value) => onDraftChange("backtestWindow", value)}
              />
              <ImportSelect
                label="Validation goal"
                options={VALIDATION_GOALS}
                value={draft.validationGoal}
                onChange={(value) => onDraftChange("validationGoal", value)}
              />
            </div>

            <ImportTextArea
              label="Notes"
              value={draft.notes}
              onChange={(value) => onDraftChange("notes", value)}
            />
          </div>
        </div>
        <SheetFooter className="border-t border-white/10 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 px-3 text-[12px] font-medium text-zinc-300 hover:bg-white/[0.04]"
              type="button"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 text-[12px] font-medium text-cyan-100 hover:bg-cyan-300/15"
              type="button"
              onClick={() => onOpenChange(false)}
            >
              <Upload className="size-3.5" />
              Save import draft
            </button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ModelImportFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-black/20 p-2">
      <div className="text-[9px] font-medium text-zinc-500 uppercase tracking-[0.08em]">{label}</div>
      <div className="mt-1 truncate text-[11px] text-zinc-200">{value}</div>
    </div>
  );
}

function ImportField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.08em]">{label}</span>
      <input
        className="h-8 border border-white/10 bg-black/20 px-2 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-300/40"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function ImportSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.08em]">{label}</span>
      <select
        className="h-8 border border-white/10 bg-black/20 px-2 text-[12px] text-zinc-100 outline-none focus:border-cyan-300/40"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ImportTextArea({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.08em]">{label}</span>
      <textarea
        className="min-h-20 resize-y border border-white/10 bg-black/20 px-2 py-2 text-[12px] leading-5 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-300/40"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
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

export function Scenarios({
  comparisons,
  optimizerArtifact,
  dispatch,
}: {
  comparisons: ScenarioComparison[];
  optimizerArtifact: OptimizerArtifact | null;
  dispatch: DispatchPoint[];
}) {
  const summaries = buildScenarioExecutiveSummary(comparisons);
  return (
    <div className="grid gap-4">
      <PageIntro
        kicker="Scenario Planner"
        title="Stress-Test Dispatch Outcomes"
        description="Compares stress-test reruns for gas shocks, heatwaves, and uncertainty so operators can see value, feasibility, cycles, and confidence before committing."
        actions={
          <>
            <PageActionButton onClick={() => scrollToCockpitSection("scenario-check")}>
              <GitCompareArrows className="size-3.5" />
              Compare cases
            </PageActionButton>
            <PageActionButton onClick={() => scrollToCockpitSection("scenario-summary")}>
              <Target className="size-3.5" />
              Summary
            </PageActionButton>
            <Tag tone="outline">{comparisons.length} scenarios</Tag>
          </>
        }
      />
      {optimizerArtifact ? <OptimizerScenarioPanel artifact={optimizerArtifact} dispatch={dispatch} /> : null}
      <Panel>
        <PanelHeader
          title="Scenario Check"
          kicker="Deterministic stress tests, each reruns the scheduler"
          right={<Tag tone="outline">Not a forecast</Tag>}
        />
        <div id="scenario-check" className="grid scroll-mt-4 gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
          {comparisons.map((comparison) => (
            <ScenarioCard key={comparison.id} comparison={comparison} />
          ))}
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Scenario Timelines" kicker="Charge / discharge / idle blocks by scenario" />
        <div className="grid gap-3 p-3">
          {comparisons.map((comparison) => (
            <div key={comparison.id} className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12px] font-medium text-zinc-200">{comparison.label}</div>
                <div className="mono text-[11px] text-zinc-500">
                  {comparison.summary.chargeWindow} / {comparison.summary.dischargeWindow}
                </div>
              </div>
              <ActionTimeline dispatch={comparison.dispatch} />
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Executive Summary" kicker="Generated from scenario outputs" />
        <div id="scenario-summary" className="grid scroll-mt-4 gap-2 p-3">
          {summaries.map((line) => (
            <div
              key={line}
              className="border border-white/10 bg-black/20 p-3 text-[12px] leading-5 text-zinc-300"
            >
              {line}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function scrollToCockpitSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function OptimizerScenarioPanel({
  artifact,
  dispatch,
}: {
  artifact: OptimizerArtifact;
  dispatch: DispatchPoint[];
}) {
  const base =
    artifact.scenarios.base?.expected_revenue_eur ??
    dispatch.reduce((total, point) => total + point.estimatedValueEur, 0);
  const rows = [
    ["Base case", artifact.scenarios.base, "Current forecast and balanced risk mode"],
    ["Gas shock", artifact.scenarios.gas_shock, "Thermal-marginal scarcity premium"],
    ["Heatwave", artifact.scenarios.heatwave, "Power derate, lower RTE, higher auxiliary load"],
    ["High uncertainty", artifact.scenarios.high_uncertainty, "Conservative risk mode with wider sigma"],
  ] as const;
  return (
    <Panel>
      <PanelHeader title="MILP Scenario Feasibility" kicker="Cached optimization artifacts from origin" />
      <div className="grid gap-3 p-3 md:grid-cols-4">
        {rows.map(([label, scenario, detail]) => (
          <Metric
            key={label}
            label={label}
            value={scenario ? formatEuro(scenario.expected_revenue_eur) : "Building"}
            detail={
              scenario ? `${formatScenarioDelta(scenario.expected_revenue_eur, base)} · ${detail}` : detail
            }
          />
        ))}
      </div>
    </Panel>
  );
}

function formatScenarioDelta(value: number, base: number) {
  if (!Number.isFinite(base) || Math.abs(base) < 1) return "base";
  const delta = (value - base) / Math.abs(base);
  return `${delta >= 0 ? "+" : ""}${Math.round(delta * 100)}%`;
}

function ScenarioCard({ comparison }: { comparison: ScenarioComparison }) {
  const delta = comparison.summary.valueDeltaEur;
  return (
    <div className="border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-medium text-zinc-100">{comparison.label}</div>
          <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{comparison.description}</div>
        </div>
        <Tag
          tone={
            comparison.feasibilityStatus === "pass"
              ? "green"
              : comparison.feasibilityStatus === "review"
                ? "amber"
                : "red"
          }
        >
          {comparison.feasibilityStatus}
        </Tag>
      </div>
      <div className="mt-4 grid gap-2">
        <KvRow label="Expected value" value={formatEuro(comparison.summary.valueEur)} tone="cyan" />
        <KvRow
          label="Delta vs base"
          value={`${delta >= 0 ? "+" : ""}${formatEuro(delta)}`}
          tone={delta >= 0 ? "green" : "red"}
        />
        <KvRow label="Cycles" value={`${comparison.summary.equivalentCycles.toFixed(2)} / day`} />
        <KvRow label="Throughput" value={formatMwh(comparison.summary.throughputMwh)} />
      </div>
    </div>
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
          title={`${dispatch[index]?.interval ? formatMarketIntervalWindow(dispatch[index].interval) : `MTU ${index + 1}`}: ${action}`}
        />
      ))}
    </div>
  );
}
