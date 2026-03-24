import type { BStockRow } from "@/lib/csv/bstock";

export type DedupedGroup = {
  key: string;
  rows: BStockRow[];
};

function normalizeUpc(upc: string): string {
  return upc.replace(/\D/g, "");
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Dedupe key: UPC digits if present, else brand + description */
export function dedupeKey(row: BStockRow): string {
  const u = normalizeUpc(row.upc);
  if (u.length >= 8) {
    return `upc:${u}`;
  }
  return `desc:${normalizeText(row.brand)}|${normalizeText(row.description)}`;
}

export function groupRows(rows: BStockRow[]): DedupedGroup[] {
  const map = new Map<string, BStockRow[]>();
  for (const row of rows) {
    const key = dedupeKey(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return [...map.entries()].map(([key, r]) => ({ key, rows: r }));
}

export function mergeGroup(group: DedupedGroup) {
  const { rows } = group;
  const first = rows[0];
  const qty = rows.reduce((s, r) => s + (r.qty || 0), 0);
  const extRetail = rows.reduce((s, r) => s + (r.extRetail || 0), 0);
  const unitRetail =
    qty > 0 && extRetail > 0 ? Math.round((extRetail / qty) * 100) / 100 : first.unitRetail;

  const palletIds = [...new Set(rows.map((r) => r.palletId).filter(Boolean))];
  const lotIds = [...new Set(rows.map((r) => r.lotId).filter(Boolean))];

  return {
    quantity: qty,
    unitRetail,
    extRetail,
    brand: first.brand,
    upc: first.upc,
    category: first.category || first.sellerCategory,
    condition: first.condition,
    titleSeed: first.description,
    descriptionSeed: first.description,
    palletIds,
    lotIds,
    sourceRows: rows.map((r) => ({
      itemNumber: r.itemNumber,
      qty: r.qty,
      palletId: r.palletId,
      lotId: r.lotId,
      extRetail: r.extRetail,
    })),
  };
}

export type MergedLine = ReturnType<typeof mergeGroup>;
