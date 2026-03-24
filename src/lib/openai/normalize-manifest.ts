import { z } from "zod";
import { getOpenAI, openaiModel } from "@/lib/openai/client";
import type { MergedLine } from "@/lib/dedupe";

const normalizedItemSchema = z.object({
  title: z.string(),
  description: z.string(),
  displayCategory: z.string(),
  conditionLabel: z.string(),
});

export type NormalizedItem = z.infer<typeof normalizedItemSchema>;

export async function normalizeMergedItems(items: MergedLine[]): Promise<NormalizedItem[]> {
  if (!process.env.OPENAI_API_KEY) {
    return items.map((m) => ({
      title: m.titleSeed.slice(0, 200),
      description: m.descriptionSeed,
      displayCategory: m.category || "General",
      conditionLabel: m.condition || "Unknown",
    }));
  }

  const openai = getOpenAI();
  const model = openaiModel();

  const payload = items.map((m, i) => ({
    index: i,
    brand: m.brand,
    upc: m.upc,
    quantity: m.quantity,
    unitRetail: m.unitRetail,
    manifestCategory: m.category,
    condition: m.condition,
    description: m.descriptionSeed,
  }));

  const completion = await openai.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You normalize liquidation inventory for an e-commerce listing. Given structured rows from a B-Stock style manifest, return JSON with shape:
{"items":[{"title":"...","description":"...","displayCategory":"...","conditionLabel":"..."}]}
Rules:
- title: concise customer-facing product title (include brand when helpful)
- description: 1-3 sentences, mention quantity if >1, preserve important caveats from source (e.g. incomplete sets)
- displayCategory: single high-level category
- conditionLabel: short human-readable condition
- Array length must equal input item count; order matches "index" order.`,
      },
      {
        role: "user",
        content: JSON.stringify(payload),
      },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI returned empty normalization");
  }

  const parsed = JSON.parse(text) as { items: unknown };
  const arr = z.array(normalizedItemSchema).parse(parsed.items);
  if (arr.length !== items.length) {
    throw new Error("OpenAI normalization length mismatch");
  }
  return arr;
}
