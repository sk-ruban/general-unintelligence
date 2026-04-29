import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";

const SOURCE = "open-meteo";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEZONE = "Europe/Athens";
const USER_AGENT = "odyceo-hackathon-convex-open-meteo/1.0";

const DEFAULT_MAX_AGE_MINUTES = 30;
const DEFAULT_FORECAST_STEPS = 96;
const DEFAULT_PAST_STEPS = 4;

const MINUTELY_15_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "precipitation",
  "rain",
  "wind_speed_10m",
  "wind_speed_80m",
  "wind_direction_10m",
  "wind_direction_80m",
  "wind_gusts_10m",
  "shortwave_radiation",
  "direct_radiation",
  "diffuse_radiation",
  "direct_normal_irradiance",
  "global_tilted_irradiance",
  "sunshine_duration",
  "is_day",
  "weather_code",
  "cape",
  "visibility",
] as const;

const CURRENT_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "precipitation",
  "rain",
  "weather_code",
  "cloud_cover",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "is_day",
] as const;

const HOURLY_AUX_VARIABLES = [
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
] as const;

const VARIABLE_GROUPS = {
  overview: [
    "temperature_2m",
    "apparent_temperature",
    "wind_speed_80m",
    "cloud_cover",
    "shortwave_radiation",
    "precipitation",
    "weather_code",
  ],
  solar: [
    "shortwave_radiation",
    "direct_radiation",
    "diffuse_radiation",
    "direct_normal_irradiance",
    "global_tilted_irradiance",
    "cloud_cover",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
  ],
  wind: [
    "wind_speed_10m",
    "wind_speed_80m",
    "wind_direction_10m",
    "wind_direction_80m",
    "wind_gusts_10m",
  ],
  loadWeather: [
    "temperature_2m",
    "apparent_temperature",
    "relative_humidity_2m",
  ],
  precipitationRisk: [
    "precipitation",
    "rain",
    "weather_code",
    "cape",
    "visibility",
  ],
};

type Location = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  weight: number;
};

type Row = Record<string, unknown> & { timestamp: string };
type RefreshArgs = {
  force?: boolean;
  maxAgeMinutes?: number;
  forecastSteps?: number;
  pastSteps?: number;
};
type FetchSelector = {
  fetchId?: string;
  asOfFetchedAtUtc?: string;
};
type NormalizedLocation = Location & {
  elevation: unknown;
  current: Record<string, unknown>;
  series: Row[];
};

const LOCATIONS: Location[] = [
  { id: "athens", name: "Athens", latitude: 37.9838, longitude: 23.7275, weight: 0.3 },
  { id: "thessaloniki", name: "Thessaloniki", latitude: 40.6401, longitude: 22.9444, weight: 0.18 },
  { id: "crete", name: "Crete", latitude: 35.2401, longitude: 24.8093, weight: 0.14 },
  { id: "western_greece", name: "Western Greece", latitude: 38.2466, longitude: 21.7346, weight: 0.13 },
  { id: "thessaly", name: "Thessaly", latitude: 39.639, longitude: 22.4191, weight: 0.13 },
  { id: "peloponnese", name: "Peloponnese", latitude: 37.5079, longitude: 22.3735, weight: 0.07 },
  { id: "aegean_islands", name: "Aegean Islands", latitude: 37.085, longitude: 25.15, weight: 0.05 },
];

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, Math.trunc(value as number)));
}

function camelCase(value: string) {
  const [head, ...tail] = value.split("_");
  return head + tail.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function normalizeVariableName(value: string) {
  return value.includes("_") ? camelCase(value) : value;
}

function variablesForRequest(variables?: string[], group?: string) {
  const requested = new Set<string>();
  if (group && group in VARIABLE_GROUPS) {
    for (const variable of VARIABLE_GROUPS[group as keyof typeof VARIABLE_GROUPS]) {
      requested.add(normalizeVariableName(variable));
    }
  }
  for (const variable of variables ?? []) {
    requested.add(normalizeVariableName(variable));
  }
  return requested.size === 0 ? null : requested;
}

function projectRow(row: Row, variables: Set<string> | null) {
  if (variables === null) {
    return row;
  }
  const projected: Row = { timestamp: row.timestamp };
  for (const variable of variables) {
    if (variable in row) {
      projected[variable] = row[variable];
    }
  }
  return projected;
}

function projectValues(values: Record<string, unknown>, variables: Set<string> | null) {
  if (variables === null) {
    return values;
  }
  const projected: Record<string, unknown> = {};
  for (const variable of variables) {
    if (variable in values) {
      projected[variable] = values[variable];
    }
  }
  return projected;
}

function filterRows(
  rows: Row[],
  options: {
    startTimestamp?: string;
    endTimestamp?: string;
    limit?: number;
    variables: Set<string> | null;
  },
) {
  const limit = boundedInteger(options.limit, rows.length, 1, rows.length || 1);
  return rows
    .filter((row) => {
      if (options.startTimestamp !== undefined && row.timestamp < options.startTimestamp) {
        return false;
      }
      if (options.endTimestamp !== undefined && row.timestamp > options.endTimestamp) {
        return false;
      }
      return true;
    })
    .slice(0, limit)
    .map((row) => projectRow(row, options.variables));
}

function buildForecastUrl(forecastSteps: number, pastSteps: number) {
  const params = new URLSearchParams({
    latitude: LOCATIONS.map((location) => String(location.latitude)).join(","),
    longitude: LOCATIONS.map((location) => String(location.longitude)).join(","),
    timezone: TIMEZONE,
    minutely_15: MINUTELY_15_VARIABLES.join(","),
    current: CURRENT_VARIABLES.join(","),
    hourly: HOURLY_AUX_VARIABLES.join(","),
    forecast_minutely_15: String(forecastSteps),
    past_minutely_15: String(pastSteps),
    forecast_hours: String(Math.max(1, Math.ceil(forecastSteps / 4))),
    past_hours: String(Math.max(0, Math.ceil(pastSteps / 4))),
  });
  return `${FORECAST_URL}?${params.toString()}`;
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`Open-Meteo returned ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

function responseList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object");
  }
  if (payload !== null && typeof payload === "object") {
    return [payload as Record<string, unknown>];
  }
  throw new Error("Open-Meteo returned an unsupported response shape");
}

function rowsFromBlock(block: unknown, variables: readonly string[]) {
  if (block === null || typeof block !== "object") {
    return [];
  }
  const source = block as Record<string, unknown>;
  const times = source.time;
  if (!Array.isArray(times)) {
    return [];
  }

  return times.map((timestamp, index) => {
    const row: Row = { timestamp: String(timestamp) };
    for (const variable of variables) {
      const values = source[variable];
      if (Array.isArray(values) && index < values.length) {
        row[camelCase(variable)] = values[index];
      }
    }
    return row;
  });
}

function byTimestamp(rows: Row[]) {
  return new Map(rows.map((row) => [row.timestamp, row]));
}

function hourKey(timestamp: string) {
  return `${timestamp.slice(0, 13)}:00`;
}

function enrichWithHourlyAux(minutelyRows: Row[], hourlyRows: Row[]) {
  const hourlyByTime = byTimestamp(hourlyRows);
  return minutelyRows.map((row) => {
    const aux = hourlyByTime.get(hourKey(row.timestamp));
    if (!aux) {
      return row;
    }
    const merged: Row = { ...row };
    for (const variable of HOURLY_AUX_VARIABLES) {
      const key = camelCase(variable);
      if (key in aux) {
        merged[key] = aux[key];
      }
    }
    return merged;
  });
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function featureScores(row: Row) {
  const shortwave = numberValue(row.shortwaveRadiation);
  const direct = numberValue(row.directRadiation);
  const wind80 = numberValue(row.windSpeed80m);
  const apparent = numberValue(row.apparentTemperature);
  const precipitation = numberValue(row.precipitation) ?? 0;

  const solar =
    shortwave === undefined || direct === undefined
      ? null
      : Number((clamp((0.7 * shortwave + 0.3 * direct) / 900) * (1 - clamp(precipitation / 2))).toFixed(3));

  const wind = wind80 === undefined ? null : Number(clamp((wind80 / 14) ** 3).toFixed(3));

  let demand: number | null = null;
  if (apparent !== undefined) {
    const heatStress = clamp((apparent - 24) / 16);
    const coldStress = clamp((10 - apparent) / 14);
    demand = Number(Math.max(heatStress, coldStress).toFixed(3));
  }

  return {
    solarAvailabilityScore: solar,
    windGenerationProxy: wind,
    weatherDemandStress: demand,
  };
}

function addFeatures(rows: Row[]) {
  return rows.map((row) => ({ ...row, ...featureScores(row) }));
}

function weightedAverage(values: [number, number][]) {
  if (values.length === 0) {
    return null;
  }
  const totalWeight = values.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight === 0) {
    return null;
  }
  return Number((values.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight).toFixed(3));
}

function weightedCircularMeanDegrees(values: [number, number][]) {
  if (values.length === 0) {
    return null;
  }
  const sinSum = values.reduce((sum, [value, weight]) => sum + Math.sin((value * Math.PI) / 180) * weight, 0);
  const cosSum = values.reduce((sum, [value, weight]) => sum + Math.cos((value * Math.PI) / 180) * weight, 0);
  if (sinSum === 0 && cosSum === 0) {
    return null;
  }
  return Number((((Math.atan2(sinSum, cosSum) * 180) / Math.PI + 360) % 360).toFixed(1));
}

function weightedMode(values: [number, number][]) {
  const weights = new Map<number, number>();
  for (const [value, weight] of values) {
    weights.set(value, (weights.get(value) ?? 0) + weight);
  }
  let bestValue: number | null = null;
  let bestWeight = -Infinity;
  for (const [value, weight] of weights) {
    if (weight > bestWeight) {
      bestValue = value;
      bestWeight = weight;
    }
  }
  return bestValue;
}

function aggregateValue(key: string, values: [number, number][]) {
  if (key.startsWith("windDirection")) {
    return weightedCircularMeanDegrees(values);
  }
  if (key === "weatherCode") {
    return weightedMode(values);
  }
  return weightedAverage(values);
}

function aggregateNational(regional: NormalizedLocation[]) {
  const seriesByLocation = new Map(regional.map((location) => [location.id, byTimestamp(location.series)]));
  const timestamps = Array.from(
    new Set(regional.flatMap((location) => location.series.map((row) => row.timestamp))),
  ).sort();

  return timestamps.map((timestamp) => {
    const row: Row = { timestamp };
    const keys = new Set<string>();
    for (const location of regional) {
      const regionalRow = seriesByLocation.get(location.id)?.get(timestamp);
      if (!regionalRow) {
        continue;
      }
      Object.keys(regionalRow).forEach((key) => {
        if (key !== "timestamp") {
          keys.add(key);
        }
      });
    }

    for (const key of Array.from(keys).sort()) {
      const values: [number, number][] = [];
      for (const location of regional) {
        const value = numberValue(seriesByLocation.get(location.id)?.get(timestamp)?.[key]);
        if (value !== undefined) {
          values.push([value, location.weight]);
        }
      }
      const aggregated = aggregateValue(key, values);
      if (aggregated !== null) {
        row[key] = aggregated;
      }
    }
    return row;
  });
}

function normalizeCurrent(current: unknown) {
  if (current === null || typeof current !== "object") {
    return {};
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
    normalized[camelCase(key)] = value;
  }
  return normalized;
}

function normalizeOpenMeteoResponse(payload: unknown) {
  const responses = responseList(payload);
  if (responses.length !== LOCATIONS.length) {
    throw new Error(`Expected ${LOCATIONS.length} Open-Meteo responses, received ${responses.length}`);
  }

  const regional = responses.map((response, index): NormalizedLocation => {
    const location = LOCATIONS[index];
    const minutelyRows = rowsFromBlock(response.minutely_15, MINUTELY_15_VARIABLES);
    const hourlyRows = rowsFromBlock(response.hourly, HOURLY_AUX_VARIABLES);
    return {
      ...location,
      elevation: response.elevation,
      current: normalizeCurrent(response.current),
      series: addFeatures(enrichWithHourlyAux(minutelyRows, hourlyRows)),
    };
  });

  return {
    regional,
    nationalSeries: aggregateNational(regional),
    units: {
      minutely15: responses[0].minutely_15_units ?? {},
      hourlyAux: responses[0].hourly_units ?? {},
      current: responses[0].current_units ?? {},
    },
  };
}

async function latestFetch(ctx: { db: any }) {
  return await ctx.db
    .query("weatherFetches")
    .withIndex("by_source_fetchedAt", (q: any) => q.eq("source", SOURCE))
    .order("desc")
    .first();
}

async function fetchForSelector(ctx: { db: any }, selector: FetchSelector) {
  if (selector.fetchId !== undefined) {
    const fetchDoc = await ctx.db.get(selector.fetchId as any);
    if (!fetchDoc || fetchDoc.source !== SOURCE) {
      return null;
    }
    return fetchDoc;
  }
  if (selector.asOfFetchedAtUtc !== undefined) {
    return await ctx.db
      .query("weatherFetches")
      .withIndex("by_source_fetchedAt", (q: any) =>
        q.eq("source", SOURCE).lte("fetchedAtUtc", selector.asOfFetchedAtUtc),
      )
      .order("desc")
      .first();
  }
  return await latestFetch(ctx);
}

function fetchSummary(fetchDoc: any) {
  return {
    id: fetchDoc._id,
    fetchedAtUtc: fetchDoc.fetchedAtUtc,
    firstTimestamp: fetchDoc.firstTimestamp,
    lastTimestamp: fetchDoc.lastTimestamp,
    resolution: fetchDoc.resolution,
    resolutionSource: fetchDoc.resolutionSource,
    forecastSteps: fetchDoc.forecastSteps,
    pastSteps: fetchDoc.pastSteps,
    locationCount: fetchDoc.locationCount,
    nationalPointCount: fetchDoc.nationalPointCount,
    health: fetchDoc.health,
  };
}

async function telemetryForFetch(ctx: { db: any }, fetchDoc: any, includeRegional: boolean, locationId?: string) {
  const national = await ctx.db
    .query("weatherNationalSeries")
    .withIndex("by_fetch", (q: any) => q.eq("fetchId", fetchDoc._id))
    .first();

  const current = await ctx.db
    .query("weatherCurrentByLocation")
    .withIndex("by_fetch_location", (q: any) => q.eq("fetchId", fetchDoc._id))
    .collect();

  let regional: unknown[] = [];
  if (locationId !== undefined) {
    regional = await ctx.db
      .query("weatherRegionalSeries")
      .withIndex("by_fetch_location", (q: any) => q.eq("fetchId", fetchDoc._id).eq("locationId", locationId))
      .collect();
  } else if (includeRegional) {
    regional = await ctx.db
      .query("weatherRegionalSeries")
      .withIndex("by_fetch_location", (q: any) => q.eq("fetchId", fetchDoc._id))
      .collect();
  }

  return {
    fetch: fetchDoc,
    locations: LOCATIONS,
    variableGroups: VARIABLE_GROUPS,
    currentByLocation: current.map((item: any) => ({
      locationId: item.locationId,
      locationName: item.locationName,
      latitude: item.latitude,
      longitude: item.longitude,
      weight: item.weight,
      values: item.values,
    })),
    nationalSeries: national?.rows ?? [],
    regional,
  };
}

export const getLatestFetch = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await latestFetch(ctx);
  },
});

export const getLatestTelemetry = query({
  args: {
    fetchId: v.optional(v.id("weatherFetches")),
    asOfFetchedAtUtc: v.optional(v.string()),
    includeRegional: v.optional(v.boolean()),
    locationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const fetchDoc = await fetchForSelector(ctx, args);
    if (!fetchDoc) {
      return null;
    }
    return await telemetryForFetch(ctx, fetchDoc, args.includeRegional ?? false, args.locationId);
  },
});

export const getWeatherCatalog = query({
  args: {
    fetchId: v.optional(v.id("weatherFetches")),
    asOfFetchedAtUtc: v.optional(v.string()),
    includeRecentFetches: v.optional(v.boolean()),
    fetchLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const fetchDoc = await fetchForSelector(ctx, args);
    const recentFetchLimit = boundedInteger(args.fetchLimit, 12, 1, 100);
    const recentFetches = args.includeRecentFetches
      ? await ctx.db
          .query("weatherFetches")
          .withIndex("by_source_fetchedAt", (q) => q.eq("source", SOURCE))
          .order("desc")
          .take(recentFetchLimit)
      : [];
    return {
      source: SOURCE,
      timezone: TIMEZONE,
      locations: LOCATIONS,
      variableGroups: VARIABLE_GROUPS,
      fetchedAtUtc: fetchDoc?.fetchedAtUtc ?? null,
      firstTimestamp: fetchDoc?.firstTimestamp ?? null,
      lastTimestamp: fetchDoc?.lastTimestamp ?? null,
      resolution: fetchDoc?.resolution ?? "PT15M",
      resolutionSource: fetchDoc?.resolutionSource ?? "forecast.minutely_15",
      units: fetchDoc?.units ?? null,
      selectedFetch: fetchDoc ? fetchSummary(fetchDoc) : null,
      recentFetches: recentFetches.map(fetchSummary),
      refresh: {
        mode: "scheduled",
        defaultCadenceMinutes: 15,
        manualRefreshFunction: "openMeteo:refreshOpenMeteoTelemetry",
      },
    };
  },
});

export const getWeatherCurrent = query({
  args: {
    fetchId: v.optional(v.id("weatherFetches")),
    asOfFetchedAtUtc: v.optional(v.string()),
    locationIds: v.optional(v.array(v.string())),
    variables: v.optional(v.array(v.string())),
    group: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const fetchDoc = await fetchForSelector(ctx, args);
    if (!fetchDoc) {
      return null;
    }
    const requestedLocations = args.locationIds === undefined ? null : new Set(args.locationIds);
    const variables = variablesForRequest(args.variables, args.group);
    const rows = await ctx.db
      .query("weatherCurrentByLocation")
      .withIndex("by_fetch_location", (q) => q.eq("fetchId", fetchDoc._id))
      .collect();

    return {
      fetch: fetchDoc,
      rows: rows
        .filter((row) => requestedLocations === null || requestedLocations.has(row.locationId))
        .map((row) => ({
          locationId: row.locationId,
          locationName: row.locationName,
          latitude: row.latitude,
          longitude: row.longitude,
          weight: row.weight,
          values: projectValues(row.values, variables),
        })),
    };
  },
});

export const getWeatherSeries = query({
  args: {
    fetchId: v.optional(v.id("weatherFetches")),
    asOfFetchedAtUtc: v.optional(v.string()),
    scope: v.optional(v.string()),
    locationId: v.optional(v.string()),
    variables: v.optional(v.array(v.string())),
    group: v.optional(v.string()),
    startTimestamp: v.optional(v.string()),
    endTimestamp: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const fetchDoc = await fetchForSelector(ctx, args);
    if (!fetchDoc) {
      return null;
    }
    const scope = args.scope ?? "national";
    const variables = variablesForRequest(args.variables, args.group);
    if (scope !== "national" && scope !== "regional") {
      throw new Error(`Unsupported weather series scope: ${scope}`);
    }

    if (scope === "national") {
      const national = await ctx.db
        .query("weatherNationalSeries")
        .withIndex("by_fetch", (q) => q.eq("fetchId", fetchDoc._id))
        .first();
      return {
        fetch: fetchDoc,
        scope,
        location: null,
        rows: filterRows((national?.rows ?? []) as Row[], {
          startTimestamp: args.startTimestamp,
          endTimestamp: args.endTimestamp,
          limit: args.limit,
          variables,
        }),
      };
    }

    if (args.locationId === undefined) {
      throw new Error("locationId is required when scope is regional");
    }
    const locationId = args.locationId;
    const regional = await ctx.db
      .query("weatherRegionalSeries")
      .withIndex("by_fetch_location", (q) => q.eq("fetchId", fetchDoc._id).eq("locationId", locationId))
      .first();
    if (!regional) {
      return {
        fetch: fetchDoc,
        scope,
        location: null,
        rows: [],
      };
    }
    return {
      fetch: fetchDoc,
      scope,
      location: {
        locationId: regional.locationId,
        locationName: regional.locationName,
        latitude: regional.latitude,
        longitude: regional.longitude,
        weight: regional.weight,
      },
      rows: filterRows(regional.rows as Row[], {
        startTimestamp: args.startTimestamp,
        endTimestamp: args.endTimestamp,
        limit: args.limit,
        variables,
      }),
    };
  },
});

export const listWeatherFetches = query({
  args: {
    limit: v.optional(v.number()),
    startFetchedAtUtc: v.optional(v.string()),
    endFetchedAtUtc: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = boundedInteger(args.limit, 24, 1, 200);
    const fetches = await ctx.db
      .query("weatherFetches")
      .withIndex("by_source_fetchedAt", (q) => q.eq("source", SOURCE))
      .order("desc")
      .take(Math.max(limit, 200));
    const filtered = fetches
      .filter((fetchDoc) => {
        if (args.startFetchedAtUtc !== undefined && fetchDoc.fetchedAtUtc < args.startFetchedAtUtc) {
          return false;
        }
        if (args.endFetchedAtUtc !== undefined && fetchDoc.fetchedAtUtc > args.endFetchedAtUtc) {
          return false;
        }
        return true;
      })
      .slice(0, limit);
    return {
      source: SOURCE,
      count: filtered.length,
      fetches: filtered.map(fetchSummary),
    };
  },
});

export const getWeatherCoverage = query({
  args: {},
  handler: async (ctx) => {
    const latest = await latestFetch(ctx);
    const oldest = await ctx.db
      .query("weatherFetches")
      .withIndex("by_source_fetchedAt", (q) => q.eq("source", SOURCE))
      .order("asc")
      .first();
    return {
      source: SOURCE,
      timezone: TIMEZONE,
      latestFetch: latest ? fetchSummary(latest) : null,
      oldestFetch: oldest ? fetchSummary(oldest) : null,
      note:
        "Forecast rows are stored per Open-Meteo fetch. Use fetchId for exact run selection or asOfFetchedAtUtc for point-in-time dashboard reconstruction.",
    };
  },
});

export const compareWeatherRuns = query({
  args: {
    scope: v.optional(v.string()),
    locationId: v.optional(v.string()),
    timestamp: v.string(),
    variables: v.optional(v.array(v.string())),
    group: v.optional(v.string()),
    fetchLimit: v.optional(v.number()),
    startFetchedAtUtc: v.optional(v.string()),
    endFetchedAtUtc: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = args.scope ?? "national";
    if (scope !== "national" && scope !== "regional") {
      throw new Error(`Unsupported weather run comparison scope: ${scope}`);
    }
    const locationId = args.locationId;
    if (scope === "regional" && locationId === undefined) {
      throw new Error("locationId is required when scope is regional");
    }

    const variables = variablesForRequest(args.variables, args.group);
    const fetchLimit = boundedInteger(args.fetchLimit, 12, 1, 48);
    const candidateFetches = await ctx.db
      .query("weatherFetches")
      .withIndex("by_source_fetchedAt", (q) => q.eq("source", SOURCE))
      .order("desc")
      .take(Math.max(fetchLimit, 100));
    const fetches = candidateFetches
      .filter((fetchDoc) => {
        if (args.startFetchedAtUtc !== undefined && fetchDoc.fetchedAtUtc < args.startFetchedAtUtc) {
          return false;
        }
        if (args.endFetchedAtUtc !== undefined && fetchDoc.fetchedAtUtc > args.endFetchedAtUtc) {
          return false;
        }
        if (fetchDoc.firstTimestamp !== undefined && args.timestamp < fetchDoc.firstTimestamp) {
          return false;
        }
        if (fetchDoc.lastTimestamp !== undefined && args.timestamp > fetchDoc.lastTimestamp) {
          return false;
        }
        return true;
      })
      .slice(0, fetchLimit);

    const runs = [];
    for (const fetchDoc of fetches) {
      if (scope === "national") {
        const national = await ctx.db
          .query("weatherNationalSeries")
          .withIndex("by_fetch", (q) => q.eq("fetchId", fetchDoc._id))
          .first();
        const row = ((national?.rows ?? []) as Row[]).find((item) => item.timestamp === args.timestamp);
        runs.push({
          fetch: fetchSummary(fetchDoc),
          row: row ? projectRow(row, variables) : null,
        });
        continue;
      }

      if (locationId === undefined) {
        throw new Error("locationId is required when scope is regional");
      }
      const regionalLocationId = locationId;
      const regional = await ctx.db
        .query("weatherRegionalSeries")
        .withIndex("by_fetch_location", (q) => q.eq("fetchId", fetchDoc._id).eq("locationId", regionalLocationId))
        .first();
      const row = ((regional?.rows ?? []) as Row[]).find((item) => item.timestamp === args.timestamp);
      runs.push({
        fetch: fetchSummary(fetchDoc),
        location: regional
          ? {
              locationId: regional.locationId,
              locationName: regional.locationName,
              latitude: regional.latitude,
              longitude: regional.longitude,
              weight: regional.weight,
            }
          : null,
        row: row ? projectRow(row, variables) : null,
      });
    }

    return {
      source: SOURCE,
      scope,
      timestamp: args.timestamp,
      runs,
    };
  },
});

export const getDashboardPanel = query({
  args: {
    fetchId: v.optional(v.id("weatherFetches")),
    asOfFetchedAtUtc: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const fetchDoc = await fetchForSelector(ctx, args);
    if (!fetchDoc) {
      return null;
    }
    const telemetry = await telemetryForFetch(ctx, fetchDoc, false);
    return {
      ...telemetry,
      panel: {
        title: "Open-Meteo Weather Telemetry",
        description: "Live Greek weather signals aligned to the battery dashboard grid.",
        defaultTabs: Object.keys(VARIABLE_GROUPS),
        displayResolutionNote:
          "Open-Meteo may interpolate 15-minute values outside high-resolution model regions; show this as source resolution metadata in the UI.",
      },
    };
  },
});

export const storeTelemetry = internalMutation({
  args: {
    fetchedAtUtc: v.string(),
    sourceUrl: v.string(),
    forecastSteps: v.number(),
    pastSteps: v.number(),
    units: v.any(),
    health: v.any(),
    regional: v.any(),
    nationalSeries: v.any(),
  },
  handler: async (ctx, args) => {
    const firstTimestamp = args.nationalSeries[0]?.timestamp;
    const lastTimestamp = args.nationalSeries.at(-1)?.timestamp;
    const fetchId = await ctx.db.insert("weatherFetches", {
      source: SOURCE,
      fetchedAtUtc: args.fetchedAtUtc,
      sourceUrl: args.sourceUrl,
      timezone: TIMEZONE,
      resolution: "PT15M",
      resolutionSource: "forecast.minutely_15",
      forecastSteps: args.forecastSteps,
      pastSteps: args.pastSteps,
      locationCount: LOCATIONS.length,
      nationalPointCount: args.nationalSeries.length,
      firstTimestamp,
      lastTimestamp,
      units: args.units,
      health: args.health,
    });

    await ctx.db.insert("weatherNationalSeries", {
      fetchId,
      source: SOURCE,
      rows: args.nationalSeries,
    });

    for (const location of args.regional) {
      await ctx.db.insert("weatherRegionalSeries", {
        fetchId,
        source: SOURCE,
        locationId: location.id,
        locationName: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        weight: location.weight,
        rows: location.series,
      });
      await ctx.db.insert("weatherCurrentByLocation", {
        fetchId,
        source: SOURCE,
        locationId: location.id,
        locationName: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        weight: location.weight,
        values: location.current,
      });
    }

    return { fetchId, firstTimestamp, lastTimestamp };
  },
});

async function refreshTelemetry(ctx: any, args: RefreshArgs): Promise<Record<string, unknown>> {
  const maxAgeMinutes = boundedInteger(args.maxAgeMinutes, DEFAULT_MAX_AGE_MINUTES, 0, 24 * 60);
  const forecastSteps = boundedInteger(args.forecastSteps, DEFAULT_FORECAST_STEPS, 1, 16 * 96);
  const pastSteps = boundedInteger(args.pastSteps, DEFAULT_PAST_STEPS, 0, 92 * 96);
  const latest: any = await ctx.runQuery(internal.openMeteo.getLatestFetch, {});

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

  const sourceUrl = buildForecastUrl(forecastSteps, pastSteps);
  const payload = await fetchJson(sourceUrl);
  const normalized = normalizeOpenMeteoResponse(payload);
  const fetchedAtUtc = new Date().toISOString();
  const stored: any = await ctx.runMutation(internal.openMeteo.storeTelemetry, {
    fetchedAtUtc,
    sourceUrl,
    forecastSteps,
    pastSteps,
    units: normalized.units,
    health: {
      status: "ok",
      minutely15: "ok",
      hourlyAux: "ok",
      fallbackUsed: false,
      note: "Fetched through Convex action and cached in Convex tables for dashboard reads.",
    },
    regional: normalized.regional,
    nationalSeries: normalized.nationalSeries,
  });

  return {
    cache: "miss",
    fetchId: stored.fetchId,
    fetchedAtUtc,
    forecastSteps,
    pastSteps,
    nationalPointCount: normalized.nationalSeries.length,
    firstTimestamp: stored.firstTimestamp,
    lastTimestamp: stored.lastTimestamp,
  };
}

export const refreshOpenMeteoTelemetry = action({
  args: {
    force: v.optional(v.boolean()),
    maxAgeMinutes: v.optional(v.number()),
    forecastSteps: v.optional(v.number()),
    pastSteps: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    return await refreshTelemetry(ctx, args);
  },
});

export const refreshOpenMeteoTelemetryInternal = internalAction({
  args: {
    force: v.optional(v.boolean()),
    maxAgeMinutes: v.optional(v.number()),
    forecastSteps: v.optional(v.number()),
    pastSteps: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    return await refreshTelemetry(ctx, args);
  },
});
