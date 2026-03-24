import { describe, expect, it } from "vitest";
import { MAX_CSV_BYTES, ITEMS_PAGE_SIZE } from "../limits";

describe("smoke", () => {
  it("exports sane defaults", () => {
    expect(MAX_CSV_BYTES).toBeGreaterThan(0);
    expect(ITEMS_PAGE_SIZE).toBeGreaterThan(0);
  });
});
