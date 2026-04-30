"use client";

import { BatteryCharging, BatteryMedium, CirclePause, Plus, RotateCcw, Trash2, X, Zap } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { BATTERY_TWIN_TEMPLATES, type BatteryTwinTemplateId } from "@/lib/battery-twin";
import { formatMw } from "@/lib/format";
import type { PortfolioSiteState } from "@/lib/portfolio";
import type { DispatchAction } from "@/lib/types";

type Tone = "cyan" | "green" | "amber" | "red" | "blue" | "violet" | "outline";

export type ManualOverrideCommand = DispatchAction | "auto";
export type BatteryOverrideState = Record<string, ManualOverrideCommand>;
export type BatteryOverrideSaveStatus = "idle" | "pending" | "saved" | "error";
export type BatteryOverrideSaveState = Record<string, BatteryOverrideSaveStatus>;

type AddedAsset = {
  id: string;
  name: string;
  region: string;
  templateId: BatteryTwinTemplateId;
  powerMw: number;
  energyMwh: number;
  initialSocPct: number;
  minSocPct: number;
  maxSocPct: number;
};

type AssetDraft = Omit<AddedAsset, "id">;

const ADDED_ASSETS_STORAGE_KEY = "prometheus:control-room-assets";
const DEFAULT_TEMPLATE_ID: BatteryTwinTemplateId = BATTERY_TWIN_TEMPLATES[0]?.profile.id ?? "custom";

export function ControlRoom({
  overrides,
  overrideSaveState = {},
  sites,
  onOverrideChange,
}: {
  overrides: BatteryOverrideState;
  overrideSaveState?: BatteryOverrideSaveState;
  sites: PortfolioSiteState[];
  onOverrideChange: (siteId: string, command: ManualOverrideCommand) => void;
}) {
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [assetDraft, setAssetDraft] = useState<AssetDraft>(() => buildAssetDraft(DEFAULT_TEMPLATE_ID));
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [addedAssets, setAddedAssets] = useState<AddedAsset[]>([]);
  const [storedAssetsLoaded, setStoredAssetsLoaded] = useState(false);
  const visibleSites = useMemo(
    () => [...sites, ...addedAssets.map((asset) => buildAddedAssetSite(asset))],
    [sites, addedAssets],
  );
  const operatorAssetIds = useMemo(() => new Set(addedAssets.map((asset) => asset.id)), [addedAssets]);
  const selectedTemplate = BATTERY_TWIN_TEMPLATES.find(
    (template) => template.profile.id === assetDraft.templateId,
  );
  const charging = visibleSites.filter(
    (site) => effectiveBatteryAction(site, overrides[site.id]) === "charge",
  ).length;
  const discharging = visibleSites.filter(
    (site) => effectiveBatteryAction(site, overrides[site.id]) === "discharge",
  ).length;
  const idle = visibleSites.length - charging - discharging;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ADDED_ASSETS_STORAGE_KEY);
      setAddedAssets(stored ? JSON.parse(stored) : []);
    } catch {
      setAddedAssets([]);
    } finally {
      setStoredAssetsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!storedAssetsLoaded) return;
    try {
      window.localStorage.setItem(ADDED_ASSETS_STORAGE_KEY, JSON.stringify(addedAssets));
    } catch {
      // Asset additions are still usable for the current session if local storage is unavailable.
    }
  }, [addedAssets, storedAssetsLoaded]);

  useEffect(() => {
    if (!assetDialogOpen) return;
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAssetDialogOpen(false);
        return;
      }
      if (event.key === "Tab") {
        const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const firstElement = focusableElements?.[0];
        const lastElement = focusableElements?.[focusableElements.length - 1];
        if (!firstElement || !lastElement) return;
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [assetDialogOpen]);

  const addAsset = () => {
    const template = selectedTemplate ?? BATTERY_TWIN_TEMPLATES[0];
    if (!template) return;
    const minSocPct = clampPercent(assetDraft.minSocPct);
    const maxSocPct = Math.max(minSocPct + 1, clampPercent(assetDraft.maxSocPct));
    const asset: AddedAsset = {
      id: `operator-${template.profile.id}-${Date.now().toString(36)}`,
      name: assetDraft.name.trim() || template.profile.name,
      region: assetDraft.region.trim() || template.profile.region || template.profile.country,
      templateId: template.profile.id,
      powerMw: Math.max(0.1, assetDraft.powerMw),
      energyMwh: Math.max(0.1, assetDraft.energyMwh),
      initialSocPct: clamp(assetDraft.initialSocPct, minSocPct, maxSocPct),
      minSocPct,
      maxSocPct,
    };
    setAddedAssets((current) => [...current, asset]);
    setAssetDialogOpen(false);
    setAssetDraft(buildAssetDraft(DEFAULT_TEMPLATE_ID));
  };

  const removeAddedAsset = (assetId: string) => {
    setAddedAssets((current) => current.filter((asset) => asset.id !== assetId));
  };

  const updateAssetMetric = (key: keyof AssetDraft, value: string) => {
    const numericKeys: Array<keyof AssetDraft> = [
      "powerMw",
      "energyMwh",
      "initialSocPct",
      "minSocPct",
      "maxSocPct",
    ];
    setAssetDraft((current) => ({
      ...current,
      [key]: numericKeys.includes(key) ? Number(value) : value,
    }));
  };

  const selectTemplate = (templateId: BatteryTwinTemplateId) => {
    setAssetDraft(buildAssetDraft(templateId));
  };

  return (
    <div className="grid gap-5">
      <Panel className="overflow-hidden border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.10),transparent_32%),var(--bg-panel)]">
        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.12em]">
              Control Room
            </div>
            <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.01em] text-zinc-50">Current Assets</h1>
            <div className="mt-1 max-w-2xl text-[12px] leading-5 text-zinc-500">
              Monitor live state, SoC, and override status across Convex-backed assets plus local
              operator-added assets.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex h-8 items-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 text-[12px] font-medium text-cyan-100 transition hover:bg-cyan-300/15 motion-reduce:transition-none"
              type="button"
              onClick={() => setAssetDialogOpen(true)}
            >
              <Plus className="size-3.5" />
              Add asset
            </button>
            <StatePill tone="green" value={charging} label="charging" />
            <StatePill tone="amber" value={discharging} label="discharging" />
            <StatePill tone="outline" value={idle} label="idle" />
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-5">
        {visibleSites.map((site) => (
          <BatteryControlCard
            key={site.id}
            isOperatorAdded={operatorAssetIds.has(site.id)}
            override={overrides[site.id] ?? "auto"}
            saveStatus={overrideSaveState[site.id] ?? "idle"}
            site={site}
            onOverrideChange={(command) => onOverrideChange(site.id, command)}
            onRemove={operatorAssetIds.has(site.id) ? () => removeAddedAsset(site.id) : undefined}
          />
        ))}
      </div>

      {assetDialogOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <button
            aria-label="Close add asset"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            type="button"
            onClick={() => setAssetDialogOpen(false)}
          />
          <div
            ref={dialogRef}
            aria-describedby="add-asset-description"
            aria-labelledby="add-asset-title"
            aria-modal="true"
            className="w-full max-w-2xl overflow-hidden rounded-lg border border-white/10 bg-[var(--bg-panel)] shadow-2xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-white/10 border-b p-4">
              <div>
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.12em]">
                  Add asset
                </div>
                <div className="mt-1 text-[18px] font-semibold text-zinc-50" id="add-asset-title">
                  Local operator asset
                </div>
                <div className="mt-1 text-[12px] text-zinc-500" id="add-asset-description">
                  Added assets are stored locally in this browser and are not saved in Convex.
                </div>
              </div>
              <button
                ref={closeButtonRef}
                aria-label="Close add asset"
                className="grid size-8 place-items-center rounded-md border border-white/10 bg-black/20 text-zinc-400 transition hover:text-zinc-100 motion-reduce:transition-none"
                type="button"
                onClick={() => setAssetDialogOpen(false)}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid gap-4 p-4">
              <div className="grid gap-2 md:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[11px] text-zinc-500 uppercase tracking-[0.1em]">Asset name</span>
                  <input
                    className="h-9 rounded-md border border-white/10 bg-black/30 px-3 text-[13px] text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/50 motion-reduce:transition-none"
                    placeholder={selectedTemplate?.profile.name ?? "Battery asset"}
                    value={assetDraft.name}
                    onChange={(event) => updateAssetMetric("name", event.target.value)}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] text-zinc-500 uppercase tracking-[0.1em]">Region</span>
                  <input
                    className="h-9 rounded-md border border-white/10 bg-black/30 px-3 text-[13px] text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/50 motion-reduce:transition-none"
                    placeholder={
                      selectedTemplate?.profile.region ?? selectedTemplate?.profile.country ?? "Greece"
                    }
                    value={assetDraft.region}
                    onChange={(event) => updateAssetMetric("region", event.target.value)}
                  />
                </label>
              </div>
              <div className="grid gap-2 md:grid-cols-5">
                <MetricInput
                  label="Power MW"
                  min={0.1}
                  step={0.1}
                  value={assetDraft.powerMw}
                  onChange={(value) => updateAssetMetric("powerMw", value)}
                />
                <MetricInput
                  label="Energy MWh"
                  min={0.1}
                  step={0.1}
                  value={assetDraft.energyMwh}
                  onChange={(value) => updateAssetMetric("energyMwh", value)}
                />
                <MetricInput
                  label="Initial SoC"
                  max={100}
                  min={0}
                  step={1}
                  suffix="%"
                  value={assetDraft.initialSocPct}
                  onChange={(value) => updateAssetMetric("initialSocPct", value)}
                />
                <MetricInput
                  label="Min SoC"
                  max={100}
                  min={0}
                  step={1}
                  suffix="%"
                  value={assetDraft.minSocPct}
                  onChange={(value) => updateAssetMetric("minSocPct", value)}
                />
                <MetricInput
                  label="Max SoC"
                  max={100}
                  min={0}
                  step={1}
                  suffix="%"
                  value={assetDraft.maxSocPct}
                  onChange={(value) => updateAssetMetric("maxSocPct", value)}
                />
              </div>
              <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                {BATTERY_TWIN_TEMPLATES.map((template) => (
                  <button
                    key={template.profile.id}
                    className={`rounded-md border p-3 text-left transition motion-reduce:transition-none ${
                      assetDraft.templateId === template.profile.id
                        ? "border-cyan-300/60 bg-cyan-300/[0.08]"
                        : "border-white/10 bg-black/20 hover:bg-white/[0.04]"
                    }`}
                    type="button"
                    onClick={() => selectTemplate(template.profile.id)}
                  >
                    <div className="truncate text-[12px] font-medium text-zinc-100">
                      {template.profile.name}
                    </div>
                    <div className="mono mt-1 text-[11px] text-zinc-500">
                      {formatMw(template.parameters.ratedPowerMwAc)} /{" "}
                      {Math.round(template.parameters.contractedUsableEnergyMwh)} MWh
                    </div>
                    <div className="mt-1 truncate text-[10px] text-zinc-500">
                      {template.profile.chemistry} · {template.profile.cooling} cooling
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-white/10 border-t p-4">
              <button
                className="h-9 rounded-md border border-white/10 bg-black/20 px-3 text-[12px] text-zinc-400 transition hover:text-zinc-100 motion-reduce:transition-none"
                type="button"
                onClick={() => setAssetDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                className="h-9 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 text-[12px] font-medium text-cyan-100 transition hover:bg-cyan-300/15 motion-reduce:transition-none"
                type="button"
                onClick={addAsset}
              >
                Add local asset
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BatteryControlCard({
  isOperatorAdded,
  override,
  saveStatus,
  site,
  onOverrideChange,
  onRemove,
}: {
  isOperatorAdded?: boolean;
  override: ManualOverrideCommand;
  saveStatus: BatteryOverrideSaveStatus;
  site: PortfolioSiteState;
  onOverrideChange: (command: ManualOverrideCommand) => void;
  onRemove?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const effectiveAction = effectiveBatteryAction(site, override);
  const currentMw =
    effectiveAction === "idle"
      ? 0
      : site.current?.mw
        ? Math.min(
            Math.abs(site.current.mw),
            effectiveAction === "charge" ? site.maxChargeMw : site.maxDischargeMw,
          )
        : (effectiveAction === "charge" ? site.maxChargeMw : site.maxDischargeMw) * site.telemetryMwFactor;
  const isManual = override !== "auto";
  const state = stateVisual(effectiveAction);
  const socScale = Math.max(0.04, Math.min(1, site.socPercent / 100));
  const StateIcon = state.icon;

  return (
    <motion.div
      layout={!reduceMotion}
      className={`group overflow-hidden rounded-lg border bg-[var(--bg-panel)] transition-colors duration-300 ${state.border}`}
    >
      <div className="flex min-h-[440px] flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-medium text-zinc-100">{site.name}</div>
            <div className="mt-0.5 truncate text-[11px] text-zinc-500">
              {site.region}
              {isOperatorAdded ? " · local operator asset" : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onRemove ? (
              <button
                aria-label={`Remove local asset ${site.name}`}
                className="grid size-8 place-items-center rounded-md border border-red-300/15 bg-red-300/[0.06] text-red-200/80 transition hover:bg-red-300/10 hover:text-red-100 motion-reduce:transition-none"
                title="Remove local operator asset from this browser"
                type="button"
                onClick={onRemove}
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
            <div
              className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] ${state.badge}`}
            >
              <StateIcon className="size-3.5" />
              <span className="capitalize">{isManual ? "manual" : effectiveAction}</span>
            </div>
          </div>
        </div>

        <div className="relative my-5 flex flex-1 items-center justify-center">
          <div className={`absolute inset-x-8 top-1/2 h-px ${state.track}`} />
          <EnergyParticles action={effectiveAction} reduceMotion={reduceMotion} />
          <div className="relative h-[265px] w-[126px] rounded-[28px] border border-zinc-300/20 bg-[linear-gradient(145deg,rgba(250,250,250,0.18),rgba(255,255,255,0.06)_42%,rgba(0,0,0,0.32))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_28px_80px_rgba(0,0,0,0.38)]">
            <div className="absolute left-1/2 top-[-14px] h-4 w-14 -translate-x-1/2 rounded-t-[16px] border border-zinc-300/20 border-b-0 bg-zinc-100/10" />
            <div className="relative h-full overflow-hidden rounded-[22px] border border-white/10 bg-black/40">
              <LiquidBatteryFill
                action={effectiveAction}
                fillClassName={state.fill}
                reduceMotion={reduceMotion}
                socScale={socScale}
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.18),transparent_24%,transparent_68%,rgba(255,255,255,0.08))]" />
              <motion.div
                key={`${site.id}-${effectiveAction}-icon`}
                className={`absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border backdrop-blur ${state.core}`}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <StateIcon className="size-7" />
              </motion.div>
              <div className="absolute inset-x-0 bottom-3 text-center">
                <div className="text-[28px] font-semibold tracking-[-0.03em] text-white">
                  {Math.round(site.socPercent)}
                  <span className="text-[14px] text-white/60">%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-end justify-between border-white/10 border-t pt-3">
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-[0.1em]">Mode</div>
            <div className={`mt-1 text-[18px] font-semibold ${state.text}`}>
              {capitalizeAction(effectiveAction)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-zinc-500 uppercase tracking-[0.1em]">
              {saveStatus === "pending"
                ? "Saving"
                : saveStatus === "saved"
                  ? "Saved"
                  : saveStatus === "error"
                    ? "Save failed"
                    : "Now"}
            </div>
            <div className="mono mt-1 text-[16px] text-zinc-100">{formatMw(currentMw)}</div>
          </div>
        </div>

        <div className="mt-auto grid grid-cols-4 gap-1.5">
          {CONTROL_COMMANDS.map((command) => {
            const CommandIcon = command.icon;
            return (
              <button
                key={command.value}
                aria-label={`${site.name} ${command.label}`}
                className={`flex h-9 items-center justify-center rounded-md border transition duration-150 motion-reduce:transition-none ${
                  override === command.value
                    ? "border-white/30 bg-white/15 text-zinc-50"
                    : "border-white/10 bg-black/20 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100"
                }`}
                title={command.label}
                type="button"
                onClick={() => onOverrideChange(command.value)}
              >
                <CommandIcon className="size-4" />
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

function LiquidBatteryFill({
  action,
  fillClassName,
  reduceMotion,
  socScale,
}: {
  action: DispatchAction;
  fillClassName: string;
  reduceMotion: boolean | null;
  socScale: number;
}) {
  const surfaceY = action === "charge" ? [3, -5, 3] : action === "discharge" ? [-5, 3, -5] : 0;
  const currentY = action === "charge" ? [190, 24] : [24, 190];
  const waveMotion = reduceMotion ? { x: 0 } : { x: ["0%", "-33.333%"] };
  return (
    <motion.div aria-hidden="true" className="absolute inset-0 overflow-hidden" initial={false}>
      <motion.div
        className={`absolute inset-0 origin-bottom overflow-visible ${fillClassName}`}
        initial={false}
        animate={{ opacity: 1, scaleY: socScale }}
        transition={{ duration: reduceMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="absolute inset-x-0 top-0 h-11 -translate-y-1/2 overflow-hidden"
          initial={false}
          animate={reduceMotion ? { y: 0 } : { y: surfaceY }}
          transition={{
            duration: 1.4,
            repeat: reduceMotion ? 0 : Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
        >
          <motion.div
            className="absolute top-1/2 left-0 h-11 w-[300%] -translate-y-1/2 text-white/35"
            initial={false}
            animate={waveMotion}
            transition={{
              duration: 2.8,
              repeat: reduceMotion ? 0 : Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          >
            <svg aria-hidden="true" className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 360 44">
              <path
                d="M0 23 C20 5 40 5 60 23 S100 41 120 23 S160 5 180 23 S220 41 240 23 S280 5 300 23 S340 41 360 23 V44 H0 Z"
                fill="currentColor"
              />
            </svg>
          </motion.div>
          <motion.div
            className="absolute top-[45%] left-0 h-10 w-[300%] -translate-y-1/2 text-white/18"
            initial={false}
            animate={waveMotion}
            transition={{
              duration: 3.6,
              repeat: reduceMotion ? 0 : Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          >
            <svg aria-hidden="true" className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 360 40">
              <path
                d="M0 20 C18 32 42 32 60 20 S102 8 120 20 S162 32 180 20 S222 8 240 20 S282 32 300 20 S342 8 360 20 V40 H0 Z"
                fill="currentColor"
              />
            </svg>
          </motion.div>
        </motion.div>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.22),transparent_34%,rgba(0,0,0,0.18))]" />
      </motion.div>
      {action === "idle" ? null : (
        <motion.div
          className="absolute inset-x-5 top-0 h-px rounded-full bg-white/60 shadow-[0_0_18px_rgba(255,255,255,0.55)]"
          initial={false}
          animate={
            reduceMotion
              ? { opacity: 0 }
              : {
                  opacity: [0, 0.85, 0],
                  y: currentY,
                }
          }
          transition={{
            duration: 1.6,
            repeat: reduceMotion ? 0 : Number.POSITIVE_INFINITY,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      )}
    </motion.div>
  );
}

function MetricInput({
  label,
  max,
  min,
  onChange,
  step,
  suffix,
  value,
}: {
  label: string;
  max?: number;
  min: number;
  onChange: (value: string) => void;
  step: number;
  suffix?: string;
  value: number;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] text-zinc-500 uppercase tracking-[0.1em]">{label}</span>
      <div className="flex h-9 items-center rounded-md border border-white/10 bg-black/30 focus-within:border-cyan-300/50">
        <input
          className="min-w-0 flex-1 bg-transparent px-3 text-[13px] text-zinc-100 outline-none"
          max={max}
          min={min}
          step={step}
          type="number"
          value={Number.isFinite(value) ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span className="pr-3 text-[11px] text-zinc-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

function EnergyParticles({ action, reduceMotion }: { action: DispatchAction; reduceMotion: boolean | null }) {
  if (action === "idle") {
    return (
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
        <div className="h-20 w-20 rounded-full border border-white/10 bg-white/[0.02]" />
      </div>
    );
  }
  const direction = action === "charge" ? 46 : -46;
  return (
    <div className="pointer-events-none absolute inset-x-4 top-1/2 h-16 -translate-y-1/2">
      {Array.from({ length: 5 }, (_, index) => (
        <motion.span
          // biome-ignore lint/suspicious/noArrayIndexKey: visual particles are stable decorative slots.
          key={index}
          className={`absolute top-1/2 size-1.5 rounded-full ${action === "charge" ? "bg-[var(--green)]" : "bg-[var(--amber)]"}`}
          initial={false}
          animate={
            reduceMotion
              ? { opacity: 0.35 }
              : {
                  opacity: [0, 0.95, 0],
                  x: action === "charge" ? [-direction, 0] : [0, -direction],
                  y: [0, index % 2 === 0 ? -10 : 10],
                }
          }
          transition={{
            duration: 1.25,
            delay: index * 0.16,
            repeat: reduceMotion ? 0 : Number.POSITIVE_INFINITY,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ left: `${18 + index * 16}%` }}
        />
      ))}
    </div>
  );
}

function buildAddedAssetSite(asset: AddedAsset): PortfolioSiteState {
  const template = BATTERY_TWIN_TEMPLATES.find((candidate) => candidate.profile.id === asset.templateId);
  const parameters = template?.parameters;
  const capacityMwh = asset.energyMwh ?? parameters?.contractedUsableEnergyMwh ?? 100;
  const powerMw = asset.powerMw ?? parameters?.ratedPowerMwAc ?? 50;
  const maxChargeMw = powerMw;
  const maxDischargeMw = powerMw;
  const minSocPct = asset.minSocPct ?? parameters?.minSocPct ?? 10;
  const maxSocPct = asset.maxSocPct ?? parameters?.maxSocPct ?? 90;
  const initialSocPct = asset.initialSocPct ?? parameters?.initialSocPct ?? 45;
  const minSocMwh = capacityMwh * (minSocPct / 100);
  const maxSocMwh = capacityMwh * (maxSocPct / 100);
  const initialSocMwh = capacityMwh * (initialSocPct / 100);
  const socPercent = ((initialSocMwh - minSocMwh) / (maxSocMwh - minSocMwh)) * 100;
  const config = {
    capacityMwh,
    maxChargeMw,
    maxDischargeMw,
    initialSocMwh,
    roundTripEfficiency: parameters?.roundTripEfficiencyAc ?? 0.88,
    minSocMwh,
    maxSocMwh,
    degradationCostEurPerMwh: parameters?.degradationCostEurPerMwhThroughput ?? 4,
  };

  return {
    id: asset.id,
    name: asset.name,
    region: asset.region,
    latitude: 39.07,
    longitude: 21.82,
    capacityMwh,
    maxChargeMw,
    maxDischargeMw,
    initialSocMwh,
    roundTripEfficiency: config.roundTripEfficiency,
    minSocMwh,
    maxSocMwh,
    degradationCostEurPerMwh: config.degradationCostEurPerMwh,
    constraint: "merchant",
    telemetryAction: "idle",
    telemetrySocPercent: Math.round(Math.max(0, Math.min(100, socPercent))),
    telemetryMwFactor: 0.5,
    config,
    current: null,
    schedule: [],
    summary: { valueEur: 0, chargeMwh: 0, dischargeMwh: 0 },
    socPercent: Math.max(0, Math.min(100, socPercent)),
  };
}

function buildAssetDraft(templateId: BatteryTwinTemplateId): AssetDraft {
  const template =
    BATTERY_TWIN_TEMPLATES.find((candidate) => candidate.profile.id === templateId) ??
    BATTERY_TWIN_TEMPLATES[0];
  const parameters = template?.parameters;
  return {
    name: template?.profile.name ?? "Local battery asset",
    region: template?.profile.region ?? template?.profile.country ?? "Greece",
    templateId: template?.profile.id ?? DEFAULT_TEMPLATE_ID,
    powerMw: parameters?.ratedPowerMwAc ?? 50,
    energyMwh: parameters?.contractedUsableEnergyMwh ?? 100,
    initialSocPct: parameters?.initialSocPct ?? 45,
    minSocPct: parameters?.minSocPct ?? 10,
    maxSocPct: parameters?.maxSocPct ?? 90,
  };
}

function clampPercent(value: number) {
  return clamp(Number.isFinite(value) ? value : 0, 0, 100);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function StatePill({ tone, value, label }: { tone: Tone; value: number; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${pillClass(tone)}`}>
      <span className="text-[15px] font-semibold">{value}</span>
      <span className="text-[11px] uppercase tracking-[0.08em]">{label}</span>
    </div>
  );
}

const CONTROL_COMMANDS: Array<{
  value: ManualOverrideCommand;
  label: string;
  icon: typeof RotateCcw;
}> = [
  { value: "auto", label: "Auto", icon: RotateCcw },
  { value: "charge", label: "Charge", icon: BatteryCharging },
  { value: "discharge", label: "Discharge", icon: Zap },
  { value: "idle", label: "Idle", icon: CirclePause },
];

function stateVisual(action: DispatchAction) {
  if (action === "charge") {
    return {
      icon: BatteryCharging,
      border: "border-green-300/30",
      badge: "border-green-300/20 bg-green-300/10 text-green-200",
      core: "border-green-200/25 bg-green-300/15 text-green-100",
      fill: "bg-[linear-gradient(180deg,rgba(74,222,128,0.95),rgba(20,184,166,0.72))]",
      text: "text-[var(--green)]",
      track: "bg-[linear-gradient(90deg,transparent,rgba(52,211,153,0.7),transparent)]",
    };
  }
  if (action === "discharge") {
    return {
      icon: Zap,
      border: "border-amber-300/35",
      badge: "border-amber-300/20 bg-amber-300/10 text-amber-200",
      core: "border-amber-200/25 bg-amber-300/15 text-amber-100",
      fill: "bg-[linear-gradient(180deg,rgba(251,191,36,0.95),rgba(245,158,11,0.68))]",
      text: "text-[var(--amber)]",
      track: "bg-[linear-gradient(90deg,transparent,rgba(245,158,11,0.7),transparent)]",
    };
  }
  return {
    icon: BatteryMedium,
    border: "border-white/10",
    badge: "border-white/10 bg-white/[0.04] text-zinc-300",
    core: "border-white/15 bg-white/[0.06] text-zinc-200",
    fill: "bg-[linear-gradient(180deg,rgba(161,161,170,0.86),rgba(82,82,91,0.58))]",
    text: "text-zinc-200",
    track: "bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)]",
  };
}

function pillClass(tone: Tone) {
  switch (tone) {
    case "green":
      return "border-green-300/20 bg-green-300/10 text-green-200";
    case "amber":
      return "border-amber-300/20 bg-amber-300/10 text-amber-200";
    default:
      return "border-white/10 bg-white/[0.04] text-zinc-300";
  }
}

function effectiveBatteryAction(site: PortfolioSiteState, override: ManualOverrideCommand | undefined) {
  return override && override !== "auto"
    ? override
    : (site.current?.action ?? site.telemetryAction ?? "idle");
}

function capitalizeAction(action: DispatchAction) {
  return action.charAt(0).toUpperCase() + action.slice(1);
}
