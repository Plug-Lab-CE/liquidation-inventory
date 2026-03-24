import { extensionForImageMime, sniffImageContentType } from "@/lib/image-sniff";
import { isSafeRemoteImageUrl } from "@/lib/remote-image-url";

const MAX_BYTES = 4 * 1024 * 1024;

const fetchHeaders = {
  Accept: "image/*,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

/**
 * Downloads a remote image with SSRF checks and validates bytes (same limits as user uploads).
 * Used to copy AI-suggested URLs into local storage so the UI can show them without a proxy.
 */
export async function fetchRemoteImageForSave(
  url: string,
): Promise<{ buffer: Buffer; extension: string } | null> {
  if (!isSafeRemoteImageUrl(url)) return null;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);

  try {
    const upstream = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: fetchHeaders,
    });

    if (!upstream.ok) return null;

    const len = upstream.headers.get("content-length");
    if (len && Number(len) > MAX_BYTES) return null;

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > MAX_BYTES) return null;

    const rawCt = upstream.headers.get("content-type") ?? "";
    const baseCt = rawCt.split(";")[0]!.trim().toLowerCase();
    const sniffed = sniffImageContentType(buffer);

    let mime: string | null = sniffed;
    if (!mime && baseCt.startsWith("image/")) {
      mime = baseCt;
    }
    if (!mime) return null;

    return {
      buffer,
      extension: extensionForImageMime(mime),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
