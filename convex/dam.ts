import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const SOURCE = "henex-dam";
const TIMEZONE = "Europe/Athens";
const DEFAULT_FILE_LIMIT = 200;
const DEFAULT_ROW_LIMIT = 5_000;
const MAX_ROW_LIMIT = 20_000;
const DEFAULT_PRICE_DAYS = 7;
const MAX_PRICE_DAYS = 45;
const DEFAULT_DASHBOARD_DAYS = 7;
const MAX_DASHBOARD_DAYS = 14;
const MAX_CURVE_ROWS_FOR_DASHBOARD = 50_000;

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
  row: v.any(),
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
  row: v.any(),
});

type DateRange = {
  from: string;
  to: string;
  dates: string[];
};

type PricePoint = {
  marketDate: string;
  timestamp: string;
  mtu: number;
  mcpEurPerMwh: number;
  buyVolume: number;
  sellVolume: number;
  totalTrades: number;
  sourceRowCount: number;
};

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, Math.trunc(value as number)));
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
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
    row: row.row,
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
    row: row.row,
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
  return args.status ? files.filter((file: any) => file.status === args.status) : files;
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
        : await ctx.db
            .query("damAggregatedCurves")
            .withIndex("by_date", (q: any) => q.eq("marketDate", marketDate))
            .take(Math.min(remaining, 10_000));
    rows.push(...fetched.filter((row: any) => args.side === undefined || row.side === args.side));
  }
  return rows.slice(0, limit);
}

function priceSeriesFromMarketResults(rows: any[], limit = 10_000) {
  const grouped = new Map<string, PricePoint>();
  for (const row of rows) {
    const price = numberValue(row.mcpEurPerMwh);
    if (price === undefined) {
      continue;
    }
    const key = `${row.marketDate}|${row.mtu}|${row.timestamp}`;
    const existing =
      grouped.get(key) ??
      ({
        marketDate: row.marketDate,
        timestamp: row.timestamp,
        mtu: row.mtu,
        mcpEurPerMwh: price,
        buyVolume: 0,
        sellVolume: 0,
        totalTrades: 0,
        sourceRowCount: 0,
      } satisfies PricePoint);
    const volume = numberValue(row.totalTrades) ?? 0;
    if (row.side === "Buy") {
      existing.buyVolume += volume;
    } else if (row.side === "Sell") {
      existing.sellVolume += volume;
    }
    existing.totalTrades = existing.buyVolume + existing.sellVolume;
    existing.sourceRowCount += 1;
    grouped.set(key, existing);
  }
  return Array.from(grouped.values())
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.mtu - right.mtu)
    .slice(0, limit);
}

function summarizePrices(priceSeries: PricePoint[]) {
  const prices = priceSeries.map((point) => point.mcpEurPerMwh).filter((value) => Number.isFinite(value));
  if (prices.length === 0) {
    return null;
  }
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const averagePrice = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const variance = prices.reduce((sum, value) => sum + (value - averagePrice) ** 2, 0) / prices.length;
  return {
    minPrice: Number(minPrice.toFixed(3)),
    maxPrice: Number(maxPrice.toFixed(3)),
    averagePrice: Number(averagePrice.toFixed(3)),
    dailySpread: Number((maxPrice - minPrice).toFixed(3)),
    volatility: Number(Math.sqrt(variance).toFixed(3)),
  };
}

function coverageFromFiles(files: any[]) {
  const sources: Record<string, { files: number; firstDate: string | null; lastDate: string | null; rows: number }> = {};
  const dates = new Set<string>();
  for (const file of files) {
    dates.add(file.marketDate);
    const current =
      sources[file.sourceCode] ??
      ({
        files: 0,
        firstDate: null,
        lastDate: null,
        rows: 0,
      } satisfies { files: number; firstDate: string | null; lastDate: string | null; rows: number });
    current.files += 1;
    current.rows += file.rowCount ?? 0;
    current.firstDate = current.firstDate === null || file.marketDate < current.firstDate ? file.marketDate : current.firstDate;
    current.lastDate = current.lastDate === null || file.marketDate > current.lastDate ? file.marketDate : current.lastDate;
    sources[file.sourceCode] = current;
  }
  const sortedDates = Array.from(dates).sort();
  return {
    marketDates: sortedDates.length,
    firstDate: sortedDates[0] ?? null,
    lastDate: sortedDates.at(-1) ?? null,
    sources,
  };
}

function curveFragility(curveRows: any[], priceSeries: PricePoint[], limit = 96) {
  const priceByKey = new Map(priceSeries.map((point) => [`${point.marketDate}|${point.mtu}`, point.mcpEurPerMwh]));
  const grouped = new Map<string, any[]>();
  for (const row of curveRows) {
    if (numberValue(row.quantity) === undefined || numberValue(row.unitPriceEurPerMwh) === undefined) {
      continue;
    }
    const key = `${row.marketDate}|${row.mtu}|${row.timestamp}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, limit)
    .map(([key, rows]) => {
      const [marketDate, rawMtu, timestamp] = key.split("|");
      const mtu = Number(rawMtu);
      const mcp = priceByKey.get(`${marketDate}|${mtu}`);
      const relevant = mcp === undefined ? rows : rows.filter((row) => Math.abs(row.unitPriceEurPerMwh - mcp) <= 25);
      const selected = relevant.length >= 4 ? relevant : rows;
      const quantities = selected.map((row) => numberValue(row.quantity)).filter((value): value is number => value !== undefined);
      const prices = selected.map((row) => numberValue(row.unitPriceEurPerMwh)).filter((value): value is number => value !== undefined);
      const quantityRange = quantities.length ? Math.max(...quantities) - Math.min(...quantities) : 0;
      const priceRange = prices.length ? Math.max(...prices) - Math.min(...prices) : 0;
      const slope = quantityRange <= 0 ? 1 : priceRange / quantityRange;
      const score = Number(clamp(slope / 0.05).toFixed(3));
      return {
        marketDate,
        timestamp,
        mtu,
        score,
        quantityRange: Number(quantityRange.toFixed(3)),
        priceRange: Number(priceRange.toFixed(3)),
        reason:
          score >= 0.75
            ? "Steep aggregated curve near the clearing price; small volume shifts may move price materially."
            : score >= 0.4
              ? "Moderate curve sensitivity around the clearing price."
              : "Broad curve depth around the clearing price.",
      };
    });
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
      await ctx.db.insert("damMarketResults", row);
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
      await ctx.db.insert("damAggregatedCurves", row);
      inserted += 1;
    }
    return { inserted, skipped };
  },
});

export const getDamCatalog = query({
  args: {
    includeRecentFiles: v.optional(v.boolean()),
    fileLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = boundedInteger(args.fileLimit, 1_500, 1, 3_000);
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
    const marketRows = await marketResultsForDates(ctx, range.dates, { limit: MAX_ROW_LIMIT });
    const priceSeries = priceSeriesFromMarketResults(marketRows, boundedInteger(args.limit, 10_000, 1, 20_000));
    return {
      source: SOURCE,
      range: { from: range.from, to: range.to },
      count: priceSeries.length,
      spreadSummary: summarizePrices(priceSeries),
      rows: priceSeries,
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
    const [files, marketRows, curveRows] = await Promise.all([
      filesForRange(ctx, { from: range.from, to: range.to, limit: 2_000 }),
      marketResultsForDates(ctx, range.dates, { limit: MAX_ROW_LIMIT }),
      curveRowsForDates(ctx, range.dates, { limit: MAX_CURVE_ROWS_FOR_DASHBOARD }),
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
      caveats: [
        "Phase 1 DAM dashboard data is seeded from local ENEX XLSX files, not a live Convex remote sync.",
        "Curve fragility is an MVP signal derived from aggregated curve steepness near the market clearing price.",
        "Battery dispatch signals and frontend composition are reserved for the next implementation stage.",
      ],
    };
  },
});
