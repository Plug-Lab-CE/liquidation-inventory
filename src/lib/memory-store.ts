import { randomUUID } from "crypto";
import { normalizeBarcodeDigits } from "@/lib/barcode-normalize";

export type MemoryManifest = {
  id: string;
  originalFilename: string;
  status: "processing" | "ready" | "failed";
  errorMessage: string | null;
  createdAt: Date;
};

export type MemoryItem = {
  id: string;
  manifestId: string;
  status: "pending_review" | "awaiting_approval" | "published";
  title: string;
  description: string | null;
  quantity: number;
  unitRetail: string | null;
  extRetail: string | null;
  brand: string | null;
  upc: string | null;
  category: string | null;
  condition: string | null;
  palletIds: string[];
  lotIds: string[];
  sourceRows: Record<string, unknown>[];
  conditionNotes: string | null;
  discountPercent: number | null;
  salePrice: string | null;
  accountedFor: boolean;
  candidateImageUrls: string[];
  selectedImageUrls: string[];
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const KEY = Symbol.for("__liq_memory_store_v1");

function getStore(): { manifests: MemoryManifest[]; items: MemoryItem[] } {
  const g = globalThis as Record<symbol, { manifests: MemoryManifest[]; items: MemoryItem[] }>;
  if (!g[KEY]) {
    g[KEY] = { manifests: [], items: [] };
  }
  return g[KEY];
}

export function memoryAddManifest(m: MemoryManifest) {
  getStore().manifests.unshift(m);
}

export function memoryUpdateManifest(id: string, patch: Partial<MemoryManifest>) {
  const m = getStore().manifests.find((x) => x.id === id);
  if (m) Object.assign(m, patch);
}

export function memoryListManifests(): MemoryManifest[] {
  return [...getStore().manifests].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

export function memoryGetManifest(id: string): MemoryManifest | undefined {
  return getStore().manifests.find((m) => m.id === id);
}

export type MemoryItemInsert = Omit<MemoryItem, "id" | "createdAt" | "updatedAt">;

export function memoryAddItems(rows: MemoryItemInsert[]) {
  const now = new Date();
  for (const r of rows) {
    getStore().items.push({
      ...r,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
  }
}

export function memoryListItems(opts: {
  status?: string;
  manifestId?: string;
  page: number;
  pageSize: number;
}): { items: MemoryItem[]; total: number } {
  let list = getStore().items;
  if (opts.status) list = list.filter((i) => i.status === opts.status);
  if (opts.manifestId) list = list.filter((i) => i.manifestId === opts.manifestId);
  list = [...list].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const total = list.length;
  const start = (opts.page - 1) * opts.pageSize;
  return { items: list.slice(start, start + opts.pageSize), total };
}

export function memoryGetItem(id: string): MemoryItem | undefined {
  return getStore().items.find((i) => i.id === id);
}

/** Pending items whose stored UPC matches normalized digits (for barcode scan). */
export function memoryListPendingByUpcDigits(normalizedDigits: string): MemoryItem[] {
  return getStore().items.filter(
    (i) =>
      i.status === "pending_review" &&
      i.upc &&
      normalizeBarcodeDigits(i.upc) === normalizedDigits,
  );
}

export function memoryUpdateItem(id: string, patch: Partial<MemoryItem>): boolean {
  const i = getStore().items.find((x) => x.id === id);
  if (!i) return false;
  Object.assign(i, patch, { updatedAt: new Date() });
  return true;
}

export function memoryCountItemsForManifest(manifestId: string): number {
  return getStore().items.filter((it) => it.manifestId === manifestId).length;
}
