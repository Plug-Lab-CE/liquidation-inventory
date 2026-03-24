import type { ItemDto } from "@/lib/api-types";

type RowLike = {
  id: string;
  manifestId: string;
  status: "pending_review" | "awaiting_approval" | "published";
  title: string;
  description: string | null;
  quantity: number;
  unitRetail: string | number | null;
  extRetail: string | number | null;
  brand: string | null;
  upc: string | null;
  category: string | null;
  condition: string | null;
  palletIds: string[];
  lotIds: string[];
  conditionNotes: string | null;
  discountPercent: number | null;
  salePrice: string | number | null;
  accountedFor: boolean;
  candidateImageUrls: string[];
  selectedImageUrls: string[];
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  publishedAt: Date | string | null;
  updatedAt: Date | string | null;
};

function iso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  if (typeof d === "string") return d;
  return d.toISOString();
}

export function itemRowToDto(row: RowLike): ItemDto {
  return {
    id: row.id,
    manifestId: row.manifestId,
    status: row.status,
    title: row.title,
    description: row.description,
    quantity: row.quantity,
    unitRetail: row.unitRetail != null ? String(row.unitRetail) : null,
    extRetail: row.extRetail != null ? String(row.extRetail) : null,
    brand: row.brand,
    upc: row.upc,
    category: row.category,
    condition: row.condition,
    palletIds: row.palletIds,
    lotIds: row.lotIds,
    conditionNotes: row.conditionNotes,
    discountPercent: row.discountPercent,
    salePrice: row.salePrice != null ? String(row.salePrice) : null,
    accountedFor: row.accountedFor,
    candidateImageUrls: row.candidateImageUrls,
    selectedImageUrls: row.selectedImageUrls,
    shopifyProductId: row.shopifyProductId,
    shopifyVariantId: row.shopifyVariantId,
    publishedAt: iso(row.publishedAt),
    updatedAt: iso(row.updatedAt),
  };
}
