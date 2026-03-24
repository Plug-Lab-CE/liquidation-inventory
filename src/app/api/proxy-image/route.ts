import { requireSession } from "@/lib/api-auth";
import { isSafeRemoteImageUrl } from "@/lib/remote-image-url";

const MAX_BYTES = 8 * 1024 * 1024;

/** When upstream omits or mislabels Content-Type, still serve bytes the probe accepted. */
function sniffImageContentType(buf: Buffer): string | null {
  if (buf.length < 3) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  const sig6 = buf.subarray(0, 6).toString("latin1");
  if (sig6 === "GIF87a" || sig6 === "GIF89a") return "image/gif";
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Fetches a remote image server-side so the browser can display it without
 * hotlink / referrer blocks. Requires session (same as other /api routes).
 */
export async function GET(req: Request) {
  const authResult = await requireSession();
  if ("response" in authResult) return authResult.response;

  const raw = new URL(req.url).searchParams.get("url");
  if (!raw || !isSafeRemoteImageUrl(raw)) {
    return Response.json({ error: "Invalid or disallowed URL" }, { status: 400 });
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);

  try {
    const upstream = await fetch(raw, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!upstream.ok) {
      return Response.json({ error: "Image not found" }, { status: 502 });
    }

    const len = upstream.headers.get("content-length");
    if (len && Number(len) > MAX_BYTES) {
      return Response.json({ error: "Image too large" }, { status: 413 });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return Response.json({ error: "Image too large" }, { status: 413 });
    }

    const rawCt = upstream.headers.get("content-type") ?? "";
    const baseCt = rawCt.split(";")[0]!.trim().toLowerCase();
    const sniffed = sniffImageContentType(buf);

    let outCt: string | null = null;
    if (sniffed) {
      outCt = sniffed;
    } else if (baseCt.startsWith("image/")) {
      outCt = baseCt;
    } else if (baseCt === "application/octet-stream" || baseCt === "binary/octet-stream") {
      return Response.json({ error: "Not an image" }, { status: 400 });
    }

    if (!outCt) {
      return Response.json({ error: "Not an image" }, { status: 400 });
    }

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": outCt,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "Failed to load image" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
