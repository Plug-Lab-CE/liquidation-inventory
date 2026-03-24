import { eq } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems } from "@/db/schema";
import { requireAdmin } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { shopifyCreateProduct } from "@/lib/shopify";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const authResult = await requireAdmin();
  if ("response" in authResult) return authResult.response;

  const { id } = await params;
  const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);

  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (row.status !== "awaiting_approval") {
    return Response.json({ error: "Item must be awaiting approval" }, { status: 400 });
  }

  if (!row.salePrice) {
    return Response.json({ error: "Missing sale price" }, { status: 400 });
  }

  try {
    const bodyHtml = [
      row.description ? `<p>${escapeHtml(row.description)}</p>` : "",
      row.conditionNotes
        ? `<p><strong>Condition notes:</strong> ${escapeHtml(row.conditionNotes)}</p>`
        : "",
      row.upc ? `<p>UPC: ${escapeHtml(row.upc)}</p>` : "",
    ]
      .filter(Boolean)
      .join("");

    const result = await shopifyCreateProduct({
      title: row.title,
      bodyHtml: bodyHtml || "<p></p>",
      price: String(row.salePrice),
      compareAtPrice: row.unitRetail ? String(row.unitRetail) : null,
      quantity: row.quantity,
      sku: row.upc ? `UPC-${row.upc}` : row.id.slice(0, 12),
      imageUrls: row.selectedImageUrls ?? [],
    });

    await db
      .update(inventoryItems)
      .set({
        status: "published",
        shopifyProductId: result.productId,
        shopifyVariantId: result.variantId,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, id));

    await writeAudit({
      userId: authResult.session.user.id,
      action: "publish_shopify",
      entityType: "inventory_item",
      entityId: id,
      payload: { shopifyProductId: result.productId },
    });

    return Response.json({ ok: true, shopifyProductId: result.productId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Shopify error";
    return Response.json({ error: message }, { status: 502 });
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
