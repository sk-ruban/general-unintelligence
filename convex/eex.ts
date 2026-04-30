import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";

const SOURCE = "eex-market-data-hub";
const TIMEZONE = "Europe/Athens";
const MARKET_DATA_BASE_URL = "https://api.eex-group.com/pub/market-data";
const CUSTOMISE_BASE_URL = "https://api.eex-group.com/pub/customise-widget";
const MARKET_DATA_HUB_URL = "https://www.eex.com/en/market-data/market-data-hub";
const USER_AGENT = "odyceo-hackathon-convex-eex/1.0";

const DEFAULT_MAX_AGE_MINUTES = 60;
const DEFAULT_GREEK_POWER_SHORT_CODE = "FFBM";
const DEFAULT_GREEK_POWER_PRODUCT = "Base";
const DEFAULT_GREEK_POWER_MATURITY_TYPE = "Month";

type FilterRow = {
  shortCode: string;
  maturity?: string;
  maturityType?: string;
  commodity: string;
  pricing: string;
  area: string;
  product: string;
  productSpecific?: string;
  displaySeason?: number;
  displayQuarter?: number;
  displayYear?: number;
  displayMonth?: number;
  displayWeek?: number;
  displayDay?: number;
  valuationMethod?: string;
  underlyingShortCode?: string;
  underlyingMaturity?: string;
  underlyingPricing?: string;
  underlyingMaturityType?: string;
};

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, Math.trunc(value as number)));
}

function eexHeaders() {
  return {
    Accept: "application/json,text/plain,*/*",
    Origin: "https://www.eex.com",
    Referer: "https://www.eex.com/",
    "User-Agent": USER_AGENT,
  };
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...eexHeaders(),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`EEX returned ${response.status} ${response.statusText} for ${url}`);
  }
  return await response.json();
}

function encodeScope(scope: Record<string, string>[]) {
  const json = JSON.stringify(scope);
  return btoa(json);
}

function filterScope(
  overrides: Partial<
    Record<"commodity" | "pricing" | "area" | "product" | "productSpecific" | "maturityType", string>
  >,
) {
  return [
    {
      commodity: overrides.commodity ?? "All",
      pricing: overrides.pricing ?? "All",
      area: overrides.area ?? "All",
      product: overrides.product ?? "All",
      productSpecific: overrides.productSpecific ?? "All",
      maturityType: overrides.maturityType ?? "All",
    },
  ];
}

function filterDataUrl(scope: Record<string, string>[]) {
  const encoded = encodeScope(scope);
  return {
    encoded,
    url: `${CUSTOMISE_BASE_URL}/filter-data-with-scope?data=${encodeURIComponent(encoded)}`,
  };
}

async function fetchFilterData(scope: Record<string, string>[]) {
  const { encoded, url } = filterDataUrl(scope);
  return await fetchJson(url, {
    method: "POST",
    body: new URLSearchParams({ data: encoded }),
  });
}

function normalizeRows(payload: unknown): FilterRow[] {
  if (payload === null || typeof payload !== "object") {
    throw new Error("EEX filter endpoint returned an unsupported response shape");
  }
  const source = payload as { header?: unknown; data?: unknown };
  if (!Array.isArray(source.header) || !Array.isArray(source.data)) {
    throw new Error("EEX filter endpoint returned no header/data arrays");
  }
  const header = source.header.map(String);
  return source.data
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => {
      const normalized: Record<string, unknown> = {};
      header.forEach((key, index) => {
        const value = row[index];
        if (value !== null && value !== undefined && value !== "") {
          normalized[key] = value;
        }
      });
      return normalized as FilterRow;
    });
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function latestMaturity(rows: FilterRow[], shortCode: string, requestedMaturity?: string) {
  // TODO: Replace lexicographic selection if EEX returns mixed labels like Apr 2026, Q3-2026, or Cal-27.
  const candidates = rows
    .filter((row) => row.shortCode === shortCode)
    .map((row) => row.maturity)
    .filter((value): value is string => value !== undefined)
    .sort();

  if (requestedMaturity && candidates.includes(requestedMaturity)) {
    return requestedMaturity;
  }
  return candidates.at(-1) ?? requestedMaturity;
}

function tickerUrl(params: {
  shortCode: string;
  area: string;
  product: string;
  commodity: string;
  pricing: string;
  maturity?: string;
}) {
  const search = new URLSearchParams({
    shortCode: params.shortCode,
    area: params.area,
    product: params.product,
    commodity: params.commodity,
    pricing: params.pricing,
    maturity: params.maturity ?? "undefined",
  });
  return `${MARKET_DATA_BASE_URL}/price-ticker?${search.toString()}`;
}

function tableDataUrl(params: {
  shortCode: string;
  commodity: string;
  pricing: string;
  area: string;
  product: string;
  maturity?: string;
  maturityType?: string;
  startDate: string;
  endDate: string;
}) {
  const search = new URLSearchParams({
    shortCode: params.shortCode,
    commodity: params.commodity,
    pricing: params.pricing,
    area: params.area,
    product: params.product,
    maturity: params.maturity ?? "undefined",
    startDate: params.startDate,
    endDate: params.endDate,
    maturityType: params.maturityType ?? "undefined",
    isRolling: "true",
  });
  return `${MARKET_DATA_BASE_URL}/table-data?${search.toString()}`;
}

function chartDataUrl(
  chart: "eod" | "intraday",
  params: {
    shortCode: string;
    commodity: string;
    pricing: string;
    area: string;
    product: string;
    maturity?: string;
    startDate: string;
    endDate?: string;
    underlyingShortCode?: string;
    underlyingMaturity?: string;
  },
) {
  const search = new URLSearchParams({
    commodity: params.commodity,
    pricing: params.pricing,
    area: params.area,
    product: params.product,
    maturity: params.maturity ?? "undefined",
    startDate: params.startDate,
    shortCode: params.shortCode,
  });
  if (chart === "eod" && params.endDate) {
    search.set("endDate", params.endDate);
  }
  if (params.underlyingShortCode) {
    search.set("underlyingShortCode", params.underlyingShortCode);
  }
  if (params.underlyingMaturity) {
    search.set("underlyingMaturity", params.underlyingMaturity);
  }
  return `${MARKET_DATA_BASE_URL}/chart/${chart}?${search.toString()}`;
}

function isoDateDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function tickerRows(payload: unknown) {
  if (payload === null || typeof payload !== "object") {
    return [];
  }
  const source = payload as { header?: unknown; data?: unknown };
  if (!Array.isArray(source.header) || !Array.isArray(source.data)) {
    return [];
  }
  const header = source.header.map(String);
  return source.data
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => {
      const normalized: Record<string, unknown> = {};
      header.forEach((key, index) => {
        normalized[key] = row[index];
      });
      return normalized;
    });
}

function firstTicker(payload: unknown) {
  return tickerRows(payload)[0] ?? null;
}

function tableRows(payload: unknown) {
  if (payload === null || typeof payload !== "object") {
    return { rows: [], units: {} };
  }
  const source = payload as { header?: unknown; data?: unknown; currency?: unknown; uOM?: unknown };
  if (!Array.isArray(source.header) || !Array.isArray(source.data)) {
    return { rows: [], units: {} };
  }
  const header = source.header.map(String);
  const rows = source.data
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => {
      const normalized: Record<string, unknown> = {};
      header.forEach((key, index) => {
        normalized[key] = row[index];
      });
      return normalized;
    });
  return {
    rows,
    units: {
      currency: source.currency,
      uOM: source.uOM,
    },
  };
}

function chartSeries(payload: unknown) {
  if (payload === null || typeof payload !== "object") {
    return {
      lastUpdate: null,
      currency: null,
      uOM: null,
      series: [],
    };
  }
  const source = payload as {
    lastUpdate?: unknown;
    currency?: unknown;
    uOM?: unknown;
    series?: unknown;
  };
  return {
    lastUpdate: source.lastUpdate ?? null,
    currency: source.currency ?? null,
    uOM: source.uOM ?? null,
    series: Array.isArray(source.series) ? source.series : [],
  };
}

function required(value: string | undefined, name: string) {
  if (value === undefined || value.trim() === "") {
    throw new Error(`EEX ${name} is required for this dataset`);
  }
  return value;
}

function eexScopeFromArgs(args: {
  commodity?: string;
  pricing?: string;
  area?: string;
  product?: string;
  productSpecific?: string;
  maturityType?: string;
}) {
  return filterScope({
    commodity: args.commodity ?? "POWER",
    pricing: args.pricing ?? "F",
    area: args.area ?? "GR",
    product: args.product ?? "All",
    productSpecific: args.productSpecific ?? "All",
    maturityType: args.maturityType ?? "All",
  });
}

function selectEuaInstrument(rows: FilterRow[]) {
  return (
    rows.find(
      (row) =>
        row.commodity === "ENVIRONMENTALS" &&
        row.pricing === "S" &&
        row.area === "EU" &&
        row.product === "EUA",
    ) ??
    rows.find((row) => row.commodity === "ENVIRONMENTALS" && row.area === "EU" && row.product === "EUA") ??
    null
  );
}

async function latestFetch(ctx: { db: any }) {
  return await ctx.db
    .query("eexFetches")
    .withIndex("by_source_fetchedAt", (q: any) => q.eq("source", SOURCE))
    .order("desc")
    .first();
}

async function dataForFetch(ctx: { db: any }, fetchDoc: any) {
  const [greekInstruments, greekTicker, greekTable, euaInstruments, euaTicker] = await Promise.all([
    ctx.db
      .query("eexGreekPowerInstruments")
      .withIndex("by_fetch", (q: any) => q.eq("fetchId", fetchDoc._id))
      .first(),
    ctx.db
      .query("eexGreekPowerTicker")
      .withIndex("by_fetch", (q: any) => q.eq("fetchId", fetchDoc._id))
      .first(),
    ctx.db
      .query("eexGreekPowerTableData")
      .withIndex("by_fetch", (q: any) => q.eq("fetchId", fetchDoc._id))
      .first(),
    ctx.db
      .query("eexEuaInstruments")
      .withIndex("by_fetch", (q: any) => q.eq("fetchId", fetchDoc._id))
      .first(),
    ctx.db
      .query("eexEuaTicker")
      .withIndex("by_fetch", (q: any) => q.eq("fetchId", fetchDoc._id))
      .first(),
  ]);

  return {
    fetch: fetchDoc,
    usage:
      "Context and scenario data for reports and LLM analysis. HEnEx DAM/intraday remains the dispatch-price source.",
    greekPower: {
      instruments: greekInstruments?.rows ?? [],
      ticker: greekTicker?.row ?? null,
      tableData: greekTable?.rows ?? [],
      units: greekTable?.units ?? {},
    },
    carbon: {
      instruments: euaInstruments?.rows ?? [],
      euaTicker: euaTicker?.row ?? null,
    },
  };
}

export const getLatestFetch = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await latestFetch(ctx);
  },
});

export const getLatestEexContext = query({
  args: {},
  handler: async (ctx) => {
    const fetchDoc = await latestFetch(ctx);
    if (!fetchDoc) {
      return null;
    }
    return await dataForFetch(ctx, fetchDoc);
  },
});

export const storeEexContext = internalMutation({
  args: {
    fetchedAtUtc: v.string(),
    sourceUrl: v.string(),
    greekPowerInstruments: v.any(),
    greekPowerTicker: v.any(),
    greekPowerTableRows: v.any(),
    greekPowerTableUnits: v.any(),
    selectedGreekPowerShortCode: v.string(),
    selectedGreekPowerMaturity: v.string(),
    selectedGreekPowerPriceEurPerMwh: v.optional(v.number()),
    euaInstruments: v.any(),
    euaTicker: v.any(),
    euaPriceEurPerTonne: v.optional(v.number()),
    health: v.any(),
  },
  handler: async (ctx, args) => {
    const fetchId = await ctx.db.insert("eexFetches", {
      source: SOURCE,
      fetchedAtUtc: args.fetchedAtUtc,
      sourceUrl: args.sourceUrl,
      timezone: TIMEZONE,
      greekPowerInstrumentCount: args.greekPowerInstruments.length,
      selectedGreekPowerShortCode: args.selectedGreekPowerShortCode,
      selectedGreekPowerMaturity: args.selectedGreekPowerMaturity,
      selectedGreekPowerPriceEurPerMwh: args.selectedGreekPowerPriceEurPerMwh,
      euaInstrumentCount: args.euaInstruments.length,
      euaPriceEurPerTonne: args.euaPriceEurPerTonne,
      health: args.health,
    });

    await ctx.db.insert("eexGreekPowerInstruments", {
      fetchId,
      source: SOURCE,
      rows: args.greekPowerInstruments,
    });
    await ctx.db.insert("eexGreekPowerTicker", {
      fetchId,
      source: SOURCE,
      row: args.greekPowerTicker,
    });
    await ctx.db.insert("eexGreekPowerTableData", {
      fetchId,
      source: SOURCE,
      rows: args.greekPowerTableRows,
      units: args.greekPowerTableUnits,
    });
    await ctx.db.insert("eexEuaInstruments", {
      fetchId,
      source: SOURCE,
      rows: args.euaInstruments,
    });
    await ctx.db.insert("eexEuaTicker", {
      fetchId,
      source: SOURCE,
      row: args.euaTicker,
    });

    return { fetchId };
  },
});

export const refreshEexContext = action({
  args: {
    force: v.optional(v.boolean()),
    maxAgeMinutes: v.optional(v.number()),
    greekPowerShortCode: v.optional(v.string()),
    greekPowerMaturity: v.optional(v.string()),
    lookbackDays: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const maxAgeMinutes = boundedInteger(args.maxAgeMinutes, DEFAULT_MAX_AGE_MINUTES, 0, 24 * 60);
    const lookbackDays = boundedInteger(args.lookbackDays, 7, 1, 45);
    const latest: any = await ctx.runQuery(internal.eex.getLatestFetch, {});

    if (!args.force && latest) {
      const ageMs = Date.now() - Date.parse(latest.fetchedAtUtc);
      if (Number.isFinite(ageMs) && ageMs < maxAgeMinutes * 60_000) {
        return {
          cache: "hit",
          fetchId: latest._id,
          fetchedAtUtc: latest.fetchedAtUtc,
          ageSeconds: Math.round(ageMs / 1000),
        };
      }
    }

    const greekPowerScope = filterScope({
      commodity: "POWER",
      pricing: "F",
      area: "GR",
      product: "All",
      productSpecific: "All",
      maturityType: "All",
    });
    const euaScope = filterScope({
      commodity: "ENVIRONMENTALS",
      area: "EU",
      product: "EUA",
      productSpecific: "All",
      maturityType: "All",
    });

    const [greekPowerPayload, euaPayload] = await Promise.all([
      fetchFilterData(greekPowerScope),
      fetchFilterData(euaScope),
    ]);
    const greekPowerInstruments = normalizeRows(greekPowerPayload);
    const euaInstruments = normalizeRows(euaPayload);

    const selectedGreekPowerShortCode = args.greekPowerShortCode ?? DEFAULT_GREEK_POWER_SHORT_CODE;
    const selectedGreekPowerMaturity =
      latestMaturity(greekPowerInstruments, selectedGreekPowerShortCode, args.greekPowerMaturity) ?? "";

    const greekTickerPayload = await fetchJson(
      tickerUrl({
        shortCode: selectedGreekPowerShortCode,
        area: "GR",
        product: DEFAULT_GREEK_POWER_PRODUCT,
        commodity: "POWER",
        pricing: "F",
        maturity: selectedGreekPowerMaturity,
      }),
    );
    const greekPowerTicker = firstTicker(greekTickerPayload);

    const tablePayload = await fetchJson(
      tableDataUrl({
        shortCode: selectedGreekPowerShortCode,
        commodity: "POWER",
        pricing: "F",
        area: "GR",
        product: DEFAULT_GREEK_POWER_PRODUCT,
        maturity: selectedGreekPowerMaturity,
        maturityType: DEFAULT_GREEK_POWER_MATURITY_TYPE,
        startDate: isoDateDaysAgo(lookbackDays),
        endDate: isoDateDaysAgo(0),
      }),
    );
    const greekPowerTable = tableRows(tablePayload);

    const euaInstrument = selectEuaInstrument(euaInstruments);
    let euaTicker: Record<string, unknown> | null = null;
    if (euaInstrument) {
      const euaTickerPayload = await fetchJson(
        tickerUrl({
          shortCode: euaInstrument.shortCode,
          area: euaInstrument.area,
          product: euaInstrument.product,
          commodity: euaInstrument.commodity,
          pricing: euaInstrument.pricing,
          maturity: euaInstrument.maturity,
        }),
      );
      euaTicker = firstTicker(euaTickerPayload);
    }

    const fetchedAtUtc = new Date().toISOString();
    const selectedGreekPowerPriceEurPerMwh = numberValue(greekPowerTicker?.settlPx);
    const euaPriceEurPerTonne = numberValue(euaTicker?.settlPx);
    const stored: any = await ctx.runMutation(internal.eex.storeEexContext, {
      fetchedAtUtc,
      sourceUrl: MARKET_DATA_HUB_URL,
      greekPowerInstruments,
      greekPowerTicker,
      greekPowerTableRows: greekPowerTable.rows,
      greekPowerTableUnits: greekPowerTable.units,
      selectedGreekPowerShortCode,
      selectedGreekPowerMaturity,
      selectedGreekPowerPriceEurPerMwh,
      euaInstruments,
      euaTicker,
      euaPriceEurPerTonne,
      health: {
        status: "ok",
        note: "EEX data is cached as context for reports, scenarios, and LLM analysis; HEnEx DAM/intraday remains the dispatch-price source.",
      },
    });

    return {
      cache: "miss",
      fetchId: stored.fetchId,
      fetchedAtUtc,
      selectedGreekPowerShortCode,
      selectedGreekPowerMaturity,
      selectedGreekPowerPriceEurPerMwh,
      greekPowerInstrumentCount: greekPowerInstruments.length,
      euaInstrumentCount: euaInstruments.length,
      euaPriceEurPerTonne,
    };
  },
});

export const queryEexMarketData = action({
  args: {
    dataset: v.union(
      v.literal("catalog"),
      v.literal("ticker"),
      v.literal("table"),
      v.literal("eod"),
      v.literal("intraday"),
    ),
    commodity: v.optional(v.string()),
    pricing: v.optional(v.string()),
    area: v.optional(v.string()),
    product: v.optional(v.string()),
    productSpecific: v.optional(v.string()),
    maturityType: v.optional(v.string()),
    maturity: v.optional(v.string()),
    shortCode: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    underlyingShortCode: v.optional(v.string()),
    underlyingMaturity: v.optional(v.string()),
  },
  handler: async (_ctx, args): Promise<Record<string, unknown>> => {
    const fetchedAtUtc = new Date().toISOString();

    if (args.dataset === "catalog") {
      const scope = eexScopeFromArgs(args);
      const { url } = filterDataUrl(scope);
      const payload = await fetchFilterData(scope);
      const rows = normalizeRows(payload);
      return {
        source: SOURCE,
        dataset: args.dataset,
        fetchedAtUtc,
        sourceUrl: url,
        scope,
        count: rows.length,
        rows,
      };
    }

    const shortCode = required(args.shortCode, "shortCode");
    const commodity = required(args.commodity, "commodity");
    const pricing = required(args.pricing, "pricing");
    const area = required(args.area, "area");
    const product = required(args.product, "product");
    const maturity = args.maturity;

    if (args.dataset === "ticker") {
      const url = tickerUrl({ shortCode, area, product, commodity, pricing, maturity });
      const payload = await fetchJson(url);
      const rows = tickerRows(payload);
      return {
        source: SOURCE,
        dataset: args.dataset,
        fetchedAtUtc,
        sourceUrl: url,
        rows,
        row: rows[0] ?? null,
      };
    }

    const startDate = args.startDate ?? isoDateDaysAgo(args.dataset === "intraday" ? 0 : 7);
    const endDate = args.endDate ?? isoDateDaysAgo(0);

    if (args.dataset === "table") {
      const url = tableDataUrl({
        shortCode,
        commodity,
        pricing,
        area,
        product,
        maturity,
        maturityType: args.maturityType,
        startDate,
        endDate,
      });
      const payload = await fetchJson(url);
      const table = tableRows(payload);
      return {
        source: SOURCE,
        dataset: args.dataset,
        fetchedAtUtc,
        sourceUrl: url,
        startDate,
        endDate,
        units: table.units,
        count: table.rows.length,
        rows: table.rows,
      };
    }

    const chart = args.dataset === "eod" ? "eod" : "intraday";
    const url = chartDataUrl(chart, {
      shortCode,
      commodity,
      pricing,
      area,
      product,
      maturity,
      startDate,
      endDate,
      underlyingShortCode: args.underlyingShortCode,
      underlyingMaturity: args.underlyingMaturity,
    });
    const payload = await fetchJson(url);
    return {
      source: SOURCE,
      dataset: args.dataset,
      fetchedAtUtc,
      sourceUrl: url,
      startDate,
      endDate: chart === "eod" ? endDate : undefined,
      ...chartSeries(payload),
    };
  },
});
