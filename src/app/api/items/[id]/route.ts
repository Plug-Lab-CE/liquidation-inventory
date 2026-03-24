import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { inventoryItems } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { recomputeSalePrice } from "@/lib/process-manifest";

const employeePatchSchema = z
  .object({
    conditionNotes: z.string().nullable().optional(),
    discountPercent: z
      .union([z.literal(30), z.literal(40), z.literal(50), z.literal(60), z.null()])
      .optional(),
    accountedFor: z.boolean().optional(),
    selectedImageUrls: z.array(z.string().min(1)).max(10).optional(),
  })
  .strict();

const adminPendingPatchSchema = employeePatchSchema.extend({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(20000).nullable().optional(),
  salePrice: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
});

const adminApprovalPatchSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(20000).nullable().optional(),
    salePrice: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
    selectedImageUrls: z.array(z.string().min(1)).max(10).optional(),
  })
  .strict();

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const raw = await req.json().catch(() => ({}));

  const authProbe = await requireSession();
  if ("response" in authProbe) return authProbe.response;

  const { session } = authProbe;
  const isAdmin = session.user.role === "administrator";

  const [existing] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1);

  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let parsed: ReturnType<(typeof employeePatchSchema)["safeParse"]>;

  if (!isAdmin) {
    if (existing.status !== "pending_review") {
      return Response.json({ error: "Employees can only edit pending items" }, { status: 403 });
    }
    parsed = employeePatchSchema.safeParse(raw);
  } else if (existing.status === "pending_review") {
    parsed = adminPendingPatchSchema.safeParse(raw) as typeof parsed;
  } else if (existing.status === "awaiting_approval" || existing.status === "published") {
    parsed = adminApprovalPatchSchema.safeParse(raw) as typeof parsed;
  } else {
    return Response.json({ error: "Invalid item status" }, { status: 400 });
  }

  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if ("conditionNotes" in data && data.conditionNotes !== undefined) {
    updates.conditionNotes = data.conditionNotes;
  }
  if ("accountedFor" in data && data.accountedFor !== undefined) {
    updates.accountedFor = data.accountedFor;
  }
  if ("selectedImageUrls" in data && data.selectedImageUrls !== undefined) {
    updates.selectedImageUrls = data.selectedImageUrls;
  }

  if ("title" in data && data.title !== undefined) {
    updates.title = data.title;
  }
  if ("description" in data && data.description !== undefined) {
    updates.description = data.description;
  }

  let discountPercent = existing.discountPercent;
  if ("discountPercent" in data && data.discountPercent !== undefined) {
    discountPercent = data.discountPercent;
    updates.discountPercent = discountPercent;
  }

  if ("salePrice" in data && data.salePrice !== undefined) {
    updates.salePrice = data.salePrice;
  } else if ("discountPercent" in data && data.discountPercent !== undefined) {
    const sale = recomputeSalePrice(existing.unitRetail, discountPercent);
    updates.salePrice = sale;
  }

  await db
    .update(inventoryItems)
    .set(updates as typeof inventoryItems.$inferInsert)
    .where(eq(inventoryItems.id, id));

  await writeAudit({
    userId: session.user.id,
    action: "item_patch",
    entityType: "inventory_item",
    entityId: id,
    payload: data as Record<string, unknown>,
  });

  const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);
  return Response.json({ item: row });
}
