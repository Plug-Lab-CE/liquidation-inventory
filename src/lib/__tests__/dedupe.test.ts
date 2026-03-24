import { describe, expect, it } from "vitest";
import { dedupeKey, groupRows, mergeGroup } from "../dedupe";
import type { BStockRow } from "../csv/bstock";

function row(p: Partial<BStockRow> & Pick<BStockRow, "description">): BStockRow {
  return {
    itemNumber: "",
    sellerCategory: "",
    description: p.description,
    qty: p.qty ?? 1,
    unitRetail: p.unitRetail ?? 10,
    extRetail: p.extRetail ?? 10,
    brand: p.brand ?? "B",
    upc: p.upc ?? "",
    tcin: "",
    origin: "",
    category: "",
    condition: "USED_GOOD",
    productClass: "",
    categoryCode: "",
    division: "",
    department: "",
    optoroCondition: "",
    palletId: p.palletId ?? "",
    subcategory: "",
    lotId: p.lotId ?? "",
    raw: {},
  };
}

describe("dedupeKey", () => {
  it("groups by UPC when long enough", () => {
    expect(dedupeKey(row({ description: "A", upc: "196761620806" }))).toBe("upc:196761620806");
  });
});

describe("mergeGroup", () => {
  it("sums quantity and ext retail for same UPC group", () => {
    const g = groupRows([
      row({ description: "Canvas", upc: "196761620806", qty: 2, extRetail: 120, palletId: "P1" }),
      row({ description: "Canvas", upc: "196761620806", qty: 2, extRetail: 120, palletId: "P2" }),
    ]);
    expect(g).toHaveLength(1);
    const m = mergeGroup(g[0]!);
    expect(m.quantity).toBe(4);
    expect(m.extRetail).toBe(240);
    expect(m.palletIds.sort()).toEqual(["P1", "P2"].sort());
  });
});
