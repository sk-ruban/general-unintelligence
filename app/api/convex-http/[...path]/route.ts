const ALLOWED_PREFIXES = ["/market/dam/", "/weather/open-meteo/", "/fuel/ttf/", "/market/eex/"] as const;

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
    return new Response(response.body, {
      headers: responseHeaders(response),
      status: response.status,
      statusText: response.statusText,
    });
  } catch {
    return jsonError("Convex HTTP server is unavailable.", 503);
  }
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
