import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  weatherFetches: defineTable({
    source: v.string(),
    fetchedAtUtc: v.string(),
    sourceUrl: v.string(),
    timezone: v.string(),
    resolution: v.string(),
    resolutionSource: v.string(),
    forecastSteps: v.number(),
    pastSteps: v.number(),
    locationCount: v.number(),
    nationalPointCount: v.number(),
    firstTimestamp: v.optional(v.string()),
    lastTimestamp: v.optional(v.string()),
    units: v.any(),
    health: v.any(),
  }).index("by_source_fetchedAt", ["source", "fetchedAtUtc"]),

  weatherCurrentByLocation: defineTable({
    fetchId: v.id("weatherFetches"),
    source: v.string(),
    locationId: v.string(),
    locationName: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    weight: v.number(),
    values: v.any(),
  }).index("by_fetch_location", ["fetchId", "locationId"]),

  weatherNationalSeries: defineTable({
    fetchId: v.id("weatherFetches"),
    source: v.string(),
    rows: v.any(),
  }).index("by_fetch", ["fetchId"]),

  weatherRegionalSeries: defineTable({
    fetchId: v.id("weatherFetches"),
    source: v.string(),
    locationId: v.string(),
    locationName: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    weight: v.number(),
    rows: v.any(),
  }).index("by_fetch_location", ["fetchId", "locationId"]),

  ttfFetches: defineTable({
    source: v.string(),
    fetchedAtUtc: v.string(),
    sourceUrl: v.string(),
    contractSelection: v.string(),
    requestedMarketId: v.optional(v.number()),
    selectedMarketId: v.number(),
    selectedMarketStrip: v.string(),
    priceEurPerMwhGas: v.optional(v.number()),
    efficiency: v.number(),
    fuelCostEurPerMwhElectric: v.optional(v.number()),
    historicalSpan: v.string(),
    contractCount: v.number(),
    intradayPointCount: v.number(),
    historicalPointCount: v.number(),
    health: v.any(),
  }).index("by_source_fetchedAt", ["source", "fetchedAtUtc"]),

  ttfContracts: defineTable({
    fetchId: v.id("ttfFetches"),
    source: v.string(),
    rows: v.any(),
  }).index("by_fetch", ["fetchId"]),

  ttfIntradayBars: defineTable({
    fetchId: v.id("ttfFetches"),
    source: v.string(),
    rows: v.any(),
  }).index("by_fetch", ["fetchId"]),

  ttfHistoricalBars: defineTable({
    fetchId: v.id("ttfFetches"),
    source: v.string(),
    rows: v.any(),
  }).index("by_fetch", ["fetchId"]),

  eexFetches: defineTable({
    source: v.string(),
    fetchedAtUtc: v.string(),
    sourceUrl: v.string(),
    timezone: v.string(),
    greekPowerInstrumentCount: v.number(),
    selectedGreekPowerShortCode: v.string(),
    selectedGreekPowerMaturity: v.string(),
    selectedGreekPowerPriceEurPerMwh: v.optional(v.number()),
    euaInstrumentCount: v.number(),
    euaPriceEurPerTonne: v.optional(v.number()),
    health: v.any(),
  }).index("by_source_fetchedAt", ["source", "fetchedAtUtc"]),

  eexGreekPowerInstruments: defineTable({
    fetchId: v.id("eexFetches"),
    source: v.string(),
    rows: v.any(),
  }).index("by_fetch", ["fetchId"]),

  eexGreekPowerTicker: defineTable({
    fetchId: v.id("eexFetches"),
    source: v.string(),
    row: v.any(),
  }).index("by_fetch", ["fetchId"]),

  eexGreekPowerTableData: defineTable({
    fetchId: v.id("eexFetches"),
    source: v.string(),
    rows: v.any(),
    units: v.any(),
  }).index("by_fetch", ["fetchId"]),

  eexEuaInstruments: defineTable({
    fetchId: v.id("eexFetches"),
    source: v.string(),
    rows: v.any(),
  }).index("by_fetch", ["fetchId"]),

  eexEuaTicker: defineTable({
    fetchId: v.id("eexFetches"),
    source: v.string(),
    row: v.any(),
  }).index("by_fetch", ["fetchId"]),

  savedScenarios: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    createdAtUtc: v.string(),
    updatedAtUtc: v.string(),
    marketDate: v.string(),
    batteryTwinId: v.optional(v.id("batteryTwins")),
    assumptions: v.any(),
  })
    .index("by_updatedAt", ["updatedAtUtc"])
    .index("by_marketDate", ["marketDate"]),

  batteryTwins: defineTable({
    name: v.string(),
    createdAtUtc: v.string(),
    updatedAtUtc: v.string(),
    capacityMwh: v.number(),
    maxChargeMw: v.number(),
    maxDischargeMw: v.number(),
    roundTripEfficiency: v.number(),
    minSocMwh: v.number(),
    maxSocMwh: v.number(),
    initialSocMwh: v.number(),
    degradationCostEurPerMwh: v.number(),
  }).index("by_updatedAt", ["updatedAtUtc"]),

  runHistory: defineTable({
    scenarioId: v.optional(v.id("savedScenarios")),
    batteryTwinId: v.optional(v.id("batteryTwins")),
    createdAtUtc: v.string(),
    marketDate: v.string(),
    status: v.string(),
    summary: v.any(),
    dispatch: v.any(),
  })
    .index("by_createdAt", ["createdAtUtc"])
    .index("by_marketDate", ["marketDate"]),

  damIngestRuns: defineTable({
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
  })
    .index("by_runId", ["runId"])
    .index("by_startedAt", ["startedAtUtc"]),

  damFiles: defineTable({
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
  })
    .index("by_source_date", ["sourceCode", "marketDate"])
    .index("by_date", ["marketDate"])
    .index("by_sha256", ["sha256"])
    .index("by_filename", ["filename"]),

  damMarketResults: defineTable({
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
  })
    .index("by_date_mtu", ["marketDate", "mtu"])
    .index("by_date", ["marketDate"])
    .index("by_file", ["sourceFile"])
    .index("by_row_hash", ["rowHash"])
    .index("by_date_side", ["marketDate", "side"]),

  damAggregatedCurves: defineTable({
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
  })
    .index("by_date_mtu", ["marketDate", "mtu"])
    .index("by_date", ["marketDate"])
    .index("by_file", ["sourceFile"])
    .index("by_row_hash", ["rowHash"])
    .index("by_date_side", ["marketDate", "side"]),
});
