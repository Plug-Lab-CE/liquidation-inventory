import { and, eq, sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db";
import { inventoryItems } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { MIN_BARCODE_DIGITS, normalizeBarcodeDigits } from "@/lib/barcode-normalize";
import { memoryListPendingByUpcDigits } from "@/lib/memory-store";
import { itemRowToDto } from "@/lib/serialize-item";

export async function GET(req: Request) {
  const authResult = await requireSession();
  if ("response" in authResult) return authResult.response;

  const code = new URL(req.url).searchParams.get("code")?.trim() ?? "";
  const normalized = normalizeBarcodeDigits(code);

  if (normalized.length < MIN_BARCODE_DIGITS) {
    return Response.json(
      { error: "Enter at least 8 digits (full UPC/EAN)." },
      { status: 400 },
    );
  }

  if (!isDatabaseConfigured()) {
    const matches = memoryListPendingByUpcDigits(normalized);
    if (matches.length > 1) {
      return Response.json(
        { error: "Multiple pending items match this barcode. Open the list and pick one." },
        { status: 409 },
      );
    }
    const item = matches[0];
    if (!item) {
      return Response.json(
        { error: "No pending item with this UPC. Items without a UPC on the manifest cannot be found by scan." },
        { status: 404 },
      );
    }
    return Response.json({ item: itemRowToDto(item) });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.status, "pending_review"),
        sql`regexp_replace(coalesce(${inventoryItems.upc}, ''), '[^0-9]', '', 'g') = ${normalized}`,
      ),
    )
    .limit(2);

  if (rows.length > 1) {
    return Response.json(
      { error: "Multiple pending items match this barcode. Open the list and pick one." },
      { status: 409 },
    );
  }

  const [row] = rows;
  if (!row) {
    return Response.json(
      {
        error:
          "No pending item with this UPC. Items without a UPC on the manifest cannot be found by scan.",
      },
      { status: 404 },
    );
  }

  return Response.json({ item: itemRowToDto(row) });
}
