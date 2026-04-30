import { Panel, PanelHeader } from "@/components/ui/panel";
import type { summarizeDispatch } from "@/lib/battery-dispatch";
import { formatEuro, formatEurPerMwh, formatMwh, formatPercent } from "@/lib/format";
import { buildScenarioExecutiveSummary, type ScenarioComparison } from "@/lib/scenario-comparison";
import type { BatteryTwinConfig, DispatchPoint } from "@/lib/types";
import { Metric, Tag, type Tone, toneClass } from "./shared";
import type { BacktestArtifact, ModelLabArtifact, OptimizerArtifact } from "./use-cockpit-state";

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
  const topFeatures = Object.entries(artifact?.feature_importance ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  return (
    <div className="grid gap-4">
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
          score={backtest?.results.risk_adjusted ? `${Math.round(backtest.results.risk_adjusted.capture_rate * 100)}%` : "..."}
          detail="Conservative MILP consumes p10-p90 forecast width as an uncertainty penalty."
        />
      </div>
      <Panel>
        <PanelHeader title="Model Validation Snapshot" kicker={artifact?.model_id ?? "artifact pending"} />
        <div className="grid gap-2 p-3 md:grid-cols-4">
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
          <div className="grid gap-2 p-3">
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
          <PanelHeader title="Supporting Context" kicker="Shown to operators, not claimed as full-history CV features" />
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
              <div className="p-3 text-[12px] text-zinc-500">Supporting context artifact is still building.</div>
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
              value={backtest?.results.risk_adjusted ? formatPercent(backtest.results.risk_adjusted.capture_rate) : "Building"}
              detail="Quantile-penalized MILP"
            />
            <Metric
              label="Risk-Adj Cycles"
              value={backtest?.results.risk_adjusted ? backtest.results.risk_adjusted.mean_cycles_per_day.toFixed(2) : "Building"}
              detail="Mean cycles / day"
            />
          </div>
        </Panel>
      </div>
    </div>
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
      {optimizerArtifact ? <OptimizerScenarioPanel artifact={optimizerArtifact} dispatch={dispatch} /> : null}
      <Panel>
        <PanelHeader
          title="Scenario Check"
          kicker="Deterministic stress tests, each reruns the scheduler"
          right={<Tag tone="outline">Not a forecast</Tag>}
        />
        <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
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
        <div className="grid gap-2 p-3">
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
          title={`MTU ${index + 1}: ${action}`}
        />
      ))}
    </div>
  );
}
