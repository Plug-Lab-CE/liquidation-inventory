import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { inventoryItems } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

export async function POST(req: Request) {
  const authResult = await requireSession();
  if ("response" in authResult) return authResult.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { ids } = parsed.data;
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(and(inArray(inventoryItems.id, ids), eq(inventoryItems.status, "pending_review")));

  const okIds: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    const row = rows.find((r) => r.id === id);
    if (!row) {
      failed.push({ id, reason: "not_found_or_wrong_status" });
      continue;
    }
    if (!row.accountedFor) {
      failed.push({ id, reason: "not_accounted_for" });
      continue;
    }
    if (row.discountPercent == null || row.salePrice == null) {
      failed.push({ id, reason: "missing_price" });
      continue;
    }
    okIds.push(id);
  }

  if (okIds.length) {
    await db
      .update(inventoryItems)
      .set({ status: "awaiting_approval", updatedAt: new Date() })
      .where(inArray(inventoryItems.id, okIds));
  }

  await writeAudit({
    userId: authResult.session.user.id,
    action: "bulk_submit_approval",
    entityType: "inventory_item",
    entityId: "bulk",
    payload: { okIds, failed },
  });

  return Response.json({ submitted: okIds.length, okIds, failed });
}
