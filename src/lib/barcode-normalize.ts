/** Strip non-digits for UPC/EAN comparison (aligned with manifest UPC handling). */
export function normalizeBarcodeDigits(code: string): string {
  return code.replace(/\D/g, "");
}

/** Minimum digit length to treat as a UPC/EAN-style barcode lookup. */
export const MIN_BARCODE_DIGITS = 8;
