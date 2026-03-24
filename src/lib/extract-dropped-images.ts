/** Browser-only: parse drag payloads from Google Images and similar sources. */

function stripUrlJunk(url: string): string {
  return url.replace(/^[\s"'([{]+/, "").replace(/[)\].,'"}\s]+$/g, "").trim();
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;

function looksLikeImageUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (/\.(googleusercontent|gstatic)\./i.test(host)) return true;
    if (IMAGE_EXT.test(url.pathname + url.search)) return true;
    return false;
  } catch {
    return false;
  }
}

/** Chrome / Chromium: `filename:mime:url` (URL may contain colons). */
function parseDownloadUrlLine(line: string): string | null {
  const t = line.trim();
  if (!t) return null;
  const first = t.indexOf(":");
  const second = t.indexOf(":", first + 1);
  if (first < 0 || second < 0) return null;
  const url = stripUrlJunk(t.slice(second + 1));
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return null;
}

function urlsFromHtml(html: string): string[] {
  if (!html.trim()) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: string[] = [];
  for (const img of doc.querySelectorAll("img[src], img[data-src]")) {
    const el = img as HTMLImageElement;
    const s = el.getAttribute("src") || el.getAttribute("data-src");
    if (s) {
      try {
        out.push(stripUrlJunk(new URL(s, "https://www.google.com").href));
      } catch {
        const u = stripUrlJunk(s);
        if (u.startsWith("http://") || u.startsWith("https://")) out.push(u);
      }
    }
  }
  for (const a of doc.querySelectorAll("a[href]")) {
    const h = (a as HTMLAnchorElement).getAttribute("href");
    if (h && looksLikeImageUrl(h)) {
      try {
        out.push(stripUrlJunk(new URL(h, "https://www.google.com").href));
      } catch {
        out.push(stripUrlJunk(h));
      }
    }
  }
  return out.filter(Boolean);
}

export function isPlausibleHttpImageUrl(u: string): boolean {
  try {
    const url = new URL(u.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const h = url.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".localhost")) return false;
    return true;
  } catch {
    return false;
  }
}

export function extractDroppedImages(dt: DataTransfer): { files: File[]; urls: string[] } {
  const urls: string[] = [];
  const files: File[] = [];

  for (let i = 0; i < dt.files.length; i++) {
    const f = dt.files[i];
    if (f?.type.startsWith("image/")) files.push(f);
  }

  const uriList = dt.getData("text/uri-list");
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      if (t.startsWith("http://") || t.startsWith("https://")) {
        const u = stripUrlJunk(t);
        if (looksLikeImageUrl(u)) urls.push(u);
      }
    }
  }

  const plain = dt.getData("text/plain").trim();
  if (plain && (plain.startsWith("http://") || plain.startsWith("https://"))) {
    const u = stripUrlJunk(plain);
    if (looksLikeImageUrl(u)) urls.push(u);
  }

  const downloadUrl = dt.getData("DownloadURL");
  if (downloadUrl) {
    for (const line of downloadUrl.split(/\r?\n/)) {
      const u = parseDownloadUrlLine(line);
      if (u && looksLikeImageUrl(u)) urls.push(u);
    }
  }

  const html = dt.getData("text/html");
  if (html) urls.push(...urlsFromHtml(html));

  const seen = new Set<string>();
  const uniqueUrls: string[] = [];
  for (const u of urls) {
    const n = u.trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    uniqueUrls.push(n);
  }

  return { files, urls: uniqueUrls };
}
