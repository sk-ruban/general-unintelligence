"use client";

import { AlertCircle, Bot, Database, MessageSquare, Send, ShieldAlert, Sparkles, X, Zap } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatEuro, formatEurPerMwh, formatPercent } from "@/lib/format";
import type { BatterySignalResponse, BatteryTwinConfig, DataHealth, DispatchPoint, ExternalSignalPanel } from "@/lib/types";
import { findSignal } from "./shared";
import type { BacktestArtifact, ModelLabArtifact, OptimizerArtifact } from "./use-cockpit-state";

type CopilotMessage = {
  role: "assistant" | "user";
  content: string;
  source?: "local" | "openai";
  tools?: string[];
};

type CopilotContext = {
  backtest: BacktestArtifact | null;
  batterySignals: BatterySignalResponse | null;
  dispatch: DispatchPoint[];
  health: DataHealth | null;
  model: ModelLabArtifact | null;
  optimizer: OptimizerArtifact | null;
  selectedDay: string;
  signals: ExternalSignalPanel[];
  twin: BatteryTwinConfig;
};

const QUICK_PROMPTS = [
  { label: "Now", prompt: "What should the operator do next?", icon: Zap },
  { label: "Value", prompt: "Where is today's dispatch value coming from?", icon: Sparkles },
  { label: "Risk", prompt: "What risk should I watch before approving this schedule?", icon: ShieldAlert },
  { label: "Limits", prompt: "Which battery constraints are binding or important today?", icon: AlertCircle },
  { label: "Data", prompt: "How confident is the data behind this recommendation?", icon: Database },
];

export function BatteryCopilot(context: CopilotContext) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      role: "assistant",
      content:
        "I can inspect the live cockpit state: Convex data health, model metrics, backtest results, optimizer scenarios, battery constraints, and dispatch actions.",
      tools: ["connect_convex_health", "read_model_lab", "inspect_optimizer"],
    },
  ]);

  async function ask(prompt: string) {
    const clean = prompt.trim();
    if (!clean || asking) return;
    setDraft("");
    setAsking(true);
    setMessages((current) => [...current, { role: "user", content: clean }]);
    const localAnswer = answerForPrompt(clean, context);
    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: clean,
          context: buildCopilotPayload(context),
        }),
      });
      if (!response.ok) {
        throw new Error(`copilot:${response.status}`);
      }
      const payload = await response.json();
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: typeof payload.answer === "string" ? payload.answer : localAnswer.content,
          source: "openai",
          tools: Array.isArray(payload.tools_used) && payload.tools_used.length > 0
            ? payload.tools_used
            : localAnswer.tools,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          ...localAnswer,
          content: `${localAnswer.content}\n\nOpenAI live call unavailable; answered from local cockpit tools.`,
          source: "local",
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <>
      <button
        aria-label="Open Prometheus Copilot"
        className="fixed right-5 bottom-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300 text-black shadow-[0_0_24px_rgba(103,232,249,0.28)] transition hover:scale-105"
        type="button"
        onClick={() => setOpen(true)}
      >
        <Bot className="h-5 w-5" />
      </button>
      {open ? (
        <div className="fixed right-5 bottom-20 z-40 flex h-[min(640px,calc(100vh-112px))] w-[min(420px,calc(100vw-32px))] flex-col border border-white/10 bg-[var(--bg-panel)] shadow-2xl">
          <div className="flex h-12 shrink-0 items-center justify-between border-white/10 border-b px-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded border border-cyan-300/25 bg-cyan-300/[0.08] text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div>
                <div className="text-[13px] font-medium text-zinc-100">Prometheus Copilot</div>
                <div className="text-[10px] text-zinc-500">Live cockpit assistant</div>
              </div>
            </div>
            <button
              aria-label="Close Prometheus Copilot"
              className="flex h-8 w-8 items-center justify-center rounded text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100"
              type="button"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="dense-scrollbar flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((message, index) => (
              <MessageBubble key={`${message.role}-${index}`} message={message} />
            ))}
          </div>
          <div className="shrink-0 border-white/10 border-t p-3">
            <div className="mb-2 grid grid-cols-5 gap-1.5">
              {QUICK_PROMPTS.map(({ label, prompt, icon: Icon }) => (
                <button
                  key={prompt}
                  className="flex h-8 min-w-0 items-center justify-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-2 text-[10px] text-zinc-400 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.06] hover:text-cyan-100 disabled:opacity-50"
                  disabled={asking}
                  title={prompt}
                  type="button"
                  onClick={() => ask(prompt)}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                ask(draft);
              }}
            >
              <input
                className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-3 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-300/40"
                placeholder="Ask about dispatch, model, data, risk..."
                disabled={asking}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Button
                className="h-9 rounded border-cyan-300/20 bg-cyan-300 px-3 text-black hover:bg-cyan-200"
                disabled={asking}
                type="submit"
              >
                {asking ? <MessageSquare className="h-3.5 w-3.5 animate-pulse" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MessageBubble({ message }: { message: CopilotMessage }) {
  const assistant = message.role === "assistant";
  return (
    <div className={`flex ${assistant ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[92%] border p-3 text-[12px] leading-5 ${
          assistant
            ? "border-white/10 bg-black/20 text-zinc-200"
            : "border-cyan-300/25 bg-cyan-300/[0.08] text-cyan-50"
        }`}
      >
        <div className="whitespace-pre-line">{message.content}</div>
      </div>
    </div>
  );
}

function buildCopilotPayload(context: CopilotContext) {
  const topFeatures = Object.entries(context.model?.feature_importance ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([feature, gain]) => ({ feature, gain }));
  const activeDispatch = context.dispatch.filter((point) => point.action !== "idle");
  const charge = context.dispatch.filter((point) => point.action === "charge");
  const discharge = context.dispatch.filter((point) => point.action === "discharge");
  return {
    selected_day: context.selectedDay,
    convex_health: context.health,
    external_signals: context.signals,
    model_lab: context.model
      ? {
          model_id: context.model.model_id,
          feature_set: context.model.feature_set,
          fold_count: context.model.fold_count,
          overall: context.model.overall,
          supporting_context: context.model.supporting_context,
          top_features: topFeatures,
        }
      : null,
    backtest: context.backtest
      ? {
          start_date: context.backtest.start_date,
          end_date: context.backtest.end_date,
          results: context.backtest.results,
        }
      : null,
    optimizer: context.optimizer
      ? {
          asset_slug: context.optimizer.asset_slug,
          market_date: context.optimizer.market_date,
          resolution_minutes: context.optimizer.resolution_minutes,
          base: summarizeScenario(context.optimizer.scenarios.base),
          gas_shock: summarizeScenario(context.optimizer.scenarios.gas_shock),
          heatwave: summarizeScenario(context.optimizer.scenarios.heatwave),
          high_uncertainty: summarizeScenario(context.optimizer.scenarios.high_uncertainty),
        }
      : null,
    twin: context.twin,
    dispatch_summary: {
      active_intervals: activeDispatch.length,
      charge_intervals: charge.length,
      discharge_intervals: discharge.length,
      first_charge_mtu: charge[0]?.interval.mtu ?? null,
      first_discharge_mtu: discharge[0]?.interval.mtu ?? null,
    },
    battery_signal_summary: context.batterySignals?.summary ?? null,
  };
}

function summarizeScenario(scenario: OptimizerArtifact["scenarios"][string] | undefined) {
  if (!scenario) return null;
  return {
    cycle_count: scenario.cycle_count,
    expected_revenue_eur: scenario.expected_revenue_eur,
    degradation_cost_eur: scenario.degradation_cost_eur,
    feasibility_violations: scenario.feasibility_violations,
    solve_status: scenario.solve_status,
    solve_time_ms: scenario.solve_time_ms,
  };
}

function answerForPrompt(prompt: string, context: CopilotContext): CopilotMessage {
  const normalized = prompt.toLowerCase();
  if (normalized.includes("operator") || normalized.includes("next")) {
    return operatorActionAnswer(context);
  }
  if (normalized.includes("limit") || normalized.includes("constraint") || normalized.includes("binding")) {
    return constraintsAnswer(context);
  }
  if (normalized.includes("schedule") || normalized.includes("dispatch") || normalized.includes("charge") || normalized.includes("value")) {
    return scheduleAnswer(context);
  }
  if (normalized.includes("data") || normalized.includes("feature") || normalized.includes("strong")) {
    return dataAnswer(context);
  }
  if (normalized.includes("risk") || normalized.includes("uncertain") || normalized.includes("drawdown")) {
    return riskAnswer(context);
  }
  if (normalized.includes("missing") || normalized.includes("gap") || normalized.includes("weak")) {
    return missingAnswer(context);
  }
  if (normalized.includes("pitch") || normalized.includes("judge") || normalized.includes("summary")) {
    return pitchAnswer(context);
  }
  return {
    role: "assistant",
    content:
      "I can answer from the current cockpit artifacts. Try asking why the schedule charges, what features drive the forecast, how the risk-aware optimizer behaves, or what data gaps remain.",
    tools: ["route_question", "list_available_tools"],
  };
}

function operatorActionAnswer(context: CopilotContext): CopilotMessage {
  const next = context.dispatch.find((point) => point.action !== "idle");
  const base = context.optimizer?.scenarios.base;
  return {
    role: "assistant",
    content: next
      ? [
          `Next operator action: prepare to ${next.action} at MTU ${next.interval.mtu} for ${next.mw.toFixed(1)} MW.`,
          `Reason: ${next.reason}`,
          base ? `Base schedule value is ${formatEuro(base.expected_revenue_eur)} with ${base.feasibility_violations.length} feasibility violations.` : "Optimizer artifact is still loading, so treat this as the visible dispatch-board recommendation.",
        ].join("\n")
      : "No active charge or discharge interval is recommended in the currently loaded dispatch window.",
    tools: ["summarize_dispatch", "inspect_optimizer_scenario", "read_battery_twin"],
  };
}

function scheduleAnswer(context: CopilotContext): CopilotMessage {
  const active = context.dispatch.filter((point) => point.action !== "idle");
  const charge = context.dispatch.filter((point) => point.action === "charge");
  const discharge = context.dispatch.filter((point) => point.action === "discharge");
  const base = context.optimizer?.scenarios.base;
  return {
    role: "assistant",
    content: [
      `For ${context.selectedDay || "the selected day"}, the MILP schedule has ${active.length} active intervals: ${charge.length} charge and ${discharge.length} discharge.`,
      `It honors the twin window from ${context.twin.minSocMwh.toFixed(0)} to ${context.twin.maxSocMwh.toFixed(0)} MWh with ${formatPercent(context.twin.roundTripEfficiency)} RTE.`,
      base ? `Cached base scenario value is ${formatEuro(base.expected_revenue_eur)} with ${base.feasibility_violations.length} feasibility violations.` : "No optimizer artifact is loaded yet, so the UI is falling back to the dispatch rows.",
    ].join("\n"),
    tools: ["inspect_optimizer_scenario", "read_battery_twin", "summarize_dispatch"],
  };
}

function constraintsAnswer(context: CopilotContext): CopilotMessage {
  const base = context.optimizer?.scenarios.base;
  const soc = base?.soc_mwh ?? [];
  const minSoc = soc.length ? Math.min(...soc) : context.twin.minSocMwh;
  const maxSoc = soc.length ? Math.max(...soc) : context.twin.maxSocMwh;
  return {
    role: "assistant",
    content: [
      `Important limits today: SoC window ${context.twin.minSocMwh.toFixed(0)}-${context.twin.maxSocMwh.toFixed(0)} MWh, max charge ${context.twin.maxChargeMw.toFixed(0)} MW, max discharge ${context.twin.maxDischargeMw.toFixed(0)} MW, and ${formatPercent(context.twin.roundTripEfficiency)} RTE.`,
      `The loaded MILP path ranges from about ${minSoc.toFixed(0)} to ${maxSoc.toFixed(0)} MWh.`,
      base ? `Solve status is ${base.solve_status} with ${base.feasibility_violations.length} violations.` : "Optimizer scenario artifact is still pending.",
    ].join("\n"),
    tools: ["read_battery_twin", "inspect_optimizer_scenario", "summarize_dispatch"],
  };
}

function dataAnswer(context: CopilotContext): CopilotMessage {
  const model = context.model;
  const top = Object.entries(model?.feature_importance ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => `${name} (${Math.round(value * 100)}%)`)
    .join(", ");
  return {
    role: "assistant",
    content: [
      `The strongest validated model layer is the walk-forward LightGBM artifact: ${model?.fold_count ?? 0} folds, MAE ${model?.overall?.mae_eur_per_mwh?.toFixed(1) ?? "n/a"} EUR/MWh, RMSE ${model?.overall?.rmse_eur_per_mwh?.toFixed(1) ?? "n/a"} EUR/MWh.`,
      `Feature set: ${model?.feature_set ?? "artifact pending"}.`,
      top ? `Top feature gains: ${top}.` : "Feature importance is still pending.",
      `Convex price rows loaded: ${context.health?.priceRows ?? 0}.`,
    ].join("\n"),
    tools: ["read_model_lab", "rank_feature_importance", "query_convex_health"],
  };
}

function riskAnswer(context: CopilotContext): CopilotMessage {
  const results = context.backtest?.results;
  const risk = results?.risk_adjusted;
  return {
    role: "assistant",
    content: risk
      ? [
          `Balanced mode captures ${formatPercent(results.capture_rate)} of perfect foresight.`,
          `Risk-aware mode captures ${formatPercent(risk.capture_rate)} but reduces max drawdown from ${formatEuro(results.max_drawdown_eur)} to ${formatEuro(risk.max_drawdown_eur)}.`,
          `It uses the p10-p90 forecast width as a conservative MILP penalty and averages ${risk.mean_cycles_per_day.toFixed(2)} cycles/day with ${risk.feasibility_violations} violations.`,
        ].join("\n")
      : "Risk-aware backtest artifact is not loaded yet.",
    tools: ["read_backtest_summary", "compare_risk_modes", "inspect_quantile_band"],
  };
}

function missingAnswer(context: CopilotContext): CopilotMessage {
  const missingSignals = context.signals.filter((signal) => signal.status === "missing").map((signal) => signal.label);
  const caveats = context.batterySignals?.summary.caveats ?? [];
  return {
    role: "assistant",
    content: [
      missingSignals.length ? `Missing live context feeds: ${missingSignals.join(", ")}.` : "Core context feeds are present or cached.",
      caveats.length ? `Signal caveats: ${caveats.slice(0, 2).join(" ")}` : "No battery-signal caveats are loaded.",
      "The honest remaining gap is asset telemetry: cell-level SoH, warranty throughput, PCS efficiency curves, and site SCADA history. The framework handles that by using confidence-rated twin assumptions.",
    ].join("\n"),
    tools: ["query_convex_signals", "scan_signal_caveats", "read_twin_confidence"],
  };
}

function pitchAnswer(context: CopilotContext): CopilotMessage {
  const ttf = findSignal(context.signals, "TTF");
  const weather = findSignal(context.signals, "Weather");
  return {
    role: "assistant",
    content: [
      "Pitch line: We have years of how the Greek market behaves and zero hours of how this specific battery behaves, so Prometheus optimizes around that asymmetry.",
      `Forecast: ${context.model?.overall?.mae_eur_per_mwh?.toFixed(1) ?? "n/a"} EUR/MWh MAE across ${context.model?.fold_count ?? 0} walk-forward folds.`,
      `Optimizer: HiGHS MILP with SoC, no-simultaneous charge/discharge, terminal SoC, cycle cap, and uncertainty-aware mode.`,
      `Context: ${ttf?.value ?? "TTF n/a"} gas and ${weather?.value ?? "weather n/a"} weather are shown as supporting signals, not overclaimed as full-history features.`,
    ].join("\n"),
    tools: ["compose_pitch_summary", "read_model_lab", "inspect_optimizer", "query_convex_context"],
  };
}
