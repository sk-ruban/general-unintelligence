import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";

const SOURCE = "ice-delayed-product-guide";
const ICE_BASE_URL = "https://www.ice.com";
const SPEC_ID = 27996665;
const PRODUCT_ID = 4331;
const HUB_ID = 7979;
const USER_AGENT = "odyceo-hackathon-convex-ice-ttf/1.0";

const DEFAULT_MAX_AGE_MINUTES = 5;
const DEFAULT_EFFICIENCY = 0.55;

type ContractSelection = "front-month" | "highest-volume";
type Contract = {
  marketId: number;
  marketStrip: string;
  lastPrice?: number;
  change?: number;
  volume?: number;
  lastTimeUtc?: string;
  endDateUtc?: string;
};
type PricePoint = {
  timestampUtc: string;
  priceEurPerMwhGas: number;
};

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, Math.trunc(value as number)));
}

function boundedNumber(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, value as number));
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseIceLastTime(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) (AM|PM) GMT$/);
  if (!match) {
    return undefined;
  }
  const [, month, day, year, rawHour, minute, meridiem] = match;
  let hour = Number(rawHour);
  if (meridiem === "PM" && hour !== 12) {
    hour += 12;
  }
  if (meridiem === "AM" && hour === 12) {
    hour = 0;
  }
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), hour, Number(minute))).toISOString();
}

function parseEpochMs(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return new Date(value).toISOString();
}

function parseIceBarTime(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("ICE bar timestamp was not a string");
  }
  const parsed = Date.parse(`${value} GMT`);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Could not parse ICE bar timestamp: ${value}`);
  }
  return new Date(parsed).toISOString();
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      Referer: `${ICE_BASE_URL}/products/${SPEC_ID}/Dutch-TTF-Natural-Gas-Futures/data`,
      "User-Agent": USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`ICE returned ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

async function fetchContracts(): Promise<Contract[]> {
  const params = new URLSearchParams({
    productId: String(PRODUCT_ID),
    hubId: String(HUB_ID),
  });
  const rows = await fetchJson(
    `${ICE_BASE_URL}/marketdata/api/productguide/charting/contract-data?${params}`,
  );
  if (!Array.isArray(rows)) {
    throw new Error("ICE contract endpoint returned a non-list response");
  }
  return rows.map((row) => ({
    marketId: Number(row.marketId),
    marketStrip: String(row.marketStrip),
    lastPrice: numberValue(row.lastPrice),
    change: numberValue(row.change),
    volume: typeof row.volume === "number" ? row.volume : undefined,
    lastTimeUtc: parseIceLastTime(row.lastTime),
    endDateUtc: parseEpochMs(row.endDate),
  }));
}

function selectContract(contracts: Contract[], selection: ContractSelection, marketId?: number) {
  if (contracts.length === 0) {
    throw new Error("ICE returned no Dutch TTF contracts");
  }
  if (marketId !== undefined) {
    const match = contracts.find((contract) => contract.marketId === marketId);
    if (!match) {
      throw new Error(`marketId ${marketId} was not present in the current ICE contract list`);
    }
    return match;
  }
  if (selection === "highest-volume") {
    return contracts.reduce((best, contract) =>
      (contract.volume ?? 0) > (best.volume ?? 0) ? contract : best,
    );
  }
  return contracts[0];
}

async function fetchBars(marketId: number, kind: "intraday" | "historical", historicalSpan: string) {
  const path =
    kind === "intraday"
      ? "/marketdata/api/productguide/charting/data/current-day"
      : "/marketdata/api/productguide/charting/data/historical";
  const params =
    kind === "intraday"
      ? new URLSearchParams({ marketId: String(marketId) })
      : new URLSearchParams({ marketId: String(marketId), historicalSpan });
  const payload = await fetchJson(`${ICE_BASE_URL}${path}?${params}`);
  if (payload === null || typeof payload !== "object" || !Array.isArray(payload.bars)) {
    throw new Error("ICE chart endpoint returned no bars list");
  }
  return payload.bars.map((bar: unknown): PricePoint => {
    if (!Array.isArray(bar) || bar.length < 2) {
      throw new Error("ICE bar row had an unsupported shape");
    }
    return {
      timestampUtc: parseIceBarTime(bar[0]),
      priceEurPerMwhGas: Number(bar[1]),
    };
  });
}

function fuelCost(price: number | undefined, efficiency: number) {
  return price === undefined ? undefined : Number((price / efficiency).toFixed(3));
}

async function latestFetch(ctx: { db: any }) {
  return await ctx.db
    .query("ttfFetches")
    .withIndex("by_source_fetchedAt", (q: any) => q.eq("source", SOURCE))
    .order("desc")
    .first();
}

async function compatibleFetch(
  ctx: { db: any },
  contractSelection: string,
  requestedMarketId: number | undefined,
  historicalSpan: string,
  efficiency: number,
) {
  const recent = await ctx.db
    .query("ttfFetches")
    .withIndex("by_source_fetchedAt", (q: any) => q.eq("source", SOURCE))
    .order("desc")
    .take(100);
  return recent.find(
    (fetchDoc: any) =>
      fetchDoc.contractSelection === contractSelection &&
      fetchDoc.requestedMarketId === requestedMarketId &&
      fetchDoc.historicalSpan === historicalSpan &&
      fetchDoc.efficiency === efficiency,
  );
}

async function dataForFetch(ctx: { db: any }, fetchDoc: any) {
  const contracts = await ctx.db
    .query("ttfContracts")
    .withIndex("by_fetch", (q: any) => q.eq("fetchId", fetchDoc._id))
    .first();
  const intraday = await ctx.db
    .query("ttfIntradayBars")
    .withIndex("by_fetch", (q: any) => q.eq("fetchId", fetchDoc._id))
    .first();
  const historical = await ctx.db
    .query("ttfHistoricalBars")
    .withIndex("by_fetch", (q: any) => q.eq("fetchId", fetchDoc._id))
    .first();
  const selectedContract = contracts?.rows?.find(
    (contract: Contract) => contract.marketId === fetchDoc.selectedMarketId,
  );

  return {
    fetch: fetchDoc,
    instrument: {
      name: "Dutch TTF Natural Gas Futures",
      specId: SPEC_ID,
      productId: PRODUCT_ID,
      hubId: HUB_ID,
      unit: "EUR/MWh gas",
    },
    selectedContract,
    contracts: contracts?.rows ?? [],
    intradayBars: intraday?.rows ?? [],
    historicalBars: historical?.rows ?? [],
    thermalProxy: {
      efficiency: fetchDoc.efficiency,
      fuelCostEurPerMwhElectric: fetchDoc.fuelCostEurPerMwhElectric,
    },
  };
}

export const getLatestFetch = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await latestFetch(ctx);
  },
});

export const getCompatibleFetch = internalQuery({
  args: {
    contractSelection: v.string(),
    requestedMarketId: v.optional(v.number()),
    historicalSpan: v.string(),
    efficiency: v.number(),
  },
  handler: async (ctx, args) => {
    return await compatibleFetch(
      ctx,
      args.contractSelection,
      args.requestedMarketId,
      args.historicalSpan,
      args.efficiency,
    );
  },
});

export const getTtfByFetchId = query({
  args: {
    fetchId: v.id("ttfFetches"),
    includeContracts: v.optional(v.boolean()),
    includeIntraday: v.optional(v.boolean()),
    includeHistorical: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const fetchDoc = await ctx.db.get(args.fetchId);
    if (!fetchDoc) {
      return null;
    }
    const data = await dataForFetch(ctx, fetchDoc);
    return {
      fetch: data.fetch,
      instrument: data.instrument,
      selectedContract: data.selectedContract,
      thermalProxy: data.thermalProxy,
      contracts: args.includeContracts ? data.contracts : undefined,
      intradayBars: args.includeIntraday ? data.intradayBars : undefined,
      historicalBars: args.includeHistorical ? data.historicalBars : undefined,
    };
  },
});

export const getLatestTtf = query({
  args: {},
  handler: async (ctx) => {
    const fetchDoc = await latestFetch(ctx);
    if (!fetchDoc) {
      return null;
    }
    return await dataForFetch(ctx, fetchDoc);
  },
});

export const getContracts = query({
  args: {},
  handler: async (ctx) => {
    const fetchDoc = await latestFetch(ctx);
    if (!fetchDoc) {
      return null;
    }
    const data = await dataForFetch(ctx, fetchDoc);
    return {
      fetch: data.fetch,
      instrument: data.instrument,
      selectedContract: data.selectedContract,
      contracts: data.contracts,
    };
  },
});

export const getIntraday = query({
  args: {
    fetchId: v.optional(v.id("ttfFetches")),
  },
  handler: async (ctx, args) => {
    const fetchDoc = args.fetchId ? await ctx.db.get(args.fetchId) : await latestFetch(ctx);
    if (!fetchDoc) {
      return null;
    }
    const data = await dataForFetch(ctx, fetchDoc);
    return {
      fetch: data.fetch,
      instrument: data.instrument,
      selectedContract: data.selectedContract,
      intradayBars: data.intradayBars,
    };
  },
});

export const getHistorical = query({
  args: {
    fetchId: v.optional(v.id("ttfFetches")),
  },
  handler: async (ctx, args) => {
    const fetchDoc = args.fetchId ? await ctx.db.get(args.fetchId) : await latestFetch(ctx);
    if (!fetchDoc) {
      return null;
    }
    const data = await dataForFetch(ctx, fetchDoc);
    return {
      fetch: data.fetch,
      instrument: data.instrument,
      selectedContract: data.selectedContract,
      historicalBars: data.historicalBars,
    };
  },
});

export const getDashboardPanel = query({
  args: {},
  handler: async (ctx) => {
    const fetchDoc = await latestFetch(ctx);
    if (!fetchDoc) {
      return null;
    }
    return {
      ...(await dataForFetch(ctx, fetchDoc)),
      panel: {
        title: "Dutch TTF Natural Gas",
        description: "Delayed ICE product-guide data cached through Convex for the dashboard.",
        cards: ["currentPrice", "fuelCostProxy", "forwardCurve", "intradayTrend", "dataFreshness"],
      },
    };
  },
});

export const storeTtf = internalMutation({
  args: {
    fetchedAtUtc: v.string(),
    sourceUrl: v.string(),
    contractSelection: v.string(),
    requestedMarketId: v.optional(v.number()),
    selectedContract: v.any(),
    contracts: v.any(),
    intradayBars: v.any(),
    historicalBars: v.any(),
    historicalSpan: v.string(),
    efficiency: v.number(),
    health: v.any(),
  },
  handler: async (ctx, args) => {
    const cost = fuelCost(args.selectedContract.lastPrice, args.efficiency);
    const fetchId = await ctx.db.insert("ttfFetches", {
      source: SOURCE,
      fetchedAtUtc: args.fetchedAtUtc,
      sourceUrl: args.sourceUrl,
      contractSelection: args.contractSelection,
      requestedMarketId: args.requestedMarketId,
      selectedMarketId: args.selectedContract.marketId,
      selectedMarketStrip: args.selectedContract.marketStrip,
      priceEurPerMwhGas: args.selectedContract.lastPrice,
      efficiency: args.efficiency,
      fuelCostEurPerMwhElectric: cost,
      historicalSpan: args.historicalSpan,
      contractCount: args.contracts.length,
      intradayPointCount: args.intradayBars.length,
      historicalPointCount: args.historicalBars.length,
      health: args.health,
    });
    await ctx.db.insert("ttfContracts", { fetchId, source: SOURCE, rows: args.contracts });
    await ctx.db.insert("ttfIntradayBars", { fetchId, source: SOURCE, rows: args.intradayBars });
    await ctx.db.insert("ttfHistoricalBars", { fetchId, source: SOURCE, rows: args.historicalBars });
    return { fetchId, fuelCostEurPerMwhElectric: cost };
  },
});

export const refreshIceTtf = action({
  args: {
    force: v.optional(v.boolean()),
    maxAgeMinutes: v.optional(v.number()),
    contractSelection: v.optional(v.string()),
    marketId: v.optional(v.number()),
    historicalSpan: v.optional(v.string()),
    efficiency: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const maxAgeMinutes = boundedInteger(args.maxAgeMinutes, DEFAULT_MAX_AGE_MINUTES, 0, 24 * 60);
    const contractSelection: ContractSelection =
      args.contractSelection === "highest-volume" ? "highest-volume" : "front-month";
    const marketId =
      args.marketId === undefined
        ? undefined
        : boundedInteger(args.marketId, args.marketId, 1, Number.MAX_SAFE_INTEGER);
    const requestedHistoricalSpan = args.historicalSpan;
    const historicalSpan =
      requestedHistoricalSpan && ["1", "2", "3"].includes(requestedHistoricalSpan)
        ? requestedHistoricalSpan
        : "1";
    const efficiency = boundedNumber(args.efficiency, DEFAULT_EFFICIENCY, 0.1, 1);
    const latest: any = await ctx.runQuery(internal.iceTtf.getCompatibleFetch, {
      contractSelection,
      requestedMarketId: marketId,
      historicalSpan,
      efficiency,
    });

    if (!args.force && latest) {
      const ageMs = Date.now() - Date.parse(latest.fetchedAtUtc);
      const compatible =
        latest.contractSelection === contractSelection &&
        latest.requestedMarketId === marketId &&
        latest.historicalSpan === historicalSpan &&
        latest.efficiency === efficiency;
      if (compatible && Number.isFinite(ageMs) && ageMs < maxAgeMinutes * 60_000) {
        return {
          cache: "hit",
          fetchId: latest._id,
          fetchedAtUtc: latest.fetchedAtUtc,
          ageSeconds: Math.round(ageMs / 1000),
        };
      }
    }

    const sourceUrl = `${ICE_BASE_URL}/products/${SPEC_ID}/Dutch-TTF-Natural-Gas-Futures/data`;
    const contracts = await fetchContracts();
    const selectedContract = selectContract(contracts, contractSelection, marketId);
    if (!selectedContract) {
      throw new Error("ICE returned no selectable Dutch TTF contract");
    }
    const [intradayBars, historicalBars] = await Promise.all([
      fetchBars(selectedContract.marketId, "intraday", historicalSpan),
      fetchBars(selectedContract.marketId, "historical", historicalSpan),
    ]);
    const fetchedAtUtc = new Date().toISOString();
    const stored: any = await ctx.runMutation(internal.iceTtf.storeTtf, {
      fetchedAtUtc,
      sourceUrl,
      contractSelection,
      requestedMarketId: marketId,
      selectedContract,
      contracts,
      intradayBars,
      historicalBars,
      historicalSpan,
      efficiency,
      health: {
        status: "ok",
        cacheable: true,
        caveat: "ICE website-delayed endpoint for hackathon demo use; not a licensed production feed.",
      },
    });

    return {
      cache: "miss",
      fetchId: stored.fetchId,
      fetchedAtUtc,
      marketId: selectedContract.marketId,
      marketStrip: selectedContract.marketStrip,
      priceEurPerMwhGas: selectedContract.lastPrice,
      fuelCostEurPerMwhElectric: stored.fuelCostEurPerMwhElectric,
      contractCount: contracts.length,
      intradayPointCount: intradayBars.length,
      historicalPointCount: historicalBars.length,
    };
  },
});
