import { parse } from "csv-parse/sync";

export type BStockRow = {
  itemNumber: string;
  sellerCategory: string;
  description: string;
  qty: number;
  unitRetail: number;
  extRetail: number;
  brand: string;
  upc: string;
  tcin: string;
  origin: string;
  category: string;
  condition: string;
  productClass: string;
  categoryCode: string;
  division: string;
  department: string;
  optoroCondition: string;
  palletId: string;
  subcategory: string;
  lotId: string;
  raw: Record<string, string>;
};

function num(s: string | undefined): number {
  if (s == null || s === "") return 0;
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export function parseBStockCsv(content: string): BStockRow[] {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  return records.map((row) => {
    const get = (keys: string[]) => {
      for (const k of keys) {
        if (row[k] != null && String(row[k]).length) return String(row[k]);
      }
      const lower = Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
      );
      for (const k of keys) {
        const lk = k.toLowerCase();
        if (lower[lk] != null && String(lower[lk]).length) return String(lower[lk]);
      }
      return "";
    };

    return {
      itemNumber: get(["Item #", "Item#"]),
      sellerCategory: get(["Seller Category"]),
      description: get(["Item Description", "Description"]),
      qty: num(get(["Qty", "Quantity"])),
      unitRetail: num(get(["Unit Retail"])),
      extRetail: num(get(["Ext. Retail", "Ext Retail"])),
      brand: get(["Brand"]),
      upc: get(["UPC"]),
      tcin: get(["TCIN"]),
      origin: get(["Origin"]),
      category: get(["Category"]),
      condition: get(["Condition"]),
      productClass: get(["Product Class"]),
      categoryCode: get(["Category Code"]),
      division: get(["Division"]),
      department: get(["Department"]),
      optoroCondition: get(["Optoro Condition"]),
      palletId: get(["Pallet ID"]),
      subcategory: get(["Subcategory"]),
      lotId: get(["Lot ID"]),
      raw: row,
    };
  });
}
