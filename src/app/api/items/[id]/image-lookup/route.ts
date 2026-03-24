import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db";
import { inventoryItems } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { memoryGetItem, memoryUpdateItem } from "@/lib/memory-store";
import { lookupProductImageUrls } from "@/lib/openai/image-lookup";

type Params = { params: Promise<{ id: string }> };

async function probeUrl(url: string): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    const res = await fetch(url, { method: "HEAD", signal: c.signal });
    clearTimeout(t);
    const ct = res.headers.get("content-type") ?? "";
    return res.ok && (ct.startsWith("image/") || ct === "application/octet-stream");
  } catch {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 8000);
      const res = await fetch(url, { method: "GET", signal: c.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
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

      const nextUrls = verified.length ? verified : urls;
      memoryUpdateItem(id, {
        candidateImageUrls: nextUrls.length ? nextUrls : urls,
      });

      return Response.json({
        candidateImageUrls: nextUrls.length ? nextUrls : urls,
        source,
        message:
          verified.length === 0 && urls.length === 0
            ? "No images returned. Try manual URL upload or check OPENAI_API_KEY / web search availability."
            : undefined,
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

    await db
      .update(inventoryItems)
      .set({
        candidateImageUrls: verified.length ? verified : urls,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, id));

    return Response.json({
      candidateImageUrls: verified.length ? verified : urls,
      source,
      message:
        verified.length === 0 && urls.length === 0
          ? "No images returned. Try manual URL upload or check OPENAI_API_KEY / web search availability."
          : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Image lookup failed";
    return Response.json({ error: message, candidateImageUrls: [] }, { status: 502 });
  }
}
