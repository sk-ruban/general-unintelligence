import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  coverageFromFiles,
  curveFragility,
  dashboardFromSummaries,
  priceSeriesFromMarketResults,
  summarizePrices,
} from "./damSummary";

const SOURCE = "henex-dam";
const TIMEZONE = "Europe/Athens";
const DEFAULT_FILE_LIMIT = 200;
const DEFAULT_ROW_LIMIT = 5_000;
const MAX_ROW_LIMIT = 20_000;
const DEFAULT_PRICE_DAYS = 7;
const MAX_PRICE_DAYS = 45;
const DEFAULT_DASHBOARD_DAYS = 7;
const MAX_DASHBOARD_DAYS = 14;
const MAX_CURVE_ROWS_FOR_SUMMARY = 8_000;

const damFileInput = v.object({
  sourceCode: v.string(),
  sourceTitle: v.string(),
  marketDate: v.string(),
  filename: v.string(),
  extension: v.string(),
  sourceUrl: v.string(),
  localPath: v.string(),
  bytes: v.number(),
  sha256: v.string(),
  parsedAtUtc: v.optional(v.string()),
  rowCount: v.optional(v.number()),
  status: v.string(),
  errors: v.optional(v.any()),
});

const damMarketResultInput = v.object({
  marketDate: v.string(),
  timestamp: v.string(),
  mtu: v.number(),
  target: v.string(),
  sourceCode: v.string(),
  sourceFile: v.string(),
  biddingZone: v.optional(v.string()),
  side: v.optional(v.string()),
  asset: v.optional(v.string()),
  classification: v.optional(v.string()),
  deliveryDurationMinutes: v.optional(v.number()),
  mcpEurPerMwh: v.optional(v.number()),
  totalTrades: v.optional(v.number()),
  pubTime: v.optional(v.string()),
  version: v.optional(v.number()),
  sheetName: v.optional(v.string()),
  rowHash: v.string(),
  row: v.optional(v.any()),
});

const damAggregatedCurveInput = v.object({
  marketDate: v.string(),
  timestamp: v.string(),
  mtu: v.number(),
  target: v.string(),
  sourceCode: v.string(),
  sourceFile: v.string(),
  side: v.optional(v.string()),
  deliveryDurationMinutes: v.optional(v.number()),
  pointOrder: v.optional(v.number()),
  quantity: v.optional(v.number()),
  unitPriceEurPerMwh: v.optional(v.number()),
  pubTime: v.optional(v.string()),
  version: v.optional(v.number()),
  sheetName: v.optional(v.string()),
  rowHash: v.string(),
  row: v.optional(v.any()),
});

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
  const selectedTo = requireDateKey(args.date ?? args.to ?? (await latestDamMarketDate(ctx)) ?? addDays(new Date().toISOString().slice(0, 10), 0), "to");
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

function compactMarketResult(row: any) {
  return {
    id: row._id,
    marketDate: row.marketDate,
    timestamp: row.timestamp,
    mtu: row.mtu,
    target: row.target,
    sourceCode: row.sourceCode,
    sourceFile: row.sourceFile,
    biddingZone: row.biddingZone,
    side: row.side,
    asset: row.asset,
    classification: row.classification,
    deliveryDurationMinutes: row.deliveryDurationMinutes,
    mcpEurPerMwh: row.mcpEurPerMwh,
    totalTrades: row.totalTrades,
    pubTime: row.pubTime,
    version: row.version,
    rowHash: row.rowHash,
  };
}

function compactCurve(row: any) {
  return {
    id: row._id,
    marketDate: row.marketDate,
    timestamp: row.timestamp,
    mtu: row.mtu,
    target: row.target,
    sourceCode: row.sourceCode,
    sourceFile: row.sourceFile,
    side: row.side,
    deliveryDurationMinutes: row.deliveryDurationMinutes,
    pointOrder: row.pointOrder,
    quantity: row.quantity,
    unitPriceEurPerMwh: row.unitPriceEurPerMwh,
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

async function marketResultsForDates(
  ctx: { db: any },
  dates: string[],
  args: {
    mtu?: number;
    side?: string;
    biddingZone?: string;
    asset?: string;
    classification?: string;
    limit?: number;
  },
) {
  const limit = boundedInteger(args.limit, DEFAULT_ROW_LIMIT, 1, MAX_ROW_LIMIT);
  const rows: any[] = [];
  for (const marketDate of dates) {
    if (rows.length >= limit) {
      break;
    }
    const remaining: number = limit - rows.length;
    const fetched: any[] =
      args.mtu !== undefined
        ? await ctx.db
            .query("damMarketResults")
            .withIndex("by_date_mtu", (q: any) => q.eq("marketDate", marketDate).eq("mtu", args.mtu))
            .take(Math.min(remaining, 5_000))
        : args.side !== undefined
          ? await ctx.db
              .query("damMarketResults")
              .withIndex("by_date_side", (q: any) => q.eq("marketDate", marketDate).eq("side", args.side))
              .take(Math.min(remaining, 5_000))
        : await ctx.db
            .query("damMarketResults")
            .withIndex("by_date", (q: any) => q.eq("marketDate", marketDate))
            .take(Math.min(remaining, 5_000));
    rows.push(
      ...fetched.filter((row: any) => {
        if (args.side !== undefined && row.side !== args.side) {
          return false;
        }
        if (args.biddingZone !== undefined && row.biddingZone !== args.biddingZone) {
          return false;
        }
        if (args.asset !== undefined && row.asset !== args.asset) {
          return false;
        }
        if (args.classification !== undefined && row.classification !== args.classification) {
          return false;
        }
        return true;
      }),
    );
  }
  return rows.slice(0, limit);
}

async function curveRowsForDates(
  ctx: { db: any },
  dates: string[],
  args: { mtu?: number; side?: string; limit?: number },
) {
  const limit = boundedInteger(args.limit, DEFAULT_ROW_LIMIT, 1, MAX_ROW_LIMIT);
  const rows: any[] = [];
  for (const marketDate of dates) {
    if (rows.length >= limit) {
      break;
    }
    const remaining: number = limit - rows.length;
    const fetched: any[] =
      args.mtu !== undefined
        ? await ctx.db
            .query("damAggregatedCurves")
            .withIndex("by_date_mtu", (q: any) => q.eq("marketDate", marketDate).eq("mtu", args.mtu))
            .take(Math.min(remaining, 10_000))
        : args.side !== undefined
          ? await ctx.db
              .query("damAggregatedCurves")
              .withIndex("by_date_side", (q: any) => q.eq("marketDate", marketDate).eq("side", args.side))
              .take(Math.min(remaining, 10_000))
        : await ctx.db
            .query("damAggregatedCurves")
            .withIndex("by_date", (q: any) => q.eq("marketDate", marketDate))
            .take(Math.min(remaining, 10_000));
    rows.push(...fetched.filter((row: any) => args.side === undefined || row.side === args.side));
  }
  return rows.slice(0, limit);
}

function omitRawRow<T extends { rowHash: string; sourceCode: string; sourceFile: string; marketDate: string; row?: unknown }>(
  row: T,
) {
  const { row: _rawRow, ...hotRow } = row;
  return hotRow;
}

async function storeRawRow(ctx: { db: any }, row: { rowHash: string; sourceCode: string; sourceFile: string; marketDate: string; row?: unknown }) {
  if (row.row === undefined) {
    return;
  }
  const existing = await ctx.db.query("damRawRows").withIndex("by_row_hash", (q: any) => q.eq("rowHash", row.rowHash)).first();
  if (existing) {
    return;
  }
  await ctx.db.insert("damRawRows", {
    rowHash: row.rowHash,
    sourceCode: row.sourceCode,
    sourceFile: row.sourceFile,
    marketDate: row.marketDate,
    row: row.row,
  });
}

async function dailySummaryForDate(ctx: { db: any }, marketDate: string) {
  return await ctx.db
    .query("damDailySummaries")
    .withIndex("by_date", (q: any) => q.eq("marketDate", marketDate))
    .first();
}

async function writeDamDailySummary(ctx: { db: any }, marketDate: string) {
  const files = await filesForRange(ctx, { from: marketDate, to: marketDate, limit: 500 });
  const marketRows = await marketResultsForDates(ctx, [marketDate], { limit: MAX_ROW_LIMIT });
  const curveRows = await curveRowsForDates(ctx, [marketDate], { limit: MAX_CURVE_ROWS_FOR_SUMMARY });
  const priceSeries = priceSeriesFromMarketResults(marketRows, 2_000);
  const volumeSeries = priceSeries.map((point) => ({
    marketDate: point.marketDate,
    timestamp: point.timestamp,
    mtu: point.mtu,
    buyVolume: Number(point.buyVolume.toFixed(3)),
    sellVolume: Number(point.sellVolume.toFixed(3)),
    totalTrades: Number(point.totalTrades.toFixed(3)),
  }));
  const summary = {
    marketDate,
    generatedAtUtc: new Date().toISOString(),
    source: SOURCE,
    timezone: TIMEZONE,
    coverage: coverageFromFiles(files),
    priceSeries,
    spreadSummary: summarizePrices(priceSeries),
    volumeSeries,
    curveFragility: curveFragility(curveRows, priceSeries),
    fileCount: files.length,
    marketRowCount: marketRows.length,
    curveRowCount: curveRows.length,
  };
  const existing = await dailySummaryForDate(ctx, marketDate);
  if (existing) {
    await ctx.db.patch(existing._id, summary);
    return { id: existing._id, updated: true };
  }
  const id = await ctx.db.insert("damDailySummaries", summary);
  return { id, updated: false };
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

export const recordDamIngestRun = mutation({
  args: {
    runId: v.string(),
    startedAtUtc: v.string(),
    completedAtUtc: v.optional(v.string()),
    sources: v.array(v.string()),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
    dryRun: v.boolean(),
    status: v.string(),
    filesParsed: v.number(),
    filesInserted: v.number(),
    filesSkipped: v.number(),
    rowsParsed: v.number(),
    rowsInserted: v.number(),
    rowsSkipped: v.number(),
    failedFiles: v.number(),
    errors: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("damIngestRuns").withIndex("by_runId", (q) => q.eq("runId", args.runId)).first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return { id: existing._id, updated: true };
    }
    const id = await ctx.db.insert("damIngestRuns", args);
    return { id, updated: false };
  },
});

export const storeDamFileBatch = mutation({
  args: {
    files: v.array(damFileInput),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    for (const file of args.files) {
      const bySha = await ctx.db.query("damFiles").withIndex("by_sha256", (q) => q.eq("sha256", file.sha256)).first();
      if (bySha) {
        skipped += 1;
        if (bySha.status !== file.status || bySha.rowCount !== file.rowCount || bySha.parsedAtUtc !== file.parsedAtUtc) {
          await ctx.db.patch(bySha._id, file);
          updated += 1;
        }
        continue;
      }
      const byFilename = await ctx.db
        .query("damFiles")
        .withIndex("by_filename", (q) => q.eq("filename", file.filename))
        .first();
      if (byFilename) {
        await ctx.db.patch(byFilename._id, file);
        updated += 1;
        continue;
      }
      await ctx.db.insert("damFiles", file);
      inserted += 1;
    }
    return { inserted, updated, skipped };
  },
});

export const storeDamMarketResultsBatch = mutation({
  args: {
    rows: v.array(damMarketResultInput),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let skipped = 0;
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("damMarketResults")
        .withIndex("by_row_hash", (q) => q.eq("rowHash", row.rowHash))
        .first();
      if (existing) {
        skipped += 1;
        continue;
      }
      await storeRawRow(ctx, row);
      await ctx.db.insert("damMarketResults", omitRawRow(row));
      inserted += 1;
    }
    return { inserted, skipped };
  },
});

export const storeDamAggregatedCurvesBatch = mutation({
  args: {
    rows: v.array(damAggregatedCurveInput),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let skipped = 0;
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("damAggregatedCurves")
        .withIndex("by_row_hash", (q) => q.eq("rowHash", row.rowHash))
        .first();
      if (existing) {
        skipped += 1;
        continue;
      }
      await storeRawRow(ctx, row);
      await ctx.db.insert("damAggregatedCurves", omitRawRow(row));
      inserted += 1;
    }
    return { inserted, skipped };
  },
});

export const recomputeDamDailySummary = mutation({
  args: {
    marketDate: v.string(),
  },
  handler: async (ctx, args) => {
    const marketDate = requireDateKey(args.marketDate, "marketDate");
    return await writeDamDailySummary(ctx, marketDate);
  },
});

export const recomputeDamDailySummaries = mutation({
  args: {
    marketDates: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const value of args.marketDates.slice(0, 50)) {
      const marketDate = requireDateKey(value, "marketDate");
      results.push(await writeDamDailySummary(ctx, marketDate));
    }
    return { count: results.length, results };
  },
});

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
      routes: [
        "/market/dam/catalog",
        "/market/dam/files",
        "/market/dam/prices",
        "/market/dam/results",
        "/market/dam/curves",
        "/market/dam/dashboard",
      ],
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

export const getDamMarketResults = query({
  args: {
    date: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    mtu: v.optional(v.number()),
    side: v.optional(v.string()),
    biddingZone: v.optional(v.string()),
    asset: v.optional(v.string()),
    classification: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const range = await selectDateRange(ctx, args, { defaultDays: DEFAULT_PRICE_DAYS, maxDays: MAX_PRICE_DAYS });
    const rows = await marketResultsForDates(ctx, range.dates, args);
    return {
      source: SOURCE,
      range: { from: range.from, to: range.to },
      count: rows.length,
      rows: rows.map(compactMarketResult),
    };
  },
});

export const getDamPrices = query({
  args: {
    date: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const range = await selectDateRange(ctx, args, { defaultDays: DEFAULT_PRICE_DAYS, maxDays: MAX_PRICE_DAYS });
    const summaryLimit = boundedInteger(args.limit, 10_000, 1, 20_000);
    const summaries = await summariesForDates(ctx, range.dates);
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
    const marketRows = await marketResultsForDates(ctx, range.dates, { limit: MAX_ROW_LIMIT });
    const priceSeries = priceSeriesFromMarketResults(marketRows, summaryLimit);
    return {
      source: SOURCE,
      range: { from: range.from, to: range.to },
      count: priceSeries.length,
      spreadSummary: summarizePrices(priceSeries),
      rows: priceSeries,
      summaryMode: "fallback-live",
    };
  },
});

export const getDamAggregatedCurves = query({
  args: {
    date: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    mtu: v.optional(v.number()),
    side: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const range = await selectDateRange(ctx, args, { defaultDays: 1, maxDays: 7 });
    const rows = await curveRowsForDates(ctx, range.dates, args);
    return {
      source: SOURCE,
      range: { from: range.from, to: range.to },
      count: rows.length,
      rows: rows.map(compactCurve),
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
    const [files, marketRows, curveRows] = await Promise.all([
      filesForRange(ctx, { from: range.from, to: range.to, limit: 2_000 }),
      marketResultsForDates(ctx, range.dates, { limit: MAX_ROW_LIMIT }),
      curveRowsForDates(ctx, range.dates, { limit: MAX_CURVE_ROWS_FOR_SUMMARY }),
    ]);
    const priceSeries = priceSeriesFromMarketResults(marketRows, 2_000);
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
      curveFragility: curveFragility(curveRows, priceSeries),
      summaryMode: "fallback-live",
      caveats: [
        "Phase 1 DAM dashboard data is seeded from local ENEX XLSX files, not a live Convex remote sync.",
        "Curve fragility is an MVP signal derived from aggregated curve steepness near the market clearing price.",
        "Battery dispatch signals and frontend composition are reserved for the next implementation stage.",
      ],
    };
  },
});
