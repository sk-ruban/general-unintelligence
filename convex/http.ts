import { httpRouter } from "convex/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";

const http = httpRouter();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

function numberParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  if (value === null || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  if (value === null) {
    return undefined;
  }
  return value === "1" || value.toLowerCase() === "true";
}

function stringParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  return value === null || value.trim() === "" ? undefined : value;
}

function invalidIdResponse(tableName: string, value: string) {
  return jsonResponse(
    {
      error: `Invalid ${tableName} id: ${value}`,
    },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

function convexIdParam<TableName extends "weatherFetches" | "ttfFetches">(
  searchParams: URLSearchParams,
  key: string,
  tableName: TableName,
): { ok: true; value: Id<TableName> | undefined } | { ok: false; response: Response } {
  const value = stringParam(searchParams, key);
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!/^[A-Za-z0-9_-]{20,}$/.test(value)) {
    return { ok: false, response: invalidIdResponse(tableName, value) };
  }
  return { ok: true, value: value as Id<TableName> };
}

function ttfFetchIdFromRefresh(fetchId: string): Id<"ttfFetches"> {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(fetchId)) {
    throw new Error(`ICE TTF refresh returned an invalid fetchId: ${fetchId}`);
  }
  return fetchId as Id<"ttfFetches">;
}

function ttfRefreshArgsFromSearch(searchParams: URLSearchParams) {
  return {
    force: booleanParam(searchParams, "force"),
    maxAgeMinutes: numberParam(searchParams, "maxAgeMinutes"),
    contractSelection: stringParam(searchParams, "contractSelection"),
    marketId: numberParam(searchParams, "marketId"),
    historicalSpan: stringParam(searchParams, "historicalSpan"),
    efficiency: numberParam(searchParams, "efficiency"),
  };
}

function fetchIdFromRefresh(refreshResult: unknown) {
  if (refreshResult !== null && typeof refreshResult === "object" && "fetchId" in refreshResult) {
    const fetchId = (refreshResult as { fetchId?: unknown }).fetchId;
    return typeof fetchId === "string" ? fetchId : undefined;
  }
  return undefined;
}

async function refreshTtfFromSearch(ctx: any, searchParams: URLSearchParams) {
  const refreshResult = await ctx.runAction(api.iceTtf.refreshIceTtf, ttfRefreshArgsFromSearch(searchParams));
  const fetchId = fetchIdFromRefresh(refreshResult);
  if (!fetchId) {
    throw new Error("ICE TTF refresh did not return a fetchId");
  }
  return { refreshResult, fetchId };
}

function weatherFetchSelectorFromSearch(searchParams: URLSearchParams) {
  const fetchId = convexIdParam(searchParams, "fetchId", "weatherFetches");
  if (!fetchId.ok) {
    return fetchId;
  }
  return {
    ok: true as const,
    value: {
      fetchId: fetchId.value,
      asOfFetchedAtUtc: stringParam(searchParams, "asOf") ?? stringParam(searchParams, "asOfFetchedAtUtc"),
    },
  };
}

function damDateRangeFromSearch(searchParams: URLSearchParams) {
  return {
    date: stringParam(searchParams, "date"),
    from: stringParam(searchParams, "from"),
    to: stringParam(searchParams, "to"),
  };
}

http.route({
  path: "/market/dam/catalog",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    return jsonResponse(
      await ctx.runQuery(api.dam.getDamCatalog, {
        includeRecentFiles: booleanParam(searchParams, "includeRecentFiles"),
        fileLimit: numberParam(searchParams, "fileLimit"),
      }),
    );
  }),
});

http.route({
  path: "/market/dam/catalog",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/market/dam/files",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    return jsonResponse(
      await ctx.runQuery(api.dam.getDamFiles, {
        sourceCode: stringParam(searchParams, "sourceCode") ?? stringParam(searchParams, "source"),
        from: stringParam(searchParams, "from"),
        to: stringParam(searchParams, "to"),
        status: stringParam(searchParams, "status"),
        limit: numberParam(searchParams, "limit"),
      }),
    );
  }),
});

http.route({
  path: "/market/dam/files",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/market/dam/prices",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    return jsonResponse(
      await ctx.runQuery(api.dam.getDamPrices, {
        ...damDateRangeFromSearch(searchParams),
        limit: numberParam(searchParams, "limit"),
      }),
    );
  }),
});

http.route({
  path: "/market/dam/prices",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/market/dam/results",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    return jsonResponse(
      await ctx.runQuery(api.dam.getDamMarketResults, {
        ...damDateRangeFromSearch(searchParams),
        mtu: numberParam(searchParams, "mtu"),
        side: stringParam(searchParams, "side"),
        biddingZone: stringParam(searchParams, "biddingZone"),
        asset: stringParam(searchParams, "asset"),
        classification: stringParam(searchParams, "classification"),
        limit: numberParam(searchParams, "limit"),
      }),
    );
  }),
});

http.route({
  path: "/market/dam/results",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/market/dam/curves",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    return jsonResponse(
      await ctx.runQuery(api.dam.getDamAggregatedCurves, {
        ...damDateRangeFromSearch(searchParams),
        mtu: numberParam(searchParams, "mtu"),
        side: stringParam(searchParams, "side"),
        limit: numberParam(searchParams, "limit"),
      }),
    );
  }),
});

http.route({
  path: "/market/dam/curves",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/market/dam/dashboard",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    return jsonResponse(await ctx.runQuery(api.dam.getDamDashboard, damDateRangeFromSearch(searchParams)));
  }),
});

http.route({
  path: "/market/dam/dashboard",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/weather/open-meteo/latest",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    const shouldRefresh = booleanParam(searchParams, "refresh") ?? false;
    const selector = weatherFetchSelectorFromSearch(searchParams);
    if (!selector.ok) {
      return selector.response;
    }

    if (shouldRefresh) {
      await ctx.runAction(api.openMeteo.refreshOpenMeteoTelemetry, {
        force: booleanParam(searchParams, "force"),
        maxAgeMinutes: numberParam(searchParams, "maxAgeMinutes"),
        forecastSteps: numberParam(searchParams, "forecastSteps"),
        pastSteps: numberParam(searchParams, "pastSteps"),
      });
    }

    const telemetry = await ctx.runQuery(api.openMeteo.getLatestTelemetry, {
      ...selector.value,
      includeRegional: booleanParam(searchParams, "includeRegional"),
      locationId: stringParam(searchParams, "locationId"),
    });
    if (!telemetry) {
      return jsonResponse(
        {
          error:
            "No cached Open-Meteo telemetry is available yet. Wait for the cron or call POST /weather/open-meteo/refresh.",
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return jsonResponse(telemetry);
  }),
});

http.route({
  path: "/weather/open-meteo/latest",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/weather/open-meteo/catalog",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    const selector = weatherFetchSelectorFromSearch(searchParams);
    if (!selector.ok) {
      return selector.response;
    }
    return jsonResponse(
      await ctx.runQuery(api.openMeteo.getWeatherCatalog, {
        ...selector.value,
        includeRecentFetches: booleanParam(searchParams, "includeRecentFetches"),
        fetchLimit: numberParam(searchParams, "fetchLimit"),
      }),
    );
  }),
});

http.route({
  path: "/weather/open-meteo/catalog",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/weather/open-meteo/current",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    const selector = weatherFetchSelectorFromSearch(searchParams);
    if (!selector.ok) {
      return selector.response;
    }
    const current = await ctx.runQuery(api.openMeteo.getWeatherCurrent, {
      ...selector.value,
      locationIds: searchParams.get("locationIds")?.split(",").filter(Boolean),
      variables: searchParams.get("variables")?.split(",").filter(Boolean),
      group: stringParam(searchParams, "group"),
    });
    if (!current) {
      return jsonResponse({ error: "No cached Open-Meteo telemetry is available yet." }, { status: 404 });
    }
    return jsonResponse(current);
  }),
});

http.route({
  path: "/weather/open-meteo/current",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/weather/open-meteo/series",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    const selector = weatherFetchSelectorFromSearch(searchParams);
    if (!selector.ok) {
      return selector.response;
    }
    const series = await ctx.runQuery(api.openMeteo.getWeatherSeries, {
      ...selector.value,
      scope: stringParam(searchParams, "scope"),
      locationId: stringParam(searchParams, "locationId"),
      variables: searchParams.get("variables")?.split(",").filter(Boolean),
      group: stringParam(searchParams, "group"),
      startTimestamp: stringParam(searchParams, "start") ?? stringParam(searchParams, "startTimestamp"),
      endTimestamp: stringParam(searchParams, "end") ?? stringParam(searchParams, "endTimestamp"),
      limit: numberParam(searchParams, "limit"),
    });
    if (!series) {
      return jsonResponse({ error: "No cached Open-Meteo telemetry is available yet." }, { status: 404 });
    }
    return jsonResponse(series);
  }),
});

http.route({
  path: "/weather/open-meteo/series",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/weather/open-meteo/fetches",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    return jsonResponse(
      await ctx.runQuery(api.openMeteo.listWeatherFetches, {
        limit: numberParam(searchParams, "limit"),
        startFetchedAtUtc: stringParam(searchParams, "startFetchedAtUtc"),
        endFetchedAtUtc: stringParam(searchParams, "endFetchedAtUtc"),
      }),
    );
  }),
});

http.route({
  path: "/weather/open-meteo/fetches",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/weather/open-meteo/coverage",
  method: "GET",
  handler: httpAction(async (ctx) => {
    return jsonResponse(await ctx.runQuery(api.openMeteo.getWeatherCoverage, {}));
  }),
});

http.route({
  path: "/weather/open-meteo/coverage",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/weather/open-meteo/runs",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    const timestamp = stringParam(searchParams, "timestamp");
    if (!timestamp) {
      return jsonResponse({ error: "timestamp is required" }, { status: 400 });
    }
    return jsonResponse(
      await ctx.runQuery(api.openMeteo.compareWeatherRuns, {
        scope: stringParam(searchParams, "scope"),
        locationId: stringParam(searchParams, "locationId"),
        timestamp,
        variables: searchParams.get("variables")?.split(",").filter(Boolean),
        group: stringParam(searchParams, "group"),
        fetchLimit: numberParam(searchParams, "fetchLimit"),
        startFetchedAtUtc: stringParam(searchParams, "startFetchedAtUtc"),
        endFetchedAtUtc: stringParam(searchParams, "endFetchedAtUtc"),
      }),
    );
  }),
});

http.route({
  path: "/weather/open-meteo/runs",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/weather/open-meteo/panel",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    const selector = weatherFetchSelectorFromSearch(searchParams);
    if (!selector.ok) {
      return selector.response;
    }
    const panel = await ctx.runQuery(api.openMeteo.getDashboardPanel, selector.value);
    if (!panel) {
      return jsonResponse(
        {
          error:
            "No cached Open-Meteo telemetry is available yet. Wait for the cron or call POST /weather/open-meteo/refresh.",
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return jsonResponse(panel);
  }),
});

http.route({
  path: "/weather/open-meteo/panel",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/weather/open-meteo/refresh",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = request.headers.get("content-type")?.includes("application/json")
      ? ((await request.json()) as Record<string, unknown>)
      : {};
    const refreshResult = await ctx.runAction(api.openMeteo.refreshOpenMeteoTelemetry, {
      force: typeof body.force === "boolean" ? body.force : undefined,
      maxAgeMinutes: typeof body.maxAgeMinutes === "number" ? body.maxAgeMinutes : undefined,
      forecastSteps: typeof body.forecastSteps === "number" ? body.forecastSteps : undefined,
      pastSteps: typeof body.pastSteps === "number" ? body.pastSteps : undefined,
    });
    const telemetry = await ctx.runQuery(api.openMeteo.getLatestTelemetry, {});
    return jsonResponse(
      {
        refresh: refreshResult,
        telemetry,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),
});

http.route({
  path: "/weather/open-meteo/refresh",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/fuel/ttf/latest",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    const shouldRefresh = booleanParam(searchParams, "refresh") ?? false;

    if (shouldRefresh) {
      await ctx.runAction(api.iceTtf.refreshIceTtf, ttfRefreshArgsFromSearch(searchParams));
    }

    const panel = await ctx.runQuery(api.iceTtf.getDashboardPanel, {});
    if (!panel) {
      return jsonResponse(
        {
          error: "No cached ICE TTF data is available yet. Call POST /fuel/ttf/refresh first.",
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return jsonResponse(panel, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  }),
});

http.route({
  path: "/fuel/ttf/latest",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/fuel/ttf/panel",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    const { refreshResult, fetchId } = await refreshTtfFromSearch(ctx, searchParams);
    const data = await ctx.runQuery(api.iceTtf.getTtfByFetchId, {
      fetchId: ttfFetchIdFromRefresh(fetchId),
      includeContracts: true,
      includeIntraday: true,
      includeHistorical: true,
    });
    return jsonResponse(
      {
        refresh: refreshResult,
        ...data,
        panel: {
          title: "Dutch TTF Natural Gas",
          description: "Flexible ICE TTF data surface for dashboard cards, curves, and charts.",
          cards: [
            "currentPrice",
            "fuelCostProxy",
            "forwardCurve",
            "intradayTrend",
            "historicalTrend",
            "dataFreshness",
          ],
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  }),
});

http.route({
  path: "/fuel/ttf/panel",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/fuel/ttf/contracts",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    const { refreshResult, fetchId } = await refreshTtfFromSearch(ctx, searchParams);
    const data = await ctx.runQuery(api.iceTtf.getTtfByFetchId, {
      fetchId: ttfFetchIdFromRefresh(fetchId),
      includeContracts: true,
      includeIntraday: false,
      includeHistorical: false,
    });
    return jsonResponse(
      {
        refresh: refreshResult,
        fetch: data?.fetch,
        instrument: data?.instrument,
        selectedContract: data?.selectedContract,
        contracts: data?.contracts,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  }),
});

http.route({
  path: "/fuel/ttf/contracts",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/fuel/ttf/intraday",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    const { refreshResult, fetchId } = await refreshTtfFromSearch(ctx, searchParams);
    const data = await ctx.runQuery(api.iceTtf.getTtfByFetchId, {
      fetchId: ttfFetchIdFromRefresh(fetchId),
      includeContracts: false,
      includeIntraday: true,
      includeHistorical: false,
    });
    return jsonResponse(
      {
        refresh: refreshResult,
        fetch: data?.fetch,
        instrument: data?.instrument,
        selectedContract: data?.selectedContract,
        intradayBars: data?.intradayBars,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=180",
        },
      },
    );
  }),
});

http.route({
  path: "/fuel/ttf/intraday",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/fuel/ttf/historical",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    const { refreshResult, fetchId } = await refreshTtfFromSearch(ctx, searchParams);
    const data = await ctx.runQuery(api.iceTtf.getTtfByFetchId, {
      fetchId: ttfFetchIdFromRefresh(fetchId),
      includeContracts: false,
      includeIntraday: false,
      includeHistorical: true,
    });
    return jsonResponse(
      {
        refresh: refreshResult,
        fetch: data?.fetch,
        instrument: data?.instrument,
        selectedContract: data?.selectedContract,
        historicalBars: data?.historicalBars,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=1800",
        },
      },
    );
  }),
});

http.route({
  path: "/fuel/ttf/historical",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/fuel/ttf/refresh",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = request.headers.get("content-type")?.includes("application/json")
      ? ((await request.json()) as Record<string, unknown>)
      : {};
    const refreshResult = await ctx.runAction(api.iceTtf.refreshIceTtf, {
      force: typeof body.force === "boolean" ? body.force : undefined,
      maxAgeMinutes: typeof body.maxAgeMinutes === "number" ? body.maxAgeMinutes : undefined,
      contractSelection: typeof body.contractSelection === "string" ? body.contractSelection : undefined,
      marketId: typeof body.marketId === "number" ? body.marketId : undefined,
      historicalSpan: typeof body.historicalSpan === "string" ? body.historicalSpan : undefined,
      efficiency: typeof body.efficiency === "number" ? body.efficiency : undefined,
    });
    const panel = await ctx.runQuery(api.iceTtf.getDashboardPanel, {});
    return jsonResponse(
      {
        refresh: refreshResult,
        panel,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),
});

http.route({
  path: "/fuel/ttf/refresh",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/market/eex/context/latest",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    const shouldRefresh = booleanParam(searchParams, "refresh") ?? false;

    if (shouldRefresh) {
      await ctx.runAction(api.eex.refreshEexContext, {
        force: booleanParam(searchParams, "force"),
        maxAgeMinutes: numberParam(searchParams, "maxAgeMinutes"),
        lookbackDays: numberParam(searchParams, "lookbackDays"),
        greekPowerShortCode: searchParams.get("greekPowerShortCode") ?? undefined,
        greekPowerMaturity: searchParams.get("greekPowerMaturity") ?? undefined,
      });
    }

    const context = await ctx.runQuery(api.eex.getLatestEexContext, {});
    if (!context) {
      return jsonResponse(
        {
          error: "No cached EEX context is available yet. Call POST /market/eex/context/refresh first.",
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return jsonResponse(context, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  }),
});

http.route({
  path: "/market/eex/context/latest",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/market/eex/context/refresh",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = request.headers.get("content-type")?.includes("application/json")
      ? ((await request.json()) as Record<string, unknown>)
      : {};
    const refreshResult = await ctx.runAction(api.eex.refreshEexContext, {
      force: typeof body.force === "boolean" ? body.force : undefined,
      maxAgeMinutes: typeof body.maxAgeMinutes === "number" ? body.maxAgeMinutes : undefined,
      lookbackDays: typeof body.lookbackDays === "number" ? body.lookbackDays : undefined,
      greekPowerShortCode:
        typeof body.greekPowerShortCode === "string" ? body.greekPowerShortCode : undefined,
      greekPowerMaturity: typeof body.greekPowerMaturity === "string" ? body.greekPowerMaturity : undefined,
    });
    const context = await ctx.runQuery(api.eex.getLatestEexContext, {});
    return jsonResponse(
      {
        refresh: refreshResult,
        context,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),
});

http.route({
  path: "/market/eex/context/refresh",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

http.route({
  path: "/market/eex/query",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const searchParams = new URL(request.url).searchParams;
    const dataset = stringParam(searchParams, "dataset");
    if (
      dataset !== "catalog" &&
      dataset !== "ticker" &&
      dataset !== "table" &&
      dataset !== "eod" &&
      dataset !== "intraday"
    ) {
      return jsonResponse(
        {
          error: "dataset must be one of catalog, ticker, table, eod, intraday",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await ctx.runAction(api.eex.queryEexMarketData, {
      dataset,
      commodity: stringParam(searchParams, "commodity"),
      pricing: stringParam(searchParams, "pricing"),
      area: stringParam(searchParams, "area"),
      product: stringParam(searchParams, "product"),
      productSpecific: stringParam(searchParams, "productSpecific"),
      maturityType: stringParam(searchParams, "maturityType"),
      maturity: stringParam(searchParams, "maturity"),
      shortCode: stringParam(searchParams, "shortCode"),
      startDate: stringParam(searchParams, "startDate"),
      endDate: stringParam(searchParams, "endDate"),
      underlyingShortCode: stringParam(searchParams, "underlyingShortCode"),
      underlyingMaturity: stringParam(searchParams, "underlyingMaturity"),
    });
    return jsonResponse(result, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  }),
});

http.route({
  path: "/market/eex/query",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = request.headers.get("content-type")?.includes("application/json")
      ? ((await request.json()) as Record<string, unknown>)
      : {};
    const dataset = body.dataset;
    if (
      dataset !== "catalog" &&
      dataset !== "ticker" &&
      dataset !== "table" &&
      dataset !== "eod" &&
      dataset !== "intraday"
    ) {
      return jsonResponse(
        {
          error: "dataset must be one of catalog, ticker, table, eod, intraday",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await ctx.runAction(api.eex.queryEexMarketData, {
      dataset,
      commodity: typeof body.commodity === "string" ? body.commodity : undefined,
      pricing: typeof body.pricing === "string" ? body.pricing : undefined,
      area: typeof body.area === "string" ? body.area : undefined,
      product: typeof body.product === "string" ? body.product : undefined,
      productSpecific: typeof body.productSpecific === "string" ? body.productSpecific : undefined,
      maturityType: typeof body.maturityType === "string" ? body.maturityType : undefined,
      maturity: typeof body.maturity === "string" ? body.maturity : undefined,
      shortCode: typeof body.shortCode === "string" ? body.shortCode : undefined,
      startDate: typeof body.startDate === "string" ? body.startDate : undefined,
      endDate: typeof body.endDate === "string" ? body.endDate : undefined,
      underlyingShortCode:
        typeof body.underlyingShortCode === "string" ? body.underlyingShortCode : undefined,
      underlyingMaturity: typeof body.underlyingMaturity === "string" ? body.underlyingMaturity : undefined,
    });
    return jsonResponse(result, { headers: { "Cache-Control": "no-store" } });
  }),
});

http.route({
  path: "/market/eex/query",
  method: "OPTIONS",
  handler: httpAction(async () => optionsResponse()),
});

export default http;
