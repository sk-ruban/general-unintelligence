"use client";

import {
  Bot,
  Database,
  FileSpreadsheet,
  Gauge,
  KeyRound,
  LinkIcon,
  Plus,
  RadioTower,
  ServerCog,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Panel, PanelHeader } from "@/components/ui/panel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { BatterySignalResponse, DataHealth, ExternalSignalPanel } from "@/lib/types";
import { Metric, PageIntro, Tag, type Tone } from "./shared";

type SourceCard = {
  id: string;
  name: string;
  family: string;
  mode: string;
  procurementMode: string;
  status: "live" | "cached" | "missing";
  detail: string;
  sourceLocation: string;
  auth: string;
  coverage: string;
  cadence: string;
  owner: string;
  mapping: string;
  lastSync: string;
  useCase: string;
};

type SourceTemplate = {
  id: string;
  name: string;
  family: string;
  mode: string;
  procurementMode: string;
  sourceLocation: string;
  auth: string;
  authMethod: AuthMethod;
  credentialStatus: CredentialStatus;
  credentialRef: string;
  accessScope: string;
  testState: string;
  cadence: string;
  owner: string;
  mapping: string;
  coverage: string;
  useCase: string;
};

type AddedSource = {
  templateId: string;
  name: string;
  coverage: string;
  cadence: string;
  owner: string;
  mode: string;
  procurementMode: string;
  sourceLocation: string;
  auth: string;
  authMethod: AuthMethod;
  credentialStatus: CredentialStatus;
  credentialRef: string;
  accessScope: string;
  testState: string;
  mapping: string;
  useCase: string;
};

type AuthMethod =
  | "Public"
  | "API key"
  | "OAuth 2.0"
  | "Service account"
  | "SFTP key"
  | "mTLS / VPN"
  | "Portal login"
  | "Manual approval";

type CredentialStatus = "Not needed" | "Not provided" | "Pending approval" | "Vault reference set" | "Tested";

const ADDED_SOURCE_STORAGE_KEY = "odyceo:data-sources:configured";
const AUTH_METHODS: AuthMethod[] = [
  "Public",
  "API key",
  "OAuth 2.0",
  "Service account",
  "SFTP key",
  "mTLS / VPN",
  "Portal login",
  "Manual approval",
];
const CREDENTIAL_STATUSES: CredentialStatus[] = [
  "Not needed",
  "Not provided",
  "Pending approval",
  "Vault reference set",
  "Tested",
];
const AGENT_STEPS = [
  {
    label: "Discover",
    detail: "Search approved public, vendor, and customer-provided source paths.",
  },
  {
    label: "Classify",
    detail: "Identify access method, owner, coverage, cadence, and schema shape.",
  },
  {
    label: "Scaffold",
    detail: "Draft a source adapter contract and queue human approval before credentials.",
  },
];
const AGENT_DEFAULTS = [
  { label: "Agent", value: "Procurement scout" },
  { label: "Run mode", value: "Human-gated draft" },
  { label: "Secrets", value: "References only" },
  { label: "Output", value: "Source card + adapter plan" },
];

const DEFAULT_TEMPLATE: SourceTemplate = {
  id: "asset-telemetry",
  name: "Asset telemetry",
  family: "Battery operations",
  mode: "API / historian",
  procurementMode: "Connect known source",
  sourceLocation: "SCADA, BMS, EMS historian, or operator telemetry API",
  auth: "VPN, OAuth, API key, or service account",
  authMethod: "Service account",
  credentialStatus: "Pending approval",
  credentialRef: "vault://operator/telemetry-service-account",
  accessScope: "read:telemetry read:alarms read:metering",
  testState: "Connection test pending",
  cadence: "1-5 min",
  owner: "Operator data room",
  mapping: "SoC, availability, alarms, active/reactive power",
  coverage: "Selected BESS assets and site meters",
  useCase: "Calibrates the digital twin and validates feasible dispatch.",
};

const SOURCE_TEMPLATES: SourceTemplate[] = [
  DEFAULT_TEMPLATE,
  {
    id: "market-feed",
    name: "Market or settlement feed",
    family: "Market data",
    mode: "API / CSV / XLSX",
    procurementMode: "Connect known source",
    sourceLocation: "Market API endpoint, settlement portal, SFTP drop, or uploaded workbook",
    auth: "API key, portal login, signed file drop, or public access",
    authMethod: "API key",
    credentialStatus: "Not provided",
    credentialRef: "vault://market/settlement-feed",
    accessScope: "read:prices read:settlements read:files",
    testState: "Waiting for credential",
    cadence: "15-60 min",
    owner: "Market operator or trader",
    mapping: "price, volume, imbalance, product, delivery interval",
    coverage: "Clearing and settlement intervals for chosen markets",
    useCase: "Feeds price forecasts, spread scoring, and realized PnL checks.",
  },
  {
    id: "grid-constraints",
    name: "Grid constraints",
    family: "System operations",
    mode: "API / file drop",
    procurementMode: "Connect known source",
    sourceLocation: "TSO/DSO endpoint, operating notice portal, or constraint file drop",
    auth: "Operator login, VPN, mTLS, or manual approval",
    authMethod: "mTLS / VPN",
    credentialStatus: "Pending approval",
    credentialRef: "vault://grid/constraint-client-cert",
    accessScope: "read:constraints read:outages read:operating-notices",
    testState: "Network allowlist required",
    cadence: "5-15 min",
    owner: "TSO, DSO, or operations team",
    mapping: "constraint zone, congestion flag, reserve margin, curtailment",
    coverage: "Nodes, substations, or portfolio zones",
    useCase: "Adds grid-risk guardrails to dispatch recommendations.",
  },
  {
    id: "weather-forecast",
    name: "Weather or renewable forecast",
    family: "Forecast input",
    mode: "API / vendor feed",
    procurementMode: "Connect known source",
    sourceLocation: "Forecast vendor API, public forecast endpoint, or internal model output",
    auth: "API token, vendor subscription, or public endpoint",
    authMethod: "API key",
    credentialStatus: "Vault reference set",
    credentialRef: "vault://forecast/vendor-token",
    accessScope: "read:forecast read:historical-weather",
    testState: "Ready to test",
    cadence: "Hourly",
    owner: "Forecast vendor or internal model",
    mapping: "temperature, irradiance, wind, cloud cover, forecast timestamp",
    coverage: "Asset coordinates and regional renewable zones",
    useCase: "Explains renewable surplus, thermal derating, and charge windows.",
  },
  {
    id: "proprietary-signal",
    name: "Proprietary signal",
    family: "Private intelligence",
    mode: "Secure upload",
    procurementMode: "Connect known source",
    sourceLocation: "Customer upload, private workspace, or internal intelligence database",
    auth: "Customer-managed upload, RBAC, encryption, and approval workflow",
    authMethod: "Manual approval",
    credentialStatus: "Pending approval",
    credentialRef: "rbac://customer-data-room/proprietary-signal",
    accessScope: "read:approved-datasets write:normalized-signals",
    testState: "Data-room approval required",
    cadence: "On update",
    owner: "Customer strategy team",
    mapping: "custom score, source timestamp, confidence, scenario tag",
    coverage: "Customer-defined assets, counterparties, or market regimes",
    useCase: "Lets operators blend private views into the same decision cockpit.",
  },
];

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
  const [addedSource, setAddedSource] = useState<AddedSource | null>(null);
  const [storedSourceLoaded, setStoredSourceLoaded] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const baseSources = useMemo(
    () => sourceCards({ health, curveHealth, signals, batterySignals, days, curveDays }),
    [health, curveHealth, signals, batterySignals, days, curveDays],
  );
  const sources = addedSource ? [...baseSources, addedSourceCard(addedSource)] : baseSources;
  const liveCount = sources.filter((source) => source.status === "live").length;
  const availableCount = sources.filter((source) => source.status !== "missing").length;
  const configurableCount = SOURCE_TEMPLATES.length;
  const agentCount = sources.filter((source) => source.procurementMode.includes("AI")).length;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ADDED_SOURCE_STORAGE_KEY);
      if (!stored) {
        setAddedSource(null);
        return;
      }
      const parsed = JSON.parse(stored) as AddedSource;
      setAddedSource(sourceDraft(parsed, templateById(parsed.templateId)));
    } catch {
      setAddedSource(null);
    } finally {
      setStoredSourceLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!storedSourceLoaded) return;
    try {
      if (addedSource) {
        window.localStorage.setItem(ADDED_SOURCE_STORAGE_KEY, JSON.stringify(addedSource));
      } else {
        window.localStorage.removeItem(ADDED_SOURCE_STORAGE_KEY);
      }
    } catch {
      // Demo state is optional; the cockpit should still work if storage is unavailable.
    }
  }, [addedSource, storedSourceLoaded]);

  return (
    <div className="grid gap-4">
      <PageIntro
        kicker="Data Sources"
        title="Source Registry"
        description="Each source records provenance, access method, auth requirements, schema mapping, and the battery decision it supports. Operators can connect known feeds directly or ask an AI procurement agent to discover, classify, and scaffold a new source adapter."
        actions={
          <>
            <SourceActionButton icon="plus" label="Add source" onClick={() => setAddSourceOpen(true)} />
            <SourceActionButton icon="bot" label="AI procurement" onClick={() => setAgentOpen(true)} />
            <Tag tone={availableCount === sources.length ? "green" : "amber"}>
              {availableCount} / {sources.length} available
            </Tag>
          </>
        }
      />
      <Panel>
        <PanelHeader title="Data Sources" kicker="Operational inputs available to the cockpit" />
        <div className="grid gap-2 p-3 md:grid-cols-4">
          <Metric
            label="Available Sources"
            value={`${availableCount} / ${sources.length}`}
            detail="Ready or cached"
          />
          <Metric label="Live Sources" value={String(liveCount)} detail="Fresh source panels" />
          <Metric label="Templates" value={String(configurableCount)} detail="Reusable source types" />
          <Metric label="Agent Tasks" value={String(agentCount)} detail="AI-procured sources" />
        </div>
      </Panel>
      <div className="grid gap-2 xl:grid-cols-2">
        {sources.map((source) => (
          <DataSourceCard key={source.name} source={source} />
        ))}
      </div>
      <AddSourceSheet
        open={addSourceOpen}
        onOpenChange={setAddSourceOpen}
        configuredSource={addedSource}
        onSave={(source) => {
          setAddedSource(source);
          setAddSourceOpen(false);
        }}
        onRemove={() => setAddedSource(null)}
      />
      <AgentProcurementSheet
        open={agentOpen}
        onOpenChange={setAgentOpen}
        configuredSource={addedSource}
        onSave={(source) => {
          setAddedSource(source);
          setAgentOpen(false);
        }}
        onRemove={() => setAddedSource(null)}
      />
    </div>
  );
}

export { DataSourcesView as DataHealthView };

function SourceActionButton({
  icon,
  label,
  onClick,
}: {
  icon: "plus" | "bot";
  label: string;
  onClick: () => void;
}) {
  const Icon = icon === "bot" ? Bot : Plus;
  const classes =
    icon === "bot"
      ? "border-violet-300/25 bg-violet-300/10 text-violet-100 hover:bg-violet-300/15"
      : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/15";

  return (
    <button
      className={`inline-flex h-8 items-center gap-2 rounded-md border px-3 text-[12px] font-medium ${classes}`}
      type="button"
      onClick={onClick}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function DataSourceCard({ source }: { source: SourceCard }) {
  return (
    <Panel className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <SourceIcon family={source.family} />
          <div className="min-w-0">
            <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.08em]">
              {source.family} · {source.procurementMode}
            </div>
            <div className="truncate text-[13px] font-medium text-zinc-100">{source.name}</div>
            <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{source.detail}</div>
          </div>
        </div>
        <Tag tone={statusTone(source.status)}>{statusLabel(source.status)}</Tag>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <SourceFact icon="link" label="Source" value={source.sourceLocation} />
        <SourceFact icon="key" label="Auth" value={source.auth} />
        <SourceFact label="Connection" value={source.mode} />
        <SourceFact label="Coverage" value={source.coverage} />
        <SourceFact label="Cadence" value={source.cadence} />
        <SourceFact label="Owner" value={source.owner} />
        <SourceFact label="Normalized Fields" value={source.mapping} />
        <SourceFact label="Last Sync" value={source.lastSync} />
        <SourceFact label="Decision Use" value={source.useCase} />
      </div>
    </Panel>
  );
}

function SourceIcon({ family }: { family: string }) {
  const Icon = family.toLowerCase().includes("battery")
    ? Gauge
    : family.toLowerCase().includes("market")
      ? FileSpreadsheet
      : family.toLowerCase().includes("system")
        ? RadioTower
        : family.toLowerCase().includes("private")
          ? ServerCog
          : Database;

  return (
    <div className="flex size-8 shrink-0 items-center justify-center border border-white/10 bg-[var(--bg-base)] text-zinc-300">
      <Icon className="size-4" />
    </div>
  );
}

function SourceFact({ icon, label, value }: { icon?: "link" | "key"; label: string; value: string }) {
  const Icon = icon === "link" ? LinkIcon : icon === "key" ? KeyRound : null;

  return (
    <div className="border border-white/10 bg-[var(--bg-base)] p-2">
      <div className="flex items-center gap-1 text-[10px] font-medium text-zinc-500 uppercase tracking-[0.05em]">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </div>
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
      id: "henex-dam-prices",
      name: "HEnEx DAM prices",
      family: "Market data",
      mode: "Convex table",
      procurementMode: "Connected feed",
      status: health && health.priceRows > 0 ? "live" : "missing",
      detail: `${health?.priceRows ?? 0} price rows loaded${lastUpdated(health)}`,
      sourceLocation: "HEnEx/ENEX day-ahead market publications imported into Convex",
      auth: "Public market files; no private credentials in demo",
      coverage: dateRangeLabel(health),
      cadence: "Daily auction",
      owner: "Market operator",
      mapping: "market date, MTU, MCP, traded volume, source file",
      lastSync: lastSyncLabel(health),
      useCase:
        health && health.priceRows > 0 ? "Used by Market and Dispatch views" : "Waiting for price data",
    },
    {
      id: "aggregated-dam-curves",
      name: "Aggregated DAM curves",
      family: "Market microstructure",
      mode: "Convex / static cache",
      procurementMode: "Connected feed",
      status: (curveHealth?.curveRows ?? health?.curveRows ?? 0) > 0 ? "cached" : "missing",
      detail: `${curveHealth?.curveRows ?? health?.curveRows ?? 0} curve points loaded${lastUpdated(curveHealth ?? health)}`,
      sourceLocation: "HEnEx/ENEX aggregate curve workbooks imported into Convex/static cache",
      auth: "Public market files; no private credentials in demo",
      coverage: curveDays.length > 0 ? curveDays.join(", ") : "No curve days loaded",
      cadence: "Daily auction",
      owner: "Market operator",
      mapping: "side, price, quantity, MTU, curve order",
      lastSync: lastSyncLabel(curveHealth ?? health),
      useCase: curveDays.length > 0 ? "Available in the Market curve view" : "Waiting for curve data",
    },
    signalSource("Open-Meteo weather", weather, "Weather tab and weather-linked dispatch proxies"),
    signalSource("ICE TTF gas", ttf, "Fuel-cost context"),
    signalSource("EEX Greek power forwards", eex, "Forward context beside market and gas views"),
    {
      id: "battery-signal-intervals",
      name: "Battery signal intervals",
      family: "Battery operations",
      mode: "Signal engine",
      procurementMode: "Derived source",
      status: batterySignals ? "live" : "missing",
      detail: batterySignals
        ? `${batterySignals.summary.intervalCount} intervals generated for ${batterySignals.timezone}`
        : "Signal intervals are not loaded",
      sourceLocation: "Odyceo signal-scoring layer derived from market, weather, fuel, and twin inputs",
      auth: "Internal model output",
      coverage: batterySignals
        ? `${batterySignals.range.from} -> ${batterySignals.range.to}`
        : `${days.length} market days available for modelling`,
      cadence: "Per market interval",
      owner: "Odyceo signal engine",
      mapping: "FVI, market fragility, renewable alignment, stress score",
      lastSync: batterySignals ? "Current session" : "No signal run",
      useCase: batterySignals
        ? "Feeds weather, dispatch and rail annotations"
        : "Waiting for signal model output",
    },
  ];
}

function signalSource(name: string, signal: ExternalSignalPanel | undefined, action: string): SourceCard {
  const family = name.includes("weather") ? "Forecast input" : "Market context";
  return {
    id: name.toLowerCase().replaceAll(" ", "-"),
    name,
    family,
    mode: signal ? "External adapter" : "Not connected",
    procurementMode: signal ? "Connected feed" : "Pending source",
    status: signal?.status ?? "missing",
    detail: signal ? `${signal.value} · ${signal.detail}` : "No source panel loaded",
    sourceLocation:
      !signal || signal.status === "missing" ? "Endpoint or vendor source not configured" : signal.detail,
    auth:
      !signal || signal.status === "missing" ? "Unknown until source is configured" : "Public/vendor adapter",
    coverage: !signal || signal.status === "missing" ? "No coverage reported" : "Latest source panel",
    cadence: !signal || signal.status === "missing" ? "Not scheduled" : "Scheduled refresh",
    owner: !signal || signal.status === "missing" ? "Unassigned" : "Public/vendor feed",
    mapping: "latest value, status, timestamp, source detail",
    lastSync: !signal || signal.status === "missing" ? "Never" : "Latest panel",
    useCase: !signal || signal.status === "missing" ? "Waiting for source data" : action,
  };
}

function addedSourceCard(source: AddedSource): SourceCard {
  const template = templateById(source.templateId);
  return {
    id: `configured-${source.templateId}`,
    name: source.name,
    family: template.family,
    mode: source.mode,
    procurementMode: source.procurementMode,
    status: "live",
    detail:
      source.procurementMode === "AI procurement agent"
        ? "AI procurement task configured to discover source access, schema, and adapter path"
        : `${template.family} source configured through reusable import template`,
    sourceLocation: source.sourceLocation,
    auth: authSummary(source),
    coverage: source.coverage,
    cadence: source.cadence,
    owner: source.owner,
    mapping: source.mapping,
    lastSync: "Configured locally",
    useCase: source.useCase,
  };
}

function AddSourceSheet({
  configuredSource,
  onOpenChange,
  onRemove,
  onSave,
  open,
}: {
  configuredSource: AddedSource | null;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  onSave: (source: AddedSource) => void;
  open: boolean;
}) {
  const manualSource = configuredSource?.procurementMode === "AI procurement agent" ? null : configuredSource;
  const [templateId, setTemplateId] = useState(manualSource?.templateId ?? DEFAULT_TEMPLATE.id);
  const selectedTemplate = templateById(templateId);
  const [draft, setDraft] = useState(() => sourceDraft(manualSource, selectedTemplate));

  useEffect(() => {
    if (!open) return;
    const source = configuredSource?.procurementMode === "AI procurement agent" ? null : configuredSource;
    const template = source ? templateById(source.templateId) : selectedTemplate;
    setTemplateId(template.id);
    setDraft(sourceDraft(source, template));
  }, [configuredSource, open, selectedTemplate]);

  function selectTemplate(nextTemplate: SourceTemplate) {
    setTemplateId(nextTemplate.id);
    setDraft(sourceDraft(null, nextTemplate));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full gap-0 border-white/10 bg-[var(--bg-panel)] text-zinc-100 sm:max-w-2xl"
        showCloseButton
      >
        <SheetHeader className="border-b border-white/10 p-4">
          <SheetTitle className="text-zinc-50">Add data source</SheetTitle>
          <SheetDescription className="text-[12px] leading-5 text-zinc-500">
            Connect a known endpoint, file, portal, upload, or vendor feed with a realistic access and
            credential contract.
          </SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {SOURCE_TEMPLATES.map((template) => (
              <button
                key={template.id}
                className={`border p-3 text-left ${
                  template.id === templateId
                    ? "border-cyan-300/40 bg-cyan-300/10"
                    : "border-white/10 bg-[var(--bg-base)] hover:bg-white/[0.04]"
                }`}
                type="button"
                onClick={() => selectTemplate(template)}
              >
                <div className="flex items-start gap-2">
                  <SourceIcon family={template.family} />
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-zinc-100">{template.name}</div>
                    <div className="mt-1 text-[10px] font-medium text-zinc-500 uppercase tracking-[0.08em]">
                      {template.family} · {template.mode}
                    </div>
                  </div>
                </div>
                <div className="mt-2 line-clamp-2 text-[11px] leading-4 text-zinc-500">
                  {template.useCase}
                </div>
              </button>
            ))}
          </div>
          <div className="grid gap-3 border border-white/10 bg-[var(--bg-base)] p-3">
            <Field
              label="Display name"
              value={draft.name}
              onChange={(name) => setDraft((current) => ({ ...current, name }))}
            />
            <Field
              label="Source endpoint / portal / file location"
              value={draft.sourceLocation}
              onChange={(sourceLocation) => setDraft((current) => ({ ...current, sourceLocation }))}
            />
            <AuthConfigurator draft={draft} onChange={setDraft} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Connection mode"
                value={draft.mode}
                onChange={(mode) => setDraft((current) => ({ ...current, mode }))}
              />
              <Field
                label="Cadence"
                value={draft.cadence}
                onChange={(cadence) => setDraft((current) => ({ ...current, cadence }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Owner"
                value={draft.owner}
                onChange={(owner) => setDraft((current) => ({ ...current, owner }))}
              />
              <Field
                label="Coverage"
                value={draft.coverage}
                onChange={(coverage) => setDraft((current) => ({ ...current, coverage }))}
              />
            </div>
            <Field
              label="Normalized fields"
              value={draft.mapping}
              onChange={(mapping) => setDraft((current) => ({ ...current, mapping }))}
            />
            <Field
              label="Decision use"
              value={draft.useCase}
              onChange={(useCase) => setDraft((current) => ({ ...current, useCase }))}
            />
          </div>
        </div>
        <SheetFooter className="border-t border-white/10 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <button
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-white/10 px-3 text-[12px] font-medium text-zinc-300 hover:bg-white/[0.04] disabled:opacity-40"
              type="button"
              disabled={!manualSource}
              onClick={onRemove}
            >
              Remove configured source
            </button>
            <button
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 text-[12px] font-medium text-cyan-100 hover:bg-cyan-300/15"
              type="button"
              onClick={() => onSave({ ...draft, templateId, auth: authSummary(draft) })}
            >
              <Upload className="size-3.5" />
              Save source
            </button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function AgentProcurementSheet({
  configuredSource,
  onOpenChange,
  onRemove,
  onSave,
  open,
}: {
  configuredSource: AddedSource | null;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  onSave: (source: AddedSource) => void;
  open: boolean;
}) {
  const agentSource = configuredSource?.procurementMode === "AI procurement agent" ? configuredSource : null;
  const [templateId, setTemplateId] = useState(agentSource?.templateId ?? "market-feed");
  const selectedTemplate = templateById(templateId);
  const [draft, setDraft] = useState(() => sourceForAgent(agentSource, selectedTemplate));

  useEffect(() => {
    if (!open) return;
    const source = configuredSource?.procurementMode === "AI procurement agent" ? configuredSource : null;
    const template = source ? templateById(source.templateId) : selectedTemplate;
    setTemplateId(template.id);
    setDraft(sourceForAgent(source, template));
  }, [configuredSource, open, selectedTemplate]);

  function selectTemplate(nextTemplate: SourceTemplate) {
    setTemplateId(nextTemplate.id);
    setDraft(sourceForAgent(null, nextTemplate));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full gap-0 border-violet-300/20 bg-[var(--bg-panel)] text-zinc-100 sm:max-w-3xl"
        showCloseButton
      >
        <SheetHeader className="border-b border-violet-300/20 bg-violet-300/[0.03] p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-violet-300/25 bg-violet-300/10 text-violet-100">
              <Bot className="size-4" />
            </div>
            <div>
              <SheetTitle className="text-zinc-50">AI procurement agent</SheetTitle>
              <SheetDescription className="mt-1 text-[12px] leading-5 text-zinc-500">
                Queue a local planning task that describes how an agent would find, classify, and scaffold a
                new source. No backend job or credential exchange is started.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="grid content-start gap-3">
            <div className="border border-violet-300/20 bg-violet-300/[0.04] p-3">
              <div className="text-[10px] font-medium text-violet-200 uppercase tracking-[0.08em]">
                Agent runbook
              </div>
              <div className="mt-3 grid gap-2">
                {AGENT_STEPS.map((step, index) => (
                  <div key={step.label} className="grid grid-cols-[1.75rem_1fr] gap-2">
                    <div className="flex size-7 items-center justify-center rounded-full border border-violet-300/25 bg-black/20 text-[11px] text-violet-100">
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-[12px] font-medium text-zinc-100">{step.label}</div>
                      <div className="mt-0.5 text-[11px] leading-4 text-zinc-500">{step.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {AGENT_DEFAULTS.map((item) => (
                <div key={item.label} className="border border-white/10 bg-[var(--bg-base)] p-2">
                  <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.08em]">
                    {item.label}
                  </div>
                  <div className="mt-1 text-[12px] text-zinc-200">{item.value}</div>
                </div>
              ))}
            </div>
            <div className="border border-white/10 bg-[var(--bg-base)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.08em]">
                    Cockpit preview
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-zinc-500">
                    Saving this adds one locally configured source card marked as an AI procurement task, with
                    the adapter plan and approval boundary visible to operators.
                  </div>
                </div>
                <Tag tone="blue">Local only</Tag>
              </div>
              <div className="mt-3 border border-violet-300/20 bg-violet-300/[0.04] p-3">
                <div className="text-[10px] font-medium text-violet-200 uppercase tracking-[0.08em]">
                  {selectedTemplate.family} · AI procurement agent
                </div>
                <div className="mt-1 text-[13px] font-medium text-zinc-100">{draft.name}</div>
                <div className="mt-2 line-clamp-3 text-[11px] leading-4 text-zinc-500">
                  {draft.sourceLocation}
                </div>
              </div>
            </div>
          </div>
          <div className="grid content-start gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {SOURCE_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  className={`border p-3 text-left ${
                    template.id === templateId
                      ? "border-violet-300/45 bg-violet-300/10"
                      : "border-white/10 bg-[var(--bg-base)] hover:bg-white/[0.04]"
                  }`}
                  type="button"
                  onClick={() => selectTemplate(template)}
                >
                  <div className="flex items-start gap-2">
                    <SourceIcon family={template.family} />
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-medium text-zinc-100">{template.name}</div>
                      <div className="mt-1 text-[10px] font-medium text-zinc-500 uppercase tracking-[0.08em]">
                        {template.family}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="grid gap-3 border border-white/10 bg-[var(--bg-base)] p-3">
              <Field
                label="Agent task name"
                value={draft.name}
                onChange={(name) => setDraft((current) => ({ ...current, name }))}
              />
              <Field
                label="Procurement brief"
                value={draft.sourceLocation}
                onChange={(sourceLocation) => setDraft((current) => ({ ...current, sourceLocation }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Target coverage"
                  value={draft.coverage}
                  onChange={(coverage) => setDraft((current) => ({ ...current, coverage }))}
                />
                <Field
                  label="Expected cadence"
                  value={draft.cadence}
                  onChange={(cadence) => setDraft((current) => ({ ...current, cadence }))}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Business owner"
                  value={draft.owner}
                  onChange={(owner) => setDraft((current) => ({ ...current, owner }))}
                />
                <Field
                  label="Adapter mode"
                  value={draft.mode}
                  onChange={(mode) => setDraft((current) => ({ ...current, mode }))}
                />
              </div>
              <AuthConfigurator draft={draft} onChange={setDraft} />
              <Field
                label="Expected normalized fields"
                value={draft.mapping}
                onChange={(mapping) => setDraft((current) => ({ ...current, mapping }))}
              />
              <Field
                label="Decision use"
                value={draft.useCase}
                onChange={(useCase) => setDraft((current) => ({ ...current, useCase }))}
              />
            </div>
          </div>
        </div>
        <SheetFooter className="border-t border-violet-300/20 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <button
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-white/10 px-3 text-[12px] font-medium text-zinc-300 hover:bg-white/[0.04] disabled:opacity-40"
              type="button"
              disabled={!agentSource}
              onClick={onRemove}
            >
              Remove procurement task
            </button>
            <button
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-violet-300/30 bg-violet-300/10 px-3 text-[12px] font-medium text-violet-100 hover:bg-violet-300/15"
              type="button"
              onClick={() => onSave({ ...draft, templateId, auth: authSummary(draft) })}
            >
              <Bot className="size-3.5" />
              Add agent task
            </button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({
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

function AuthConfigurator({
  draft,
  onChange,
}: {
  draft: AddedSource;
  onChange: (updater: (current: AddedSource) => AddedSource) => void;
}) {
  return (
    <div className="grid gap-3 border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.08em]">
            Auth contract
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Store references and access requirements, not raw secrets.
          </div>
        </div>
        <Tag tone={authTone(draft.credentialStatus)}>{draft.credentialStatus}</Tag>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {AUTH_METHODS.map((method) => (
          <button
            key={method}
            className={`h-7 rounded-sm border px-2 text-[10px] font-medium whitespace-nowrap ${
              draft.authMethod === method
                ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                : "border-white/10 bg-[var(--bg-base)] text-zinc-300 hover:bg-white/[0.04]"
            }`}
            type="button"
            onClick={() =>
              onChange((current) => ({
                ...current,
                authMethod: method,
                credentialStatus: method === "Public" ? "Not needed" : current.credentialStatus,
                credentialRef:
                  method === "Public" ? "public://no-credential-required" : current.credentialRef,
                testState: method === "Public" ? "No auth handshake required" : current.testState,
              }))
            }
          >
            {method}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CREDENTIAL_STATUSES.map((status) => (
          <button
            key={status}
            className={`h-7 rounded-sm border px-2 text-[10px] font-medium whitespace-nowrap ${
              draft.credentialStatus === status
                ? "border-green-300/35 bg-green-300/10 text-green-100"
                : "border-white/10 bg-[var(--bg-base)] text-zinc-300 hover:bg-white/[0.04]"
            }`}
            type="button"
            onClick={() => onChange((current) => ({ ...current, credentialStatus: status }))}
          >
            {status}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Credential reference"
          value={draft.credentialRef}
          onChange={(credentialRef) => onChange((current) => ({ ...current, credentialRef }))}
        />
        <Field
          label="Scopes / permissions"
          value={draft.accessScope}
          onChange={(accessScope) => onChange((current) => ({ ...current, accessScope }))}
        />
      </div>
      <Field
        label="Connection test / approval state"
        value={draft.testState}
        onChange={(testState) => onChange((current) => ({ ...current, testState }))}
      />
    </div>
  );
}

function sourceDraft(source: AddedSource | null, template: SourceTemplate): AddedSource {
  return {
    templateId: source?.templateId ?? template.id,
    name: source?.name ?? template.name,
    coverage: source?.coverage ?? template.coverage,
    cadence: source?.cadence ?? template.cadence,
    owner: source?.owner ?? template.owner,
    mode: source?.mode ?? template.mode,
    procurementMode: source?.procurementMode ?? template.procurementMode,
    sourceLocation: source?.sourceLocation ?? template.sourceLocation,
    auth: source?.auth ?? template.auth,
    authMethod: source?.authMethod ?? template.authMethod,
    credentialStatus: source?.credentialStatus ?? template.credentialStatus,
    credentialRef: source?.credentialRef ?? template.credentialRef,
    accessScope: source?.accessScope ?? template.accessScope,
    testState: source?.testState ?? template.testState,
    mapping: source?.mapping ?? template.mapping,
    useCase: source?.useCase ?? template.useCase,
  };
}

function sourceForAgent(source: AddedSource | null, template: SourceTemplate): AddedSource {
  return sourceDraft(
    {
      ...(source ?? sourceDraft(null, template)),
      templateId: template.id,
      name: source?.name ?? `Procurement scout: ${template.name}`,
      procurementMode: "AI procurement agent",
      sourceLocation: aiSourcePrompt(template),
      auth: "Agent to identify auth requirements, ToS constraints, and approval steps",
      authMethod: "Manual approval",
      credentialStatus: "Pending approval",
      credentialRef: "agent://procurement/output-pending",
      accessScope: "discover:source-metadata draft:adapter-plan require:human-approval",
      testState: "Agent has not run",
      mode: "Agent-discovered adapter",
    },
    template,
  );
}

function authSummary(source: AddedSource) {
  return `${source.authMethod} · ${source.credentialStatus} · ${source.credentialRef} · ${source.testState}`;
}

function authTone(status: CredentialStatus): Tone {
  if (status === "Tested" || status === "Not needed") return "green";
  if (status === "Vault reference set") return "blue";
  if (status === "Pending approval") return "amber";
  return "red";
}

function aiSourcePrompt(template: SourceTemplate) {
  return `Find ${template.family.toLowerCase()} sources for ${template.coverage}; identify endpoint/portal/files, auth requirements, sample schema, and adapter plan.`;
}

function templateById(templateId: string) {
  return SOURCE_TEMPLATES.find((template) => template.id === templateId) ?? DEFAULT_TEMPLATE;
}

function findSignal(signals: ExternalSignalPanel[], label: string) {
  return signals.find((signal) => signal.label.toLowerCase().includes(label.toLowerCase()));
}

function lastUpdated(health: DataHealth | null | undefined) {
  return health?.generatedAtUtc ? ` · updated ${formatTimestamp(health.generatedAtUtc)}` : "";
}

function lastSyncLabel(health: DataHealth | null | undefined) {
  return health?.generatedAtUtc ? formatTimestamp(health.generatedAtUtc) : "Never";
}

function dateRangeLabel(health: DataHealth | null) {
  if (!health?.firstMarketDate || !health.lastMarketDate) {
    return "No market range loaded";
  }
  return `${health.firstMarketDate} -> ${health.lastMarketDate}`;
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
