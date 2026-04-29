export function getConvexSiteUrl() {
  return cleanUrl(process.env.NEXT_PUBLIC_CONVEX_SITE_URL);
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
