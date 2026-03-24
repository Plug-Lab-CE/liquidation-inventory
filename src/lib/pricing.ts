const ALLOWED = new Set([30, 40, 50, 60]);

export function salePriceFromDiscount(
  unitRetail: string | null | undefined,
  discountPercent: number | null | undefined,
): string | null {
  if (unitRetail == null || discountPercent == null) return null;
  if (!ALLOWED.has(discountPercent)) return null;
  const n = Number(unitRetail);
  if (!Number.isFinite(n)) return null;
  const sale = (n * (100 - discountPercent)) / 100;
  return sale.toFixed(2);
}
