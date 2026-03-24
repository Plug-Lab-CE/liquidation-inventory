import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { ITEMS_PAGE_SIZE } from "@/lib/limits";

function serializeItem(row: typeof inventoryItems.$inferSelect) {
  return {
    id: row.id,
    manifestId: row.manifestId,
    status: row.status,
    title: row.title,
    description: row.description,
    quantity: row.quantity,
    unitRetail: row.unitRetail,
    extRetail: row.extRetail,
    brand: row.brand,
    upc: row.upc,
    category: row.category,
    condition: row.condition,
    palletIds: row.palletIds,
    lotIds: row.lotIds,
    conditionNotes: row.conditionNotes,
    discountPercent: row.discountPercent,
    salePrice: row.salePrice,
    accountedFor: row.accountedFor,
    candidateImageUrls: row.candidateImageUrls,
    selectedImageUrls: row.selectedImageUrls,
    shopifyProductId: row.shopifyProductId,
    shopifyVariantId: row.shopifyVariantId,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(req: Request) {
  const authResult = await requireSession();
  if ("response" in authResult) return authResult.response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as
    | "pending_review"
    | "awaiting_approval"
    | "published"
    | null;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Number(searchParams.get("pageSize") ?? ITEMS_PAGE_SIZE));
  const manifestId = searchParams.get("manifestId");

  if (
    status &&
    status !== "pending_review" &&
    status !== "awaiting_approval" &&
    status !== "published"
  ) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  const conditions = [];
  if (status) conditions.push(eq(inventoryItems.status, status));
  if (manifestId) conditions.push(eq(inventoryItems.manifestId, manifestId));

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const [totalRow] = await db
    .select({ n: count() })
    .from(inventoryItems)
    .where(whereClause);

  const total = totalRow?.n ?? 0;
  const offset = (page - 1) * pageSize;

  const rows = await db
    .select()
    .from(inventoryItems)
    .where(whereClause)
    .orderBy(desc(inventoryItems.updatedAt))
    .limit(pageSize)
    .offset(offset);

  return Response.json({
    items: rows.map(serializeItem),
    page,
    pageSize,
    total: Number(total),
    totalPages: Math.ceil(Number(total) / pageSize) || 1,
  });
}
