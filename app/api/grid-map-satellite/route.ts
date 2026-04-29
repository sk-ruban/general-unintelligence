import { GRID_MAP_CACHE_SECONDS, SATELLITE_EXPORT_URL } from "@/lib/grid-map";

export const revalidate = 2592000;

export async function GET() {
  const response = await fetch(SATELLITE_EXPORT_URL, {
    next: { revalidate: GRID_MAP_CACHE_SECONDS },
  });

  if (!response.ok || !response.body) {
    return new Response("Grid map imagery unavailable", {
      status: 502,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(response.body, {
    headers: {
      "Cache-Control": `public, max-age=86400, s-maxage=${GRID_MAP_CACHE_SECONDS}, stale-while-revalidate=604800`,
      "Content-Type": response.headers.get("content-type") ?? "image/jpeg",
    },
  });
}
