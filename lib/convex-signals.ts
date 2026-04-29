import type { ExternalSignalPanel } from "@/lib/types";
import { formatEurPerMwh } from "./format";

type SignalResult = {
  panels: ExternalSignalPanel[];
  siteUrl: string | null;
};

export async function loadExternalSignals(): Promise<SignalResult> {
  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? null;
  if (!siteUrl) {
    return {
      siteUrl,
      panels: [
        {
          label: "Convex signals",
          value: "Not linked",
          detail:
            "Set NEXT_PUBLIC_CONVEX_SITE_URL. Convex HTTP routes are not served from NEXT_PUBLIC_CONVEX_URL.",
          status: "missing",
        },
      ],
    };
  }

  const [weather, ttf, eex] = await Promise.allSettled([
    fetchJson(`${siteUrl}/weather/open-meteo/panel`),
    fetchJson(`${siteUrl}/fuel/ttf/latest`),
    fetchJson(`${siteUrl}/market/eex/context/latest`),
  ]);

  return {
    siteUrl,
    panels: [weatherPanel(weather), ttfPanel(ttf), eexPanel(eex)],
  };
}

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return await response.json();
}

function weatherPanel(result: PromiseSettledResult<any>): ExternalSignalPanel {
  if (result.status === "rejected") {
    return {
      label: "Weather",
      value: "Missing",
      detail: "Open-Meteo cache is not hydrated yet.",
      status: "missing",
    };
  }
  const nationalSeries = Array.isArray(result.value?.nationalSeries) ? result.value.nationalSeries : [];
  let latestNationalRow: Record<string, unknown> | null = null;
  for (let index = nationalSeries.length - 1; index >= 0; index -= 1) {
    const row = nationalSeries[index];
    if (typeof row?.solarAvailabilityScore === "number") {
      latestNationalRow = row;
      break;
    }
  }
  const score = latestNationalRow?.solarAvailabilityScore;
  return {
    label: "Weather",
    value: typeof score === "number" ? `${Math.round(score * 100)}% solar surplus` : "Cached",
    detail: result.value?.fetch?.fetchedAtUtc
      ? `Fetched ${result.value.fetch.fetchedAtUtc}`
      : "Open-Meteo panel ready",
    status: "cached",
  };
}

function ttfPanel(result: PromiseSettledResult<any>): ExternalSignalPanel {
  if (result.status === "rejected") {
    return {
      label: "TTF gas",
      value: "Missing",
      detail: "ICE TTF cache is not hydrated yet.",
      status: "missing",
    };
  }
  const value =
    result.value?.fetch?.fuelCostEurPerMwhElectric ?? result.value?.thermalProxy?.fuelCostEurPerMwhElectric;
  return {
    label: "TTF gas",
    value: formatEurPerMwh(value),
    detail: result.value?.selectedContract?.marketStrip ?? "Thermal fuel-cost proxy",
    status: "cached",
  };
}

function eexPanel(result: PromiseSettledResult<any>): ExternalSignalPanel {
  if (result.status === "rejected") {
    return {
      label: "EEX context",
      value: "Missing",
      detail: "EEX context cache is not hydrated yet.",
      status: "missing",
    };
  }
  const price =
    result.value?.fetch?.selectedGreekPowerPriceEurPerMwh ??
    result.value?.context?.fetch?.selectedGreekPowerPriceEurPerMwh;
  return {
    label: "EEX GR base",
    value: formatEurPerMwh(price),
    detail: result.value?.fetch?.selectedGreekPowerMaturity ?? "Greek forward context",
    status: "cached",
  };
}
