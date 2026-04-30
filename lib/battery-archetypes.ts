import type { BatteryTwinTemplateId, OptimizerBatteryConstraints } from "@/lib/battery-twin";
import type { SystemTwinSpec } from "@/lib/contracts";
import type { BatteryTwinConfig } from "@/lib/types";

export const batteryArchetypes = {
  metlen_karatzis_thessaly: {
    name: "METLEN-Karatzis Thessaly",
    power_mw: 330,
    contracted_energy_mwh: 790,
    nameplate_energy_mwh: null,
    duration_hours: 2.39,
    rte_pct: 88,
    soc_min_pct: 10,
    soc_max_pct: 90,
    reserve_soc_pct: 5,
    max_cycles_per_day: 1.5,
    warranty_throughput_mwh: null,
    aux_load_kw: { active: 900, standby: 120 },
    thermal_derating: [
      { temp_c: 25, derate_pu: 1 },
      { temp_c: 35, derate_pu: 0.96 },
      { temp_c: 45, derate_pu: 0.9 },
    ],
    confidence: {
      power_mw: "high",
      contracted_energy_mwh: "high",
      nameplate_energy_mwh: "unknown",
      rte_pct: "medium",
      soc_window: "medium",
      aux_load_kw: "low",
      warranty_throughput_mwh: "unknown",
    },
  },
  ppc_amyntaio_trina: {
    name: "PPC Amyntaio Trina",
    power_mw: 98,
    contracted_energy_mwh: 196,
    nameplate_energy_mwh: 196,
    duration_hours: 2,
    rte_pct: 88,
    soc_min_pct: 10,
    soc_max_pct: 90,
    reserve_soc_pct: 5,
    max_cycles_per_day: 1.5,
    warranty_throughput_mwh: null,
    aux_load_kw: { active: 280, standby: 45 },
    thermal_derating: [
      { temp_c: 25, derate_pu: 1 },
      { temp_c: 35, derate_pu: 0.96 },
      { temp_c: 45, derate_pu: 0.9 },
    ],
    confidence: {
      power_mw: "medium",
      contracted_energy_mwh: "medium",
      nameplate_energy_mwh: "medium",
      rte_pct: "medium",
      soc_window: "medium",
      aux_load_kw: "low",
      warranty_throughput_mwh: "unknown",
    },
  },
} satisfies Record<string, SystemTwinSpec>;

export type BatteryArchetypeSlug = keyof typeof batteryArchetypes;

export function batteryArchetypeSlugForTemplate(
  templateId: BatteryTwinTemplateId,
): BatteryArchetypeSlug | null {
  const slug = templateId.replaceAll("-", "_");
  return slug in batteryArchetypes ? (slug as BatteryArchetypeSlug) : null;
}

export function twinConfigForTemplate(
  templateId: BatteryTwinTemplateId,
  fallback: BatteryTwinConfig,
): BatteryTwinConfig {
  const slug = batteryArchetypeSlugForTemplate(templateId);
  return slug ? twinConfigFromArchetype(batteryArchetypes[slug]) : fallback;
}

export function twinConfigFromArchetype(archetype: SystemTwinSpec): BatteryTwinConfig {
  return {
    capacityMwh: archetype.contracted_energy_mwh,
    maxChargeMw: archetype.power_mw,
    maxDischargeMw: archetype.power_mw,
    roundTripEfficiency: archetype.rte_pct / 100,
    minSocMwh: archetype.contracted_energy_mwh * (archetype.soc_min_pct / 100),
    maxSocMwh: archetype.contracted_energy_mwh * (archetype.soc_max_pct / 100),
    initialSocMwh: archetype.contracted_energy_mwh * 0.5,
    degradationCostEurPerMwh: 4,
  };
}

export function optimizerConstraintsForTemplate(
  templateId: BatteryTwinTemplateId,
  fallback: OptimizerBatteryConstraints,
): OptimizerBatteryConstraints {
  const slug = batteryArchetypeSlugForTemplate(templateId);
  if (!slug) {
    return fallback;
  }

  const archetype = batteryArchetypes[slug];
  const config = twinConfigFromArchetype(archetype);
  const efficiency = Math.sqrt(config.roundTripEfficiency);

  return {
    ...config,
    availabilityDerate: 1,
    chargeEfficiency: Number(efficiency.toFixed(5)),
    dischargeEfficiency: Number(efficiency.toFixed(5)),
    maxCyclesPerDay: archetype.max_cycles_per_day,
    reserveSocMwh: archetype.contracted_energy_mwh * (archetype.reserve_soc_pct / 100),
    terminalSocPolicy: "equal-start",
  };
}
