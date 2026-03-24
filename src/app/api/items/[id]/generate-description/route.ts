import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, isDatabaseConfigured } from "@/db";
import { inventoryItems } from "@/db/schema";
import { requireAdmin } from "@/lib/api-auth";
import type { ProductDescriptionInput } from "@/lib/openai/generate-product-description";
import { generateProductDescription } from "@/lib/openai/generate-product-description";
import { memoryGetItem } from "@/lib/memory-store";

type Params = { params: Promise<{ id: string }> };

const clientContextSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    brand: z.string().max(200).nullable().optional(),
    upc: z.string().max(64).nullable().optional(),
    category: z.string().max(200).nullable().optional(),
    condition: z.string().max(200).nullable().optional(),
    conditionNotes: z.string().max(8000).nullable().optional(),
    quantity: z.number().int().min(1).max(999_999).optional(),
    unitRetail: z.string().max(32).nullable().optional(),
    existingDescription: z.string().max(20000).nullable().optional(),
  })
  .strict();

type RowLike = {
  title: string;
  brand: string | null;
  upc: string | null;
  category: string | null;
  condition: string | null;
  conditionNotes: string | null;
  quantity: number;
  unitRetail: string | null;
  description: string | null;
};

function mergeDescriptionInput(
  row: RowLike,
  ctx: z.infer<typeof clientContextSchema>,
): ProductDescriptionInput {
  return {
    title: ctx.title ?? row.title,
    brand: ctx.brand !== undefined ? ctx.brand : row.brand,
    upc: ctx.upc !== undefined ? ctx.upc : row.upc,
    category: ctx.category !== undefined ? ctx.category : row.category,
    condition: ctx.condition !== undefined ? ctx.condition : row.condition,
    conditionNotes: ctx.conditionNotes !== undefined ? ctx.conditionNotes : row.conditionNotes,
    quantity: ctx.quantity ?? row.quantity,
    unitRetail: ctx.unitRetail !== undefined ? ctx.unitRetail : row.unitRetail,
    existingDescription:
      ctx.existingDescription !== undefined ? ctx.existingDescription : row.description,
  };
}

export async function POST(req: Request, { params }: Params) {
  const authResult = await requireAdmin();
  if ("response" in authResult) return authResult.response;

  const { id } = await params;

  const raw = await req.json().catch(() => ({}));
  const parsedCtx = clientContextSchema.safeParse(raw);
  const ctx = parsedCtx.success ? parsedCtx.data : {};

  if (!isDatabaseConfigured()) {
    const row = memoryGetItem(id);
    if (!row) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (row.status !== "awaiting_approval") {
      return Response.json(
        { error: "AI descriptions are only available for items awaiting approval" },
        { status: 400 },
      );
    }

    try {
      const description = await generateProductDescription(
        mergeDescriptionInput(
          {
            title: row.title,
            brand: row.brand,
            upc: row.upc,
            category: row.category,
            condition: row.condition,
            conditionNotes: row.conditionNotes,
            quantity: row.quantity,
            unitRetail: row.unitRetail,
            description: row.description,
          },
          ctx,
        ),
      );
      return Response.json({ description });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      return Response.json({ error: message }, { status: 502 });
    }
  }

  const db = getDb();
  const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);

  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (row.status !== "awaiting_approval") {
    return Response.json(
      { error: "AI descriptions are only available for items awaiting approval" },
      { status: 400 },
    );
  }

  try {
    const description = await generateProductDescription(
      mergeDescriptionInput(
        {
          title: row.title,
          brand: row.brand,
          upc: row.upc,
          category: row.category,
          condition: row.condition,
          conditionNotes: row.conditionNotes,
          quantity: row.quantity,
          unitRetail: row.unitRetail != null ? String(row.unitRetail) : null,
          description: row.description,
        },
        ctx,
      ),
    );
    return Response.json({ description });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
