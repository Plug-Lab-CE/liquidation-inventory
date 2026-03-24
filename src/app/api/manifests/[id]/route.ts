import { count, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db";
import { inventoryItems, manifestUploads } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { memoryCountItemsForManifest, memoryGetManifest } from "@/lib/memory-store";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const authResult = await requireSession();
  if ("response" in authResult) return authResult.response;

  const { id } = await params;

  if (!isDatabaseConfigured()) {
    const m = memoryGetManifest(id);
    if (!m) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({
      manifest: {
        id: m.id,
        originalFilename: m.originalFilename,
        status: m.status,
        errorMessage: m.errorMessage,
        createdAt: m.createdAt,
      },
      itemCount: memoryCountItemsForManifest(id),
    });
  }

  const db = getDb();
  const [m] = await db
    .select()
    .from(manifestUploads)
    .where(eq(manifestUploads.id, id))
    .limit(1);

  if (!m) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const [itemCount] = await db
    .select({ n: count() })
    .from(inventoryItems)
    .where(eq(inventoryItems.manifestId, id));

  return Response.json({
    manifest: {
      id: m.id,
      originalFilename: m.originalFilename,
      status: m.status,
      errorMessage: m.errorMessage,
      createdAt: m.createdAt,
    },
    itemCount: itemCount?.n ?? 0,
  });
}
