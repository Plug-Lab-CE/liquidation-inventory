import { isIP } from "node:net";

/**
 * Reject URLs that would be unsafe to fetch server-side (SSRF).
 */
export function isSafeRemoteImageUrl(urlString: string): boolean {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "metadata.google.internal") return false;

  const ipVer = isIP(host);
  if (ipVer === 4) {
    const [a, b] = host.split(".").map((n) => Number(n));
    if (a === 127 || a === 10) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    if (a === 0) return false;
  }
  if (ipVer === 6) {
    const h = host.toLowerCase();
    if (h === "::1") return false;
    if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:")) return false;
  }

  return true;
}

/** Strip trailing junk from scraped URLs (quotes, brackets, markdown). */
export function normalizeScrapedImageUrl(url: string): string {
  return url.replace(/^[\s"'([{]+/, "").replace(/[)\].,'"}\s]+$/g, "").trim();
}
