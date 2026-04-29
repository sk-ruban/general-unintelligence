import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const batteryTwinArgs = {
  name: v.string(),
  capacityMwh: v.number(),
  maxChargeMw: v.number(),
  maxDischargeMw: v.number(),
  roundTripEfficiency: v.number(),
  minSocMwh: v.number(),
  maxSocMwh: v.number(),
  initialSocMwh: v.number(),
  degradationCostEurPerMwh: v.number(),
};

export const listBatteryTwins = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("batteryTwins")
      .withIndex("by_updatedAt")
      .order("desc")
      .take(args.limit ?? 20);
  },
});

export const saveBatteryTwin = mutation({
  args: {
    id: v.optional(v.id("batteryTwins")),
    ...batteryTwinArgs,
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const { id, ...values } = args;
    if (id) {
      await ctx.db.patch(id, { ...values, updatedAtUtc: now });
      return id;
    }
    return await ctx.db.insert("batteryTwins", {
      ...values,
      createdAtUtc: now,
      updatedAtUtc: now,
    });
  },
});

export const listSavedScenarios = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("savedScenarios")
      .withIndex("by_updatedAt")
      .order("desc")
      .take(args.limit ?? 20);
  },
});

export const saveScenario = mutation({
  args: {
    id: v.optional(v.id("savedScenarios")),
    name: v.string(),
    description: v.optional(v.string()),
    marketDate: v.string(),
    batteryTwinId: v.optional(v.id("batteryTwins")),
    assumptions: v.any(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const { id, ...values } = args;
    if (id) {
      await ctx.db.patch(id, { ...values, updatedAtUtc: now });
      return id;
    }
    return await ctx.db.insert("savedScenarios", {
      ...values,
      createdAtUtc: now,
      updatedAtUtc: now,
    });
  },
});

export const recordRun = mutation({
  args: {
    scenarioId: v.optional(v.id("savedScenarios")),
    batteryTwinId: v.optional(v.id("batteryTwins")),
    marketDate: v.string(),
    status: v.string(),
    summary: v.any(),
    dispatch: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("runHistory", {
      ...args,
      createdAtUtc: new Date().toISOString(),
    });
  },
});
