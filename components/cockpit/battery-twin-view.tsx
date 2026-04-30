import { Plus, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Panel, PanelHeader } from "@/components/ui/panel";
import type { summarizeDispatch } from "@/lib/battery-dispatch";
import {
  BATTERY_TWIN_TEMPLATES,
  type BatteryTwin as BatteryTwinModel,
  type BatteryTwinParameters,
  type BatteryTwinTemplateId,
  evaluateDispatchFeasibility,
  getMissingSpecs,
} from "@/lib/battery-twin";
import { formatEuro, formatMw, formatMwh, formatPercent } from "@/lib/format";
import type { DispatchPoint } from "@/lib/types";
import { DetailMetric, PageActionButton, PageIntro, Tag, type Tone } from "./shared";

function FeasibilityChecklist({ checks }: { checks: ReturnType<typeof evaluateDispatchFeasibility> }) {
  return (
    <Panel>
      <PanelHeader
        title="Dispatch Feasibility Checks"
        kicker="Why this is here: verifies the schedule can physically run on the selected battery before it is trusted."
        right={<Tag tone={checks.every((check) => check.status === "pass") ? "green" : "amber"}>Twin</Tag>}
      />
      <div className="border-white/10 border-b px-3 py-2 text-[11px] leading-4 text-zinc-500">
        These checks compare the current dispatch plan against SoC, power, cycle, reserve, and auxiliary-load
        limits. They keep the optimizer from showing a profitable schedule that violates the asset template.
      </div>
      <div className="grid gap-2 p-3 md:grid-cols-2">
        {checks.slice(0, 8).map((check) => (
          <div key={check.id} className="border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-[12px] font-medium text-zinc-200">{check.label}</div>
              <Tag tone={check.status === "pass" ? "green" : check.status === "review" ? "amber" : "red"}>
                {check.status}
              </Tag>
            </div>
            <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-500">{check.detail}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function BatteryTwin({
  activeTwin,
  selectedTwinId,
  onTemplateChange,
  onParameterChange,
  onApplyPolicy,
  summary,
  dispatch,
}: {
  activeTwin: BatteryTwinModel;
  selectedTwinId: BatteryTwinTemplateId;
  onTemplateChange: (id: BatteryTwinTemplateId) => void;
  onParameterChange: <K extends keyof BatteryTwinParameters>(key: K, value: BatteryTwinParameters[K]) => void;
  onApplyPolicy: (policy: "conservative" | "balanced" | "aggressive") => void;
  summary: ReturnType<typeof summarizeDispatch>;
  dispatch: DispatchPoint[];
}) {
  const { capacityStack, optimizerConstraints, parameters, profile } = activeTwin;
  const missingSpecs = getMissingSpecs(activeTwin);
  const feasibilityChecks = evaluateDispatchFeasibility(dispatch, optimizerConstraints);
  return (
    <div className="grid gap-4">
      <PageIntro
        kicker="Battery Assets"
        title="Asset Constraint Builder"
        description="Defines the selected battery template, SoC corridor, power limits, and open supplier specs that constrain every optimization result."
        actions={
          <>
            <PageActionButton onClick={() => onTemplateChange("custom")}>
              <Plus className="size-3.5" />
              Add template
            </PageActionButton>
            <Tag tone="cyan">
              <Zap className="mr-1 size-3" />
              {formatMw(optimizerConstraints.maxDischargeMw)}
            </Tag>
          </>
        }
      />
      <Panel>
        <PanelHeader title="Battery Assets Builder" kicker="Operator asset templates" />
        <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-5">
          {BATTERY_TWIN_TEMPLATES.map((template) => (
            <button
              key={template.profile.id}
              className={`border p-3 text-left ${
                selectedTwinId === template.profile.id
                  ? "border-cyan-300/60 bg-cyan-300/[0.08]"
                  : "border-white/10 bg-black/20 hover:bg-white/[0.04]"
              }`}
              type="button"
              onClick={() => onTemplateChange(template.profile.id)}
            >
              <div className="truncate text-[12px] font-medium text-zinc-100">{template.profile.name}</div>
              <div className="mono mt-1 text-[11px] text-zinc-500">
                {formatMw(template.parameters.ratedPowerMwAc)} /{" "}
                {formatMwh(template.parameters.contractedUsableEnergyMwh)}
              </div>
              <div className="mt-1 truncate text-[10px] text-zinc-500">
                {template.profile.chemistry} · {template.profile.cooling} cooling
              </div>
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_390px]">
        <div className="grid gap-4">
          <Panel>
            <PanelHeader
              title="Battery Operating Envelope"
              kicker={`${profile.name} dispatch limits`}
              right={<Tag tone={missingSpecs.length === 0 ? "green" : "amber"}>{profile.country}</Tag>}
            />
            <div className="grid gap-4 p-3 lg:grid-cols-[250px_minmax(0,1fr)]">
              <SocEnvelope
                initialSocPct={parameters.initialSocPct}
                maxSocPct={parameters.maxSocPct}
                minSocPct={parameters.minSocPct}
                reserveSocPct={parameters.reserveSocPct}
              />
              <div className="grid gap-3">
                <PowerBounds
                  availabilityPct={parameters.availabilityPct}
                  maxChargeMw={optimizerConstraints.maxChargeMw}
                  maxDischargeMw={optimizerConstraints.maxDischargeMw}
                  ratedPowerMwAc={parameters.ratedPowerMwAc}
                />
                <CapacityFlow
                  acDispatchableMwh={capacityStack.acDispatchableMwhEstimate}
                  contractedUsableMwh={capacityStack.contractedUsableMwh}
                  nameplateEstimated={capacityStack.nameplateEstimated}
                  nameplateMwhDc={capacityStack.nameplateMwhDc ?? capacityStack.contractedUsableMwh}
                  operationalWindowMwh={capacityStack.operationalWindowMwh}
                />
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Scheduler Contract" kicker="Values sent into the optimization run" />
            <div className="grid gap-2 p-3 md:grid-cols-3">
              <DetailMetric
                label="Energy Gate"
                value={`${formatMwh(optimizerConstraints.minSocMwh)} -> ${formatMwh(optimizerConstraints.maxSocMwh)}`}
                detail="Usable SoC corridor after operator policy"
              />
              <DetailMetric
                label="Efficiency Split"
                value={`${formatPercent(optimizerConstraints.chargeEfficiency)} / ${formatPercent(optimizerConstraints.dischargeEfficiency)}`}
                detail="Charge / discharge conversion"
              />
              <DetailMetric
                label="Cycle Budget"
                value={`${optimizerConstraints.maxCyclesPerDay.toFixed(2)} / day`}
                detail="Daily throughput guardrail"
              />
              <DetailMetric
                label="Reserve Floor"
                value={formatMwh(optimizerConstraints.reserveSocMwh)}
                detail="Balancing-readiness buffer"
              />
              <DetailMetric
                label="Availability Derate"
                value={formatPercent(optimizerConstraints.availabilityDerate)}
                detail="Power capability after outage margin"
              />
              <DetailMetric
                label="Schedule Value"
                value={formatEuro(summary.valueEur)}
                detail="Current market session"
              />
            </div>
          </Panel>
        </div>

        <Panel>
          <PanelHeader
            title="Assumption Console"
            kicker="Editable twin controls"
            right={
              <div className="flex gap-1">
                {(["conservative", "balanced", "aggressive"] as const).map((policy) => (
                  <button
                    key={policy}
                    className="rounded-sm border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-zinc-400 uppercase hover:text-zinc-100"
                    type="button"
                    onClick={() => onApplyPolicy(policy)}
                  >
                    {policy}
                  </button>
                ))}
              </div>
            }
          />
          <div className="grid gap-3 p-3">
            <TwinNumberControl
              label="Inverter Limit"
              suffix="MW"
              value={parameters.ratedPowerMwAc}
              onChange={(value) => {
                onParameterChange("ratedPowerMwAc", value);
                onParameterChange("maxChargePowerMw", value);
                onParameterChange("maxDischargePowerMw", value);
              }}
            />
            <TwinNumberControl
              label="Contracted Energy"
              suffix="MWh"
              value={parameters.contractedUsableEnergyMwh}
              onChange={(value) => onParameterChange("contractedUsableEnergyMwh", value)}
            />
            <TwinNumberControl
              label="DC Nameplate"
              suffix="MWh"
              value={parameters.nameplateEnergyMwhDc ?? 0}
              onChange={(value) => onParameterChange("nameplateEnergyMwhDc", value > 0 ? value : null)}
            />
            <TwinNumberControl
              label="AC Round-trip Yield"
              max={0.98}
              min={0.75}
              step={0.01}
              suffix="0-1"
              value={parameters.roundTripEfficiencyAc}
              onChange={(value) => onParameterChange("roundTripEfficiencyAc", value)}
            />
            <div className="border-y border-white/10 py-3">
              <div className="mb-2 text-[10px] font-medium text-zinc-500 uppercase tracking-[0.08em]">
                SoC Dispatch Policy
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
                <TwinNumberControl
                  label="Min SoC"
                  max={50}
                  min={0}
                  suffix="%"
                  value={parameters.minSocPct}
                  onChange={(value) => onParameterChange("minSocPct", value)}
                />
                <TwinNumberControl
                  label="Max SoC"
                  max={100}
                  min={50}
                  suffix="%"
                  value={parameters.maxSocPct}
                  onChange={(value) => onParameterChange("maxSocPct", value)}
                />
                <TwinNumberControl
                  label="Initial SoC"
                  max={100}
                  min={0}
                  suffix="%"
                  value={parameters.initialSocPct}
                  onChange={(value) => onParameterChange("initialSocPct", value)}
                />
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <TwinNumberControl
                label="Reserve SoC"
                max={40}
                min={0}
                suffix="%"
                value={parameters.reserveSocPct}
                onChange={(value) => onParameterChange("reserveSocPct", value)}
              />
              <TwinNumberControl
                label="Max Cycles / Day"
                max={3}
                min={0.25}
                step={0.25}
                suffix="cycles"
                value={parameters.maxCyclesPerDay}
                onChange={(value) => onParameterChange("maxCyclesPerDay", value)}
              />
              <TwinNumberControl
                label="Degradation Cost"
                max={20}
                min={0}
                step={0.5}
                suffix="EUR/MWh"
                value={parameters.degradationCostEurPerMwhThroughput}
                onChange={(value) => onParameterChange("degradationCostEurPerMwhThroughput", value)}
              />
              <TwinNumberControl
                label="Availability"
                max={100}
                min={50}
                suffix="%"
                value={parameters.availabilityPct}
                onChange={(value) => onParameterChange("availabilityPct", value)}
              />
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Parameter Confidence" kicker="High, medium, low, unknown" />
          <div className="grid gap-2 p-3 md:grid-cols-2">
            {(Object.entries(profile.confidence) as Array<[string, string]>).map(([key, confidence]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 border border-white/10 bg-black/20 p-2"
              >
                <span className="truncate text-[11px] text-zinc-400">{humanizeKey(key)}</span>
                <Tag tone={confidenceTone(confidence)}>{confidence}</Tag>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title="Open Asset Data Requests"
            kicker="Why this is here: these are the supplier or customer values still estimated by the twin."
          />
          <div className="border-white/10 border-b px-3 py-2 text-[11px] leading-4 text-zinc-500">
            The model can run without these fields, but each missing value lowers confidence or forces a
            fallback assumption. Filling them from datasheets, warranties, or operator measurements tightens
            the dispatch limits used by the optimizer.
          </div>
          <div className="grid gap-2 p-3">
            {missingSpecs.slice(0, 7).map((spec) => (
              <div key={spec.id} className="border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-[12px] text-zinc-200">{spec.label}</div>
                  <Tag tone={confidenceTone(spec.confidence)}>{spec.confidence}</Tag>
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{spec.basis}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <FeasibilityChecklist checks={feasibilityChecks} />
    </div>
  );
}

function SocEnvelope({
  initialSocPct,
  maxSocPct,
  minSocPct,
  reserveSocPct,
}: {
  initialSocPct: number;
  maxSocPct: number;
  minSocPct: number;
  reserveSocPct: number;
}) {
  const minSoc = clampPercent(minSocPct);
  const maxSoc = Math.max(minSoc, clampPercent(maxSocPct));
  const reserveSoc = clampPercent(reserveSocPct);
  const initialSoc = clampPercent(initialSocPct);
  const reserveTop = Math.min(Math.max(reserveSoc, minSoc), maxSoc);
  const operatingHeight = Math.max(0, maxSoc - minSoc);
  const reserveHeight = Math.max(0, reserveTop - minSoc);

  return (
    <div className="grid gap-3 border border-white/10 bg-black/20 p-3">
      <div>
        <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.08em]">SoC Window</div>
        <div className="mt-1 text-[12px] text-zinc-300">
          {minSoc.toFixed(0)}-{maxSoc.toFixed(0)}% operating corridor
        </div>
      </div>
      <div className="grid grid-cols-[72px_1fr] gap-4">
        <div className="relative h-72 border border-white/15 bg-zinc-950">
          <div className="absolute inset-x-0 bottom-0 bg-red-400/15" style={{ height: `${minSoc}%` }} />
          <div
            className="absolute inset-x-0 bg-cyan-300/15"
            style={{ bottom: `${minSoc}%`, height: `${operatingHeight}%` }}
          />
          <div
            className="absolute inset-x-0 bg-amber-300/20"
            style={{ bottom: `${minSoc}%`, height: `${reserveHeight}%` }}
          />
          <div className="absolute inset-x-0 top-0 bg-zinc-500/10" style={{ height: `${100 - maxSoc}%` }} />
          <div
            className="absolute left-0 right-0 border-t border-cyan-200"
            style={{ bottom: `${maxSoc}%` }}
          />
          <div className="absolute left-0 right-0 border-t border-red-300" style={{ bottom: `${minSoc}%` }} />
          <div
            className="absolute left-0 right-0 border-t border-amber-200"
            style={{ bottom: `${reserveSoc}%` }}
          />
          <div
            className="absolute -left-1 right-0 flex items-center gap-1"
            style={{ bottom: `${initialSoc}%`, transform: "translateY(50%)" }}
          >
            <span className="h-2.5 w-2.5 border border-white bg-cyan-200" />
            <span className="mono bg-black/80 px-1 text-[10px] text-cyan-100">{initialSoc.toFixed(0)}%</span>
          </div>
        </div>
        <div className="grid content-between py-1 text-[11px] text-zinc-500">
          <SocLegend label="Max dispatch ceiling" tone="cyan" value={`${maxSoc.toFixed(0)}%`} />
          <SocLegend label="Initial nomination" tone="cyan" value={`${initialSoc.toFixed(0)}%`} />
          <SocLegend label="Reserve service floor" tone="amber" value={`${reserveSoc.toFixed(0)}%`} />
          <SocLegend label="Min protection floor" tone="red" value={`${minSoc.toFixed(0)}%`} />
        </div>
      </div>
    </div>
  );
}

function SocLegend({ label, tone, value }: { label: string; tone: "amber" | "cyan" | "red"; value: string }) {
  const toneClass = tone === "cyan" ? "bg-cyan-300" : tone === "amber" ? "bg-amber-300" : "bg-red-300";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-2 w-2 shrink-0 ${toneClass}`} />
        <span className="truncate">{label}</span>
      </span>
      <span className="mono text-zinc-300">{value}</span>
    </div>
  );
}

function PowerBounds({
  availabilityPct,
  maxChargeMw,
  maxDischargeMw,
  ratedPowerMwAc,
}: {
  availabilityPct: number;
  maxChargeMw: number;
  maxDischargeMw: number;
  ratedPowerMwAc: number;
}) {
  const chargeWidth = boundPercent(maxChargeMw, ratedPowerMwAc);
  const dischargeWidth = boundPercent(maxDischargeMw, ratedPowerMwAc);

  return (
    <div className="border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.08em]">
            Power Bounds
          </div>
          <div className="mt-1 text-[12px] text-zinc-300">
            Charge and export limits after availability derate
          </div>
        </div>
        <Tag tone="outline">{availabilityPct.toFixed(0)}% avail.</Tag>
      </div>
      <div className="mt-4 grid gap-3">
        <PowerBar label="Charge import" side="left" value={formatMw(maxChargeMw)} width={chargeWidth} />
        <PowerBar
          label="Discharge export"
          side="right"
          value={formatMw(maxDischargeMw)}
          width={dischargeWidth}
        />
      </div>
      <div className="mt-3 flex justify-between text-[10px] text-zinc-600">
        <span>Grid import</span>
        <span className="mono">{formatMw(ratedPowerMwAc)} AC inverter</span>
        <span>Grid export</span>
      </div>
    </div>
  );
}

function PowerBar({
  label,
  side,
  value,
  width,
}: {
  label: string;
  side: "left" | "right";
  value: string;
  width: number;
}) {
  const alignment = side === "left" ? "justify-end pr-1" : "justify-start pl-1";
  const fillClass = side === "left" ? "bg-blue-300/70" : "bg-green-300/70";
  return (
    <div className="grid gap-1">
      <div className="flex justify-between gap-2 text-[11px]">
        <span className="text-zinc-500">{label}</span>
        <span className="mono text-zinc-200">{value}</span>
      </div>
      <div className="grid h-7 grid-cols-2 border border-white/10 bg-zinc-950">
        <div className={`flex items-center ${side === "left" ? alignment : ""}`}>
          {side === "left" ? <span className={`h-full ${fillClass}`} style={{ width: `${width}%` }} /> : null}
        </div>
        <div className={`flex items-center ${side === "right" ? alignment : ""}`}>
          {side === "right" ? (
            <span className={`h-full ${fillClass}`} style={{ width: `${width}%` }} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CapacityFlow({
  acDispatchableMwh,
  contractedUsableMwh,
  nameplateEstimated,
  nameplateMwhDc,
  operationalWindowMwh,
}: {
  acDispatchableMwh: number;
  contractedUsableMwh: number;
  nameplateEstimated: boolean;
  nameplateMwhDc: number;
  operationalWindowMwh: number;
}) {
  const stages = [
    {
      detail: nameplateEstimated ? "estimated rack inventory" : "supplier rack inventory",
      label: "DC nameplate",
      tone: "bg-zinc-300/65",
      value: nameplateMwhDc,
    },
    {
      detail: "contracted customer energy",
      label: "contracted usable",
      tone: "bg-cyan-300/70",
      value: contractedUsableMwh,
    },
    {
      detail: "SoC policy corridor",
      label: "operating window",
      tone: "bg-amber-300/75",
      value: operationalWindowMwh,
    },
    {
      detail: "AC dispatchable estimate",
      label: "scheduler energy",
      tone: "bg-green-300/75",
      value: acDispatchableMwh,
    },
  ];
  const largest = Math.max(...stages.map((stage) => stage.value), 1);

  return (
    <div className="border border-white/10 bg-black/20 p-3">
      <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.08em]">Capacity Flow</div>
      <div className="mt-3 grid gap-3">
        {stages.map((stage) => (
          <div key={stage.label} className="grid gap-1">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-zinc-500">{stage.label}</span>
              <span className="mono text-zinc-200">{formatMwh(stage.value)}</span>
            </div>
            <div className="h-6 border border-white/10 bg-zinc-950">
              <div
                className={`h-full ${stage.tone}`}
                style={{ width: `${boundPercent(stage.value, largest)}%` }}
              />
            </div>
            <div className="text-[10px] text-zinc-600">{stage.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TwinNumberControl({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="grid gap-1 text-[11px] text-zinc-500">
      <div className="grid gap-1">
        <span className="text-[11px] text-zinc-500">{label}</span>
        <div className="flex items-center gap-2">
          <Input
            className="h-8 rounded-sm border-white/10 bg-black/20 px-2 text-[12px]"
            max={max}
            min={min}
            step={step}
            type="number"
            value={Number.isFinite(value) ? String(value) : "0"}
            onChange={(event) => onChange(Number(event.target.value) || 0)}
          />
          <span className="w-20 shrink-0 text-zinc-600">{suffix}</span>
        </div>
      </div>
    </div>
  );
}

export function policyOverrides(
  policy: "conservative" | "balanced" | "aggressive",
): Partial<BatteryTwinParameters> {
  if (policy === "conservative") {
    return {
      minSocPct: 15,
      maxSocPct: 85,
      reserveSocPct: 15,
      maxCyclesPerDay: 1,
      degradationCostEurPerMwhThroughput: 6,
      terminalSocPolicy: "minimum-return",
    };
  }
  if (policy === "aggressive") {
    return {
      minSocPct: 5,
      maxSocPct: 95,
      reserveSocPct: 5,
      maxCyclesPerDay: 2,
      degradationCostEurPerMwhThroughput: 3,
      terminalSocPolicy: "none",
    };
  }
  return {
    minSocPct: 10,
    maxSocPct: 90,
    reserveSocPct: 10,
    maxCyclesPerDay: 1.25,
    degradationCostEurPerMwhThroughput: 4,
    terminalSocPolicy: "minimum-return",
  };
}

function confidenceTone(confidence: string): Tone {
  if (confidence === "high") return "green";
  if (confidence === "medium") return "amber";
  if (confidence === "low") return "violet";
  return "outline";
}

function humanizeKey(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/Mw/g, "MW")
    .replace(/Mwh/g, "MWh")
    .replace(/Dc/g, "DC")
    .replace(/Ac/g, "AC")
    .replace(/^./, (character) => character.toUpperCase());
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function boundPercent(value: number, bound: number) {
  if (!Number.isFinite(value) || !Number.isFinite(bound) || bound <= 0) return 0;
  return Math.min(100, Math.max(0, (Math.abs(value) / bound) * 100));
}
