import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db";
import { inventoryItems } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { memoryGetItem, memoryUpdateItem } from "@/lib/memory-store";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const authResult = await requireSession();
  if ("response" in authResult) return authResult.response;

  const { id } = await params;

  if (!isDatabaseConfigured()) {
    const row = memoryGetItem(id);
    if (!row) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (row.status !== "pending_review") {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }

    if (!row.accountedFor) {
      return Response.json({ error: "Mark accounted for first" }, { status: 400 });
    }

    if (row.discountPercent == null || row.salePrice == null) {
      return Response.json({ error: "Select a discount / sale price" }, { status: 400 });
    }

    memoryUpdateItem(id, { status: "awaiting_approval" });

    await writeAudit({
      userId: authResult.session.user.id,
      action: "submit_approval",
      entityType: "inventory_item",
      entityId: id,
    });

    return Response.json({ ok: true });
  }

  const db = getDb();
  const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);

  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (row.status !== "pending_review") {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  if (!row.accountedFor) {
    return Response.json({ error: "Mark accounted for first" }, { status: 400 });
  }

  if (row.discountPercent == null || row.salePrice == null) {
    return Response.json({ error: "Select a discount / sale price" }, { status: 400 });
  }

  await db
    .update(inventoryItems)
    .set({ status: "awaiting_approval", updatedAt: new Date() })
    .where(eq(inventoryItems.id, id));

  await writeAudit({
    userId: authResult.session.user.id,
    action: "submit_approval",
    entityType: "inventory_item",
    entityId: id,
  });

  return Response.json({ ok: true });
}
