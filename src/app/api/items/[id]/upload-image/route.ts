import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db";
import { inventoryItems } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { memoryGetItem, memoryUpdateItem } from "@/lib/memory-store";
import { savePublicImage } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const authResult = await requireSession();
  if ("response" in authResult) return authResult.response;

  const { id } = await params;

  if (!isDatabaseConfigured()) {
    const row = memoryGetItem(id);
    if (!row) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (row.status !== "pending_review" && row.status !== "awaiting_approval") {
      return Response.json({ error: "Cannot attach images in this status" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.type.startsWith("image/")) {
      return Response.json({ error: "Missing image file" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) {
      return Response.json({ error: "Image too large" }, { status: 413 });
    }

    const name = `${id}-${randomUUID()}-${file.name}`;
    const publicPath = await savePublicImage(name, buf);
    const next = [...(row.selectedImageUrls ?? []), publicPath];
    memoryUpdateItem(id, { selectedImageUrls: next });

    return Response.json({ url: publicPath, selectedImageUrls: next });
  }

  const db = getDb();
  const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);

  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (row.status !== "pending_review" && row.status !== "awaiting_approval") {
    return Response.json({ error: "Cannot attach images in this status" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return Response.json({ error: "Missing image file" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 4 * 1024 * 1024) {
    return Response.json({ error: "Image too large" }, { status: 413 });
  }

  const name = `${id}-${randomUUID()}-${file.name}`;
  const publicPath = await savePublicImage(name, buf);
  const next = [...(row.selectedImageUrls ?? []), publicPath];

  await db
    .update(inventoryItems)
    .set({ selectedImageUrls: next, updatedAt: new Date() })
    .where(eq(inventoryItems.id, id));

  return Response.json({ url: publicPath, selectedImageUrls: next });
}
