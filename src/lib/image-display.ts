/**
 * Same-origin proxy URL for remote images so retailer CDNs don't block the browser
 * (Referer / hotlink rules). Local uploads and data URLs pass through unchanged.
 */
export function imageSrcForDisplay(url: string): string {
  const t = url.trim();
  if (!t) return t;
  if (t.startsWith("/") || t.startsWith("data:")) return t;
  try {
    const u = new URL(t);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return `/api/proxy-image?url=${encodeURIComponent(t)}`;
    }
  } catch {
    return t;
  }
  return t;
}
