import { DateTime } from "luxon";
import type { BatterySignalResponse, BatteryTwinConfig, ExternalSignalPanel } from "@/lib/types";
import { getConvexSiteUrl } from "./convex-url";
import { formatEurPerMwh } from "./format";

const MARKET_TIME_ZONE = "Europe/Athens";

type SignalResult = {
  panels: ExternalSignalPanel[];
  siteUrl: string | null;
};

export async function loadExternalSignals(): Promise<SignalResult> {
  const siteUrl = getConvexSiteUrl();
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
    fetchHydratedJson(siteUrl, "/weather/open-meteo/panel", "/weather/open-meteo/refresh", {
      maxAgeMinutes: 60,
      forecastSteps: 96,
      pastSteps: 24,
    }),
    fetchHydratedJson(siteUrl, "/fuel/ttf/latest", "/fuel/ttf/refresh", {
      maxAgeMinutes: 60,
    }),
    fetchHydratedJson(siteUrl, "/market/eex/context/latest", "/market/eex/context/refresh", {
      maxAgeMinutes: 60,
    }),
  ]);

  return {
    siteUrl,
    panels: [weatherPanel(weather), ttfPanel(ttf), eexPanel(eex)],
  };
}

export async function loadBatterySignalEngine(args: {
  date: string;
  twin: Pick<BatteryTwinConfig, "initialSocMwh" | "minSocMwh" | "maxSocMwh">;
}): Promise<BatterySignalResponse | null> {
  const siteUrl = getConvexSiteUrl();
  if (!siteUrl || !args.date) {
    return null;
  }
  const searchParams = new URLSearchParams({
    date: args.date,
    initialSocMwh: String(args.twin.initialSocMwh),
    minSocMwh: String(args.twin.minSocMwh),
    maxSocMwh: String(args.twin.maxSocMwh),
  });
  return await fetchJson(`${siteUrl}/signals/intervals?${searchParams.toString()}`);
}

async function fetchHydratedJson(
  siteUrl: string,
  readPath: string,
  refreshPath: string,
  refreshBody: Record<string, unknown>,
) {
  const readUrl = `${siteUrl}${readPath}`;
  try {
    return await fetchJson(readUrl);
  } catch (readError) {
    await fetchJson(`${siteUrl}${refreshPath}`, {
      body: JSON.stringify(refreshBody),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    try {
      return await fetchJson(readUrl);
    } catch (retryError) {
      throw new Error(`${errorMessage(retryError)} after refresh attempt (${errorMessage(readError)})`);
    }
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = typeof payload?.error === "string" ? `: ${payload.error}` : "";
    } catch {
      detail = "";
    }
    throw new Error(`${url} returned ${response.status}${detail}`);
  }
  return await response.json();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function weatherPanel(result: PromiseSettledResult<any>): ExternalSignalPanel {
  if (result.status === "rejected") {
    return {
      label: "Weather",
      value: "Missing",
      detail: `Open-Meteo refresh failed: ${errorMessage(result.reason)}`,
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
      ? `Fetched ${formatSignalTime(result.value.fetch.fetchedAtUtc)}`
      : "Open-Meteo panel ready",
    status: "cached",
  };
}

function ttfPanel(result: PromiseSettledResult<any>): ExternalSignalPanel {
  if (result.status === "rejected") {
    return {
      label: "TTF gas",
      value: "Missing",
      detail: `ICE TTF refresh failed: ${errorMessage(result.reason)}`,
      status: "missing",
    };
  }
  const value =
    result.value?.fetch?.fuelCostEurPerMwhElectric ?? result.value?.thermalProxy?.fuelCostEurPerMwhElectric;
  return {
    label: "TTF gas",
    value: formatEurPerMwh(value),
    detail: result.value?.selectedContract?.marketStrip
      ? `ICE TTF selected futures strip: ${formatStripLabel(result.value.selectedContract.marketStrip)}`
      : "Thermal fuel-cost proxy",
    status: "cached",
  };
}

function eexPanel(result: PromiseSettledResult<any>): ExternalSignalPanel {
  if (result.status === "rejected") {
    return {
      label: "EEX context",
      value: "Missing",
      detail: `EEX refresh failed: ${errorMessage(result.reason)}`,
      status: "missing",
    };
  }
  const price =
    result.value?.fetch?.selectedGreekPowerPriceEurPerMwh ??
    result.value?.context?.fetch?.selectedGreekPowerPriceEurPerMwh;
  return {
    label: "EEX GR base",
    value: formatEurPerMwh(price),
    detail: result.value?.fetch?.selectedGreekPowerMaturity
      ? `EEX Greek power selected maturity: ${formatMaturityLabel(result.value.fetch.selectedGreekPowerMaturity)}`
      : "Greek forward context",
    status: "cached",
  };
}

function formatStripLabel(value: unknown) {
  if (typeof value !== "string") {
    return "selected strip";
  }
  const match = value.match(/^([A-Za-z]{3})(\d{2})$/);
  if (!match) {
    return value;
  }
  return `${match[1]} 20${match[2]}`;
}

function formatMaturityLabel(value: unknown) {
  if (typeof value !== "string") {
    return "selected maturity";
  }
  const match = value.match(/^(\d{4})(\d{2})$/);
  if (!match) {
    return value;
  }
  const parsed = DateTime.fromObject({ year: Number(match[1]), month: Number(match[2]), day: 1 });
  return parsed.isValid ? parsed.toFormat("LLL yyyy") : value;
}

function formatSignalTime(value: unknown) {
  if (typeof value !== "string") {
    return "recently";
  }
  const parsed = DateTime.fromISO(value, { zone: "utc" });
  if (!parsed.isValid) {
    return "recently";
  }
  return parsed.setZone(MARKET_TIME_ZONE).toFormat("dd LLL HH:mm 'Athens'");
}
