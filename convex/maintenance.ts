import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const WEATHER_SOURCE = "open-meteo";
const TTF_SOURCE = "ice-delayed-product-guide";
const EEX_SOURCE = "eex-market-data-hub";

async function deleteByFetch(ctx: { db: any }, table: string, fetchId: unknown, batchSize: number) {
  const docs = await ctx.db
    .query(table)
    .withIndex("by_fetch", (q: any) => q.eq("fetchId", fetchId))
    .take(batchSize);
  for (const doc of docs) {
    await ctx.db.delete(doc._id);
  }
  return docs.length;
}

async function deleteWeatherByFetch(ctx: { db: any }, fetchId: unknown, batchSize: number) {
  const [national, regional, current] = await Promise.all([
    deleteByFetch(ctx, "weatherNationalSeries", fetchId, batchSize),
    ctx.db
      .query("weatherRegionalSeries")
      .withIndex("by_fetch_location", (q: any) => q.eq("fetchId", fetchId))
      .take(batchSize),
    ctx.db
      .query("weatherCurrentByLocation")
      .withIndex("by_fetch_location", (q: any) => q.eq("fetchId", fetchId))
      .take(batchSize),
  ]);
  for (const doc of regional) {
    await ctx.db.delete(doc._id);
  }
  for (const doc of current) {
    await ctx.db.delete(doc._id);
  }
  return national + regional.length + current.length;
}

async function pruneFetchFamily(
  ctx: { db: any },
  options: {
    fetchTable: string;
    source: string;
    keepLatest: number;
    batchSize: number;
    deleteChildren: (ctx: { db: any }, fetchId: unknown, batchSize: number) => Promise<number>;
  },
) {
  const recent = await ctx.db
    .query(options.fetchTable)
    .withIndex("by_source_fetchedAt", (q: any) => q.eq("source", options.source))
    .order("desc")
    .take(options.keepLatest);
  const cutoff = recent.at(-1)?.fetchedAtUtc;
  if (cutoff === undefined) {
    return { deletedFetches: 0, deletedChildren: 0, remainingKept: recent.length };
  }

  const expired = await ctx.db
    .query(options.fetchTable)
    .withIndex("by_source_fetchedAt", (q: any) => q.eq("source", options.source).lt("fetchedAtUtc", cutoff))
    .take(options.batchSize);
  let deletedChildren = 0;
  for (const fetchDoc of expired) {
    deletedChildren += await options.deleteChildren(ctx, fetchDoc._id, options.batchSize);
    await ctx.db.delete(fetchDoc._id);
  }
  return { deletedFetches: expired.length, deletedChildren, remainingKept: recent.length };
}

export const cleanupCachedFetchHistory = internalMutation({
  args: {
    weatherKeepLatest: v.optional(v.number()),
    ttfKeepLatest: v.optional(v.number()),
    eexKeepLatest: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, Math.min(Math.trunc(args.batchSize ?? 50), 200));
    const weatherKeepLatest = Math.max(1, Math.min(Math.trunc(args.weatherKeepLatest ?? 96), 1_000));
    const ttfKeepLatest = Math.max(1, Math.min(Math.trunc(args.ttfKeepLatest ?? 96), 1_000));
    const eexKeepLatest = Math.max(1, Math.min(Math.trunc(args.eexKeepLatest ?? 48), 1_000));

    const weather = await pruneFetchFamily(ctx, {
      fetchTable: "weatherFetches",
      source: WEATHER_SOURCE,
      keepLatest: weatherKeepLatest,
      batchSize,
      deleteChildren: deleteWeatherByFetch,
    });
    const ttf = await pruneFetchFamily(ctx, {
      fetchTable: "ttfFetches",
      source: TTF_SOURCE,
      keepLatest: ttfKeepLatest,
      batchSize,
      deleteChildren: async (innerCtx, fetchId, childBatchSize) =>
        (await deleteByFetch(innerCtx, "ttfContracts", fetchId, childBatchSize)) +
        (await deleteByFetch(innerCtx, "ttfIntradayBars", fetchId, childBatchSize)) +
        (await deleteByFetch(innerCtx, "ttfHistoricalBars", fetchId, childBatchSize)),
    });
    const eex = await pruneFetchFamily(ctx, {
      fetchTable: "eexFetches",
      source: EEX_SOURCE,
      keepLatest: eexKeepLatest,
      batchSize,
      deleteChildren: async (innerCtx, fetchId, childBatchSize) =>
        (await deleteByFetch(innerCtx, "eexGreekPowerInstruments", fetchId, childBatchSize)) +
        (await deleteByFetch(innerCtx, "eexGreekPowerTicker", fetchId, childBatchSize)) +
        (await deleteByFetch(innerCtx, "eexGreekPowerTableData", fetchId, childBatchSize)) +
        (await deleteByFetch(innerCtx, "eexEuaInstruments", fetchId, childBatchSize)) +
        (await deleteByFetch(innerCtx, "eexEuaTicker", fetchId, childBatchSize)),
    });

    return { weather, ttf, eex };
  },
});
