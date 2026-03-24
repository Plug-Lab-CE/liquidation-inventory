import { readFile } from "fs/promises";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { inventoryItems, manifestUploads } from "@/db/schema";
import { parseBStockCsv } from "@/lib/csv/bstock";
import { groupRows, mergeGroup } from "@/lib/dedupe";
import { normalizeMergedItems } from "@/lib/openai/normalize-manifest";
import { salePriceFromDiscount } from "@/lib/pricing";
import { MAX_CSV_ROWS } from "@/lib/limits";
import type { MemoryItemInsert } from "@/lib/memory-store";

export async function buildMemoryItemsFromCsv(
  manifestId: string,
  csvContent: string,
): Promise<MemoryItemInsert[]> {
  const rows = parseBStockCsv(csvContent);
  if (rows.length > MAX_CSV_ROWS) {
    throw new Error(`Too many rows (max ${MAX_CSV_ROWS})`);
  }

  const groups = groupRows(rows);
  const merged = groups.map(mergeGroup);
  const normalized = await normalizeMergedItems(merged);

  return merged.map((m, i) => {
    const n = normalized[i]!;
    const unitStr =
      m.unitRetail != null && Number.isFinite(m.unitRetail) ? String(m.unitRetail) : null;
    const extStr =
      m.extRetail != null && Number.isFinite(m.extRetail) ? String(m.extRetail) : null;
    return {
      manifestId,
      status: "pending_review" as const,
      title: n.title,
      description: n.description,
      quantity: m.quantity,
      unitRetail: unitStr,
      extRetail: extStr,
      brand: m.brand || null,
      upc: m.upc || null,
      category: n.displayCategory,
      condition: n.conditionLabel,
      palletIds: m.palletIds,
      lotIds: m.lotIds,
      sourceRows: m.sourceRows as Record<string, unknown>[],
      conditionNotes: null,
      discountPercent: null,
      salePrice: null,
      accountedFor: false,
      candidateImageUrls: [],
      selectedImageUrls: [],
      shopifyProductId: null,
      shopifyVariantId: null,
      publishedAt: null,
    };
  });
}

export async function processManifestFile(manifestId: string) {
  const db = getDb();
  const [manifest] = await db
    .select()
    .from(manifestUploads)
    .where(eq(manifestUploads.id, manifestId))
    .limit(1);

  if (!manifest) {
    throw new Error("Manifest not found");
  }

  try {
    const raw = await readFile(manifest.storagePath, "utf-8");
    const inserts = await buildMemoryItemsFromCsv(manifestId, raw);
    const now = new Date();
    const values = inserts.map((row) => ({
      ...row,
      updatedAt: now,
    }));

    if (values.length) {
      await db.insert(inventoryItems).values(values);
    }

    await db
      .update(manifestUploads)
      .set({ status: "ready", errorMessage: null })
      .where(eq(manifestUploads.id, manifestId));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Processing failed";
    await db
      .update(manifestUploads)
      .set({ status: "failed", errorMessage: message })
      .where(eq(manifestUploads.id, manifestId));
    throw e;
  }
}

export function recomputeSalePrice(
  unitRetail: string | null,
  discountPercent: number | null,
) {
  return salePriceFromDiscount(unitRetail, discountPercent);
}
