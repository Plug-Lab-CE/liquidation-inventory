import { z } from "zod";
import { getOpenAI, openaiModel } from "@/lib/openai/client";

const urlsSchema = z.object({
  imageUrls: z.array(z.string().url()).min(1).max(8),
});

function extractUrlsFromText(text: string): string[] {
  const re = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?/gi;
  return [...new Set(text.match(re) ?? [])].slice(0, 8);
}

/**
 * Uses OpenAI Responses API web search when available; falls back to chat + URL extraction.
 */
export async function lookupProductImageUrls(input: {
  title: string;
  brand: string | null;
  upc: string | null;
}): Promise<{ urls: string[]; source: "responses_web" | "chat_fallback" }> {
  const prompt = `Find 3 to 5 publicly accessible direct image URLs (jpg/png/webp) for this product for an inventory listing. Prefer retailer or manufacturer images. Product: brand=${input.brand ?? "unknown"}, UPC=${input.upc ?? "unknown"}, title=${input.title}`;

  const openai = getOpenAI();
  const model = openaiModel();

  try {
    const anyClient = openai as unknown as {
      responses?: {
        create: (args: Record<string, unknown>) => Promise<{ output_text?: string }>;
      };
    };
    if (typeof anyClient.responses?.create === "function") {
      const res = await anyClient.responses.create({
        model,
        tools: [{ type: "web_search_preview" }],
        input: prompt,
      });
      const text = res.output_text ?? "";
      const urls = extractUrlsFromText(text);
      if (urls.length >= 1) {
        return { urls: urls.slice(0, 5), source: "responses_web" };
      }
    }
  } catch {
    // fall through
  }

  const completion = await openai.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Return JSON {\"imageUrls\":[\"https://...\"]} with 3-5 likely product image URLs. Use real CDN/store URLs you know for this product type; if uncertain use empty array.",
      },
      { role: "user", content: prompt },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "{}";
  let urls: string[] = [];
  try {
    const parsed = urlsSchema.safeParse(JSON.parse(text));
    if (parsed.success) urls = parsed.data.imageUrls;
  } catch {
    urls = extractUrlsFromText(text);
  }

  return { urls: urls.slice(0, 5), source: "chat_fallback" };
}
