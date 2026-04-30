import { buildBatterySignals, type SignalPricePoint } from "@/convex/signalScoring";

const ALLOWED_PREFIXES = [
  "/market/dam/",
  "/weather/open-meteo/",
  "/fuel/ttf/",
  "/market/eex/",
  "/signals/",
] as const;

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  return proxyConvexHttp(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyConvexHttp(request, context);
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

async function proxyConvexHttp(request: Request, context: RouteContext) {
  const targetBase = getTargetBaseUrl();
  if (!targetBase) {
    return jsonError("CONVEX_SITE_URL or NEXT_PUBLIC_CONVEX_SITE_URL is not configured.", 503);
  }

  const path = `/${(await context.params).path?.join("/") ?? ""}`;
  if (!ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return jsonError(`Convex HTTP proxy path is not allowed: ${path}`, 404);
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(path, `${targetBase}/`);
  targetUrl.search = incomingUrl.search;

  try {
    const response = await fetch(targetUrl, {
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
      headers: proxyHeaders(request),
      method: request.method,
    });
    if (response.status === 404 && isBatterySignalPath(path) && request.method === "GET") {
      const fallback = await batterySignalFallbackResponse(targetBase, incomingUrl);
      if (fallback) {
        return fallback;
      }
    }
    return new Response(response.body, {
      headers: responseHeaders(response),
      status: response.status,
      statusText: response.statusText,
    });
  } catch {
    return jsonError("Convex HTTP server is unavailable.", 503);
  }
}

async function batterySignalFallbackResponse(targetBase: string, incomingUrl: URL) {
  const searchParams = incomingUrl.searchParams;
  const date = searchParams.get("date");
  const from = searchParams.get("from") ?? date;
  const to = searchParams.get("to") ?? date ?? from;
  if (!from || !to) {
    return null;
  }

  const priceUrl = new URL("/market/dam/prices", `${targetBase}/`);
  priceUrl.searchParams.set("from", from);
  priceUrl.searchParams.set("to", to);
  priceUrl.searchParams.set("limit", searchParams.get("limit") ?? "20000");

  const priceResponse = await fetch(priceUrl, { cache: "no-store" });
  if (!priceResponse.ok) {
    return null;
  }

  const pricePayload = (await priceResponse.json()) as {
    rows?: unknown;
    range?: { from?: unknown; to?: unknown };
  };
  const priceSeries = Array.isArray(pricePayload.rows) ? pricePayload.rows.filter(isSignalPricePoint) : [];
  if (priceSeries.length === 0) {
    return null;
  }

  return Response.json(
    buildBatterySignals({
      context: {
        battery: {
          initialSocMwh: numberSearchParam(searchParams, "initialSocMwh"),
          maxSocMwh: numberSearchParam(searchParams, "maxSocMwh"),
          minSocMwh: numberSearchParam(searchParams, "minSocMwh"),
        },
      },
      dataFreshness: {
        dam: {
          source: "/market/dam/prices",
          status: "observed",
        },
        signalRoute: {
          route: incomingUrl.pathname,
          status: "local-fallback",
        },
      },
      priceSeries,
      range: {
        from: typeof pricePayload.range?.from === "string" ? pricePayload.range.from : from,
        to: typeof pricePayload.range?.to === "string" ? pricePayload.range.to : to,
      },
      source: "battery-signal-engine-local-fallback",
      timezone: "Europe/Athens",
    }),
    { headers: { "Cache-Control": "no-store" } },
  );
}

function isBatterySignalPath(path: string) {
  return path === "/signals/intervals" || path === "/market/dam/battery-signals";
}

function isSignalPricePoint(value: unknown): value is SignalPricePoint {
  if (!value || typeof value !== "object") {
    return false;
  }
  const point = value as Partial<SignalPricePoint>;
  return (
    typeof point.marketDate === "string" &&
    typeof point.timestamp === "string" &&
    typeof point.mtu === "number" &&
    typeof point.mcpEurPerMwh === "number" &&
    Number.isFinite(point.mcpEurPerMwh)
  );
}

function numberSearchParam(searchParams: URLSearchParams, key: string) {
  const value = Number(searchParams.get(key));
  return Number.isFinite(value) ? value : undefined;
}

function getTargetBaseUrl() {
  const value = process.env.CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  return value?.trim().replace(/\/+$/, "") || null;
}

function proxyHeaders(request: Request) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  return headers;
}

function responseHeaders(response: Response) {
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  headers.set("cache-control", "no-store");
  return headers;
}

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}
