import { getOpenAI, openaiModel } from "@/lib/openai/client";

export type ProductDescriptionInput = {
  title: string;
  brand: string | null;
  upc: string | null;
  category: string | null;
  condition: string | null;
  conditionNotes: string | null;
  quantity: number;
  unitRetail: string | null;
  existingDescription: string | null;
};

/**
 * Plain-text listing body for Shopify (wrapped in <p> at publish time).
 */
export async function generateProductDescription(
  input: ProductDescriptionInput,
): Promise<string> {
  const openai = getOpenAI();
  const model = openaiModel();

  const facts = [
    `Title: ${input.title}`,
    `Brand: ${input.brand ?? "unknown"}`,
    `UPC: ${input.upc ?? "none"}`,
    `Category: ${input.category ?? "unknown"}`,
    `Manifest condition: ${input.condition ?? "unknown"}`,
    input.conditionNotes
      ? `Condition notes: ${input.conditionNotes}`
      : "Condition notes: (none)",
    `Quantity: ${input.quantity}`,
    `Unit retail (compare-at): ${input.unitRetail ?? "unknown"}`,
    input.existingDescription?.trim()
      ? `Current draft description (rewrite or improve into a single cohesive listing):\n${input.existingDescription.trim()}`
      : "Current draft: (empty — write from scratch)",
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.6,
    max_tokens: 600,
    messages: [
      {
        role: "system",
        content:
          "You write concise ecommerce product descriptions for a liquidation/resale marketplace. " +
          "Output plain text only: no HTML, no markdown, no bullet characters, no title line. " +
          "Use 2–4 short paragraphs. Professional, helpful tone. Do not invent warranties, model numbers, or specs not implied by the facts. " +
          "Do not repeat the UPC as the only detail; weave facts naturally.",
      },
      {
        role: "user",
        content: `Write a customer-facing product description from these facts:\n\n${facts}`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new Error("Empty description from model");
  }
  return text.replace(/\r\n/g, "\n").trim();
}
