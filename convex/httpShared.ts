export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function jsonResponse(body: unknown, init?: ResponseInit) {
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

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export function numberParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  if (value === null || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function booleanParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  if (value === null) {
    return undefined;
  }
  return value === "1" || value.toLowerCase() === "true";
}

export function stringParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  return value === null || value.trim() === "" ? undefined : value;
}

export function ttfRefreshArgsFromSearch(searchParams: URLSearchParams) {
  return {
    force: booleanParam(searchParams, "force"),
    maxAgeMinutes: numberParam(searchParams, "maxAgeMinutes"),
    contractSelection: stringParam(searchParams, "contractSelection"),
    marketId: numberParam(searchParams, "marketId"),
    historicalSpan: stringParam(searchParams, "historicalSpan"),
    efficiency: numberParam(searchParams, "efficiency"),
  };
}

export function fetchIdFromRefresh(refreshResult: unknown) {
  if (refreshResult !== null && typeof refreshResult === "object" && "fetchId" in refreshResult) {
    const fetchId = (refreshResult as { fetchId?: unknown }).fetchId;
    return typeof fetchId === "string" ? fetchId : undefined;
  }
  return undefined;
}

export function weatherFetchSelectorFromSearch(searchParams: URLSearchParams) {
  return {
    fetchId: stringParam(searchParams, "fetchId") as any,
    asOfFetchedAtUtc: stringParam(searchParams, "asOf") ?? stringParam(searchParams, "asOfFetchedAtUtc"),
  };
}

export function damDateRangeFromSearch(searchParams: URLSearchParams) {
  return {
    date: stringParam(searchParams, "date"),
    from: stringParam(searchParams, "from"),
    to: stringParam(searchParams, "to"),
  };
}
