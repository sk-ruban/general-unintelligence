import { v } from "convex/values";
import { query } from "./_generated/server";
import { coverageFromFiles, dashboardFromSummaries, summarizePrices } from "./damSummary";

const SOURCE = "henex-dam";
const TIMEZONE = "Europe/Athens";
const DEFAULT_FILE_LIMIT = 200;
const DEFAULT_ROW_LIMIT = 5_000;
const MAX_ROW_LIMIT = 20_000;
const DEFAULT_PRICE_DAYS = 7;
const MAX_PRICE_DAYS = 45;
const DEFAULT_DASHBOARD_DAYS = 7;
const MAX_DASHBOARD_DAYS = 14;

type DateRange = {
  from: string;
  to: string;
  dates: string[];
};

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, Math.trunc(value as number)));
}

function requireDateKey(value: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD format`);
  }
  return value;
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new Error("Invalid DAM date range");
  }
  return Math.round((end - start) / 86_400_000) + 1;
}

function dateKeys(from: string, to: string, maxDays: number) {
  const count = daysBetween(from, to);
  if (count > maxDays) {
    throw new Error(`DAM query range may not exceed ${maxDays} days`);
  }
  return Array.from({ length: count }, (_, index) => addDays(from, index));
}

async function latestDamMarketDate(ctx: { db: any }) {
  const latest = await ctx.db.query("damFiles").withIndex("by_date").order("desc").first();
  return latest?.marketDate as string | undefined;
}

async function selectDateRange(
  ctx: { db: any },
  args: { date?: string; from?: string; to?: string },
  options: { defaultDays: number; maxDays: number },
): Promise<DateRange> {
  const selectedTo = requireDateKey(
    args.date ?? args.to ?? (await latestDamMarketDate(ctx)) ?? addDays(new Date().toISOString().slice(0, 10), 0),
    "to",
  );
  const selectedFrom = requireDateKey(args.date ?? args.from ?? addDays(selectedTo, -(options.defaultDays - 1)), "from");
  return {
    from: selectedFrom,
    to: selectedTo,
    dates: dateKeys(selectedFrom, selectedTo, options.maxDays),
  };
}

function compactFile(file: any) {
  return {
    id: file._id,
    sourceCode: file.sourceCode,
    sourceTitle: file.sourceTitle,
    marketDate: file.marketDate,
    filename: file.filename,
    extension: file.extension,
    sourceUrl: file.sourceUrl,
    localPath: file.localPath,
    bytes: file.bytes,
    sha256: file.sha256,
    parsedAtUtc: file.parsedAtUtc,
    rowCount: file.rowCount,
    status: file.status,
    errors: file.errors,
  };
}

function compactPriceInterval(row: any) {
  return {
    id: row._id,
    marketDate: row.marketDate,
    timestamp: row.timestamp,
    mtu: row.mtu,
    target: row.target,
    sourceCode: row.sourceCode,
    sourceFile: row.sourceFile,
    biddingZone: row.biddingZone,
    deliveryDurationMinutes: row.deliveryDurationMinutes,
    mcpEurPerMwh: row.mcpEurPerMwh,
    buyVolume: row.buyVolumeMw,
    sellVolume: row.sellVolumeMw,
    totalTrades: row.totalVolumeMw,
    sourceRowCount: 1,
    pubTime: row.pubTime,
    version: row.version,
    rowHash: row.rowHash,
  };
}

async function filesForRange(
  ctx: { db: any },
  args: { sourceCode?: string; from?: string; to?: string; status?: string; limit?: number },
) {
  const limit = boundedInteger(args.limit, DEFAULT_FILE_LIMIT, 1, 2_000);
  const from = args.from ? requireDateKey(args.from, "from") : undefined;
  const to = args.to ? requireDateKey(args.to, "to") : undefined;
  const files = args.sourceCode
    ? await ctx.db
        .query("damFiles")
        .withIndex("by_source_date", (q: any) => {
          let builder = q.eq("sourceCode", args.sourceCode);
          if (from) {
            builder = builder.gte("marketDate", from);
          }
          if (to) {
            builder = builder.lte("marketDate", to);
          }
          return builder;
        })
        .order("desc")
        .take(limit)
    : await ctx.db
        .query("damFiles")
        .withIndex("by_date", (q: any) => {
          let builder = q;
          if (from) {
            builder = builder.gte("marketDate", from);
          }
          if (to) {
            builder = builder.lte("marketDate", to);
          }
          return builder;
        })
        .order("desc")
        .take(limit);
  if (args.status === undefined) {
    return files;
  }
  return files.filter((file: any) => file.status === args.status);
}

async function priceIntervalsForDates(
  ctx: { db: any },
  dates: string[],
  args: { mtu?: number; biddingZone?: string; limit?: number },
) {
  const limit = boundedInteger(args.limit, DEFAULT_ROW_LIMIT, 1, MAX_ROW_LIMIT);
  const rows: any[] = [];
  for (const marketDate of dates) {
    if (rows.length >= limit) {
      break;
    }
    const remaining = limit - rows.length;
    const fetched: any[] =
      args.mtu !== undefined
        ? await ctx.db
            .query("damPriceIntervals")
            .withIndex("by_date_mtu", (q: any) => q.eq("marketDate", marketDate).eq("mtu", args.mtu))
            .take(Math.min(remaining, 1_000))
        : await ctx.db
            .query("damPriceIntervals")
            .withIndex("by_date", (q: any) => q.eq("marketDate", marketDate))
            .take(Math.min(remaining, 1_000));
    rows.push(...fetched.filter((row: any) => args.biddingZone === undefined || row.biddingZone === args.biddingZone));
  }
  return rows.slice(0, limit);
}

async function dailySummaryForDate(ctx: { db: any }, marketDate: string) {
  return await ctx.db
    .query("damDailySummaries")
    .withIndex("by_date", (q: any) => q.eq("marketDate", marketDate))
    .first();
}

async function summariesForDates(ctx: { db: any }, dates: string[]) {
  const summaries = [];
  for (const marketDate of dates) {
    const summary = await dailySummaryForDate(ctx, marketDate);
    if (!summary) {
      return null;
    }
    summaries.push(summary);
  }
  return summaries;
}

export const getDamCatalog = query({
  args: {
    includeRecentFiles: v.optional(v.boolean()),
    fileLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = boundedInteger(args.fileLimit, 500, 1, 1_000);
    const files = await ctx.db.query("damFiles").withIndex("by_date").order("desc").take(limit);
    const coverage = coverageFromFiles(files);
    return {
      source: SOURCE,
      timezone: TIMEZONE,
      coverage,
      filesIndexed: files.length,
      recentFiles: args.includeRecentFiles ? files.slice(0, DEFAULT_FILE_LIMIT).map(compactFile) : undefined,
      routes: ["/market/dam/catalog", "/market/dam/files", "/market/dam/prices", "/market/dam/dashboard"],
    };
  },
});

export const getDamFiles = query({
  args: {
    sourceCode: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const files = await filesForRange(ctx, args);
    return {
      source: SOURCE,
      count: files.length,
      files: files.map(compactFile),
    };
  },
});

export const getDamPrices = query({
  args: {
    date: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    mtu: v.optional(v.number()),
    biddingZone: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const range = await selectDateRange(ctx, args, { defaultDays: DEFAULT_PRICE_DAYS, maxDays: MAX_PRICE_DAYS });
    const summaryLimit = boundedInteger(args.limit, 10_000, 1, 20_000);
    const shouldUseSummaries = args.mtu === undefined && args.biddingZone === undefined;
    const summaries = shouldUseSummaries ? await summariesForDates(ctx, range.dates) : null;
    if (summaries) {
      const priceSeries = summaries.flatMap((summary) => summary.priceSeries ?? []).slice(0, summaryLimit);
      return {
        source: SOURCE,
        range: { from: range.from, to: range.to },
        count: priceSeries.length,
        spreadSummary: summarizePrices(priceSeries),
        rows: priceSeries,
        summaryMode: "precomputed",
      };
    }
    const priceIntervals = await priceIntervalsForDates(ctx, range.dates, { ...args, limit: summaryLimit });
    const priceSeries = priceIntervals.map(compactPriceInterval);
    return {
      source: SOURCE,
      range: { from: range.from, to: range.to },
      count: priceSeries.length,
      spreadSummary: summarizePrices(priceSeries),
      rows: priceSeries,
      summaryMode: "intervals",
    };
  },
});

export const getDamMarketResults = getDamPrices;

export const getDamAggregatedCurves = query({
  args: {
    date: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    mtu: v.optional(v.number()),
    side: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async () => {
    return {
      source: SOURCE,
      count: 0,
      rows: [],
      summaryMode: "not-seeded",
      caveat: "Raw aggregated curve rows are intentionally not stored in Convex. Seed derived curve metrics separately if needed.",
    };
  },
});

export const getDamDashboard = query({
  args: {
    date: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const range = await selectDateRange(ctx, args, { defaultDays: DEFAULT_DASHBOARD_DAYS, maxDays: MAX_DASHBOARD_DAYS });
    const summaries = await summariesForDates(ctx, range.dates);
    if (summaries) {
      return dashboardFromSummaries(range, summaries, SOURCE, TIMEZONE);
    }
    const [files, priceRows] = await Promise.all([
      filesForRange(ctx, { from: range.from, to: range.to, limit: 2_000 }),
      priceIntervalsForDates(ctx, range.dates, { limit: MAX_ROW_LIMIT }),
    ]);
    const priceSeries = priceRows.map(compactPriceInterval).slice(0, 2_000);
    const volumeSeries = priceSeries.map((point) => ({
      marketDate: point.marketDate,
      timestamp: point.timestamp,
      mtu: point.mtu,
      buyVolume: Number(point.buyVolume.toFixed(3)),
      sellVolume: Number(point.sellVolume.toFixed(3)),
      totalTrades: Number(point.totalTrades.toFixed(3)),
    }));
    return {
      source: SOURCE,
      timezone: TIMEZONE,
      range: { from: range.from, to: range.to },
      coverage: coverageFromFiles(files),
      priceSeries,
      spreadSummary: summarizePrices(priceSeries),
      volumeSeries,
      curveFragility: [],
      summaryMode: "intervals",
      caveats: [
        "DAM Results are stored as one compact interval row per market date, MTU, and bidding zone.",
        "Asset-level Results rows and raw aggregate curves are kept in local files, not Convex.",
      ],
    };
  },
});
