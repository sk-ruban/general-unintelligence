export function getConvexSiteUrl() {
  if (typeof window !== "undefined") {
    return "/api/convex-http";
  }
  const siteUrl = cleanUrl(process.env.NEXT_PUBLIC_CONVEX_SITE_URL);
  if (!siteUrl) {
    return null;
  }
  return siteUrl;
}

export function getConvexUrl() {
  return cleanUrl(process.env.NEXT_PUBLIC_CONVEX_URL);
}

function cleanUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}
