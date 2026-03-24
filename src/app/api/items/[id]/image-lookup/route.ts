import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db";
import { inventoryItems } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { fetchRemoteImageForSave } from "@/lib/fetch-remote-image";
import { memoryGetItem, memoryUpdateItem } from "@/lib/memory-store";
import { lookupProductImageUrls } from "@/lib/openai/image-lookup";
import { savePublicImage } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

const fetchHeaders = {
  Accept: "image/*,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

async function persistCandidateImagesFromUrls(
  itemId: string,
  urls: string[],
  max: number,
): Promise<string[]> {
  const out: string[] = [];
  for (const u of urls) {
    if (out.length >= max) break;
    const got = await fetchRemoteImageForSave(u);
    if (!got) continue;
    const name = `${itemId}-${randomUUID()}.${got.extension}`;
    const publicPath = await savePublicImage(name, got.buffer);
    out.push(publicPath);
  }
  return out;
}

async function probeUrl(url: string): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    const res = await fetch(url, { method: "HEAD", signal: c.signal, headers: fetchHeaders });
    clearTimeout(t);
    const ct = res.headers.get("content-type") ?? "";
    if (res.ok && (ct.startsWith("image/") || ct === "application/octet-stream")) return true;
  } catch {
    /* try GET */
  }
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    const res = await fetch(url, {
      method: "GET",
      signal: c.signal,
      headers: fetchHeaders,
    });
    clearTimeout(t);
    const ct = res.headers.get("content-type") ?? "";
    return (
      res.ok && (ct.startsWith("image/") || ct === "application/octet-stream" || ct === "")
    );
  } catch {
    return false;
  }
}

export async function POST(_req: Request, { params }: Params) {
  const authResult = await requireSession();
  if ("response" in authResult) return authResult.response;

  const { id } = await params;

  if (!isDatabaseConfigured()) {
    const row = memoryGetItem(id);
    if (!row) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    try {
      const { urls, source } = await lookupProductImageUrls({
        title: row.title,
        brand: row.brand,
        upc: row.upc,
      });

      const verified: string[] = [];
      for (const u of urls) {
        if (verified.length >= 5) break;
        if (await probeUrl(u)) verified.push(u);
      }

      const sourceUrls = verified.length ? verified : urls;
      const persisted = await persistCandidateImagesFromUrls(id, sourceUrls, 5);
      const candidateImageUrls =
        persisted.length > 0 ? persisted : sourceUrls.slice(0, 5);

      memoryUpdateItem(id, { candidateImageUrls });

      let message: string | undefined;
      if (verified.length === 0 && urls.length === 0) {
        message =
          "No images returned. Check OPENAI_API_KEY / web search availability, or upload photos.";
      } else if (persisted.length === 0 && sourceUrls.length > 0) {
        message =
          "Found image links but could not download them for preview (blocked or invalid). Try again or use drag-and-drop / upload.";
      }

      return Response.json({
        candidateImageUrls,
        source,
        message,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Image lookup failed";
      return Response.json({ error: message, candidateImageUrls: [] }, { status: 502 });
    }
  }

  const db = getDb();
  const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);

  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { urls, source } = await lookupProductImageUrls({
      title: row.title,
      brand: row.brand,
      upc: row.upc,
    });

    const verified: string[] = [];
    for (const u of urls) {
      if (verified.length >= 5) break;
      if (await probeUrl(u)) verified.push(u);
    }

    const sourceUrls = verified.length ? verified : urls;
    const persisted = await persistCandidateImagesFromUrls(id, sourceUrls, 5);
    const candidateImageUrls =
      persisted.length > 0 ? persisted : sourceUrls.slice(0, 5);

    await db
      .update(inventoryItems)
      .set({
        candidateImageUrls,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, id));

    let message: string | undefined;
    if (verified.length === 0 && urls.length === 0) {
      message =
        "No images returned. Check OPENAI_API_KEY / web search availability, or upload photos.";
    } else if (persisted.length === 0 && sourceUrls.length > 0) {
      message =
        "Found image links but could not download them for preview (blocked or invalid). Try again or use drag-and-drop / upload.";
    }

    return Response.json({
      candidateImageUrls,
      source,
      message,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Image lookup failed";
    return Response.json({ error: message, candidateImageUrls: [] }, { status: 502 });
  }
}
