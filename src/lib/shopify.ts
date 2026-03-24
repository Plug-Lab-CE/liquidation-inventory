const SHOPIFY_API_VERSION = "2024-10";

function baseUrl() {
  const shop = process.env.SHOPIFY_STORE_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!shop) throw new Error("SHOPIFY_STORE_DOMAIN is not set");
  return `https://${shop}/admin/api/${SHOPIFY_API_VERSION}`;
}

function headers() {
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!token) throw new Error("SHOPIFY_ACCESS_TOKEN is not set");
  return {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": token,
  };
}

export type CreateProductInput = {
  title: string;
  bodyHtml: string;
  price: string;
  compareAtPrice: string | null;
  quantity: number;
  sku: string;
  imageUrls: string[];
};

export async function shopifyCreateProduct(input: CreateProductInput) {
  const url = `${baseUrl()}/products.json`;
  const product = {
    product: {
      title: input.title,
      body_html: input.bodyHtml,
      status: "active",
      variants: [
        {
          price: input.price,
          compare_at_price: input.compareAtPrice ?? undefined,
          sku: input.sku,
          inventory_management: "shopify",
          inventory_policy: "deny",
          requires_shipping: true,
        },
      ],
      images: input.imageUrls.map((src) => ({ src })),
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(product),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Shopify create product failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    product: {
      id: number;
      variants: { id: number; inventory_item_id?: number }[];
    };
  };

  const variantId = data.product.variants[0]?.id;
  const inventoryItemId = data.product.variants[0]?.inventory_item_id;

  if (variantId && inventoryItemId) {
    await setInventoryQuantity(inventoryItemId, input.quantity);
  }

  return {
    productId: String(data.product.id),
    variantId: variantId != null ? String(variantId) : null,
  };
}

async function setInventoryQuantity(inventoryItemId: number, quantity: number) {
  const locUrl = `${baseUrl()}/locations.json`;
  const locRes = await fetch(locUrl, { headers: headers() });
  if (!locRes.ok) return;
  const locData = (await locRes.json()) as { locations?: { id: number }[] };
  const locationId = locData.locations?.[0]?.id;
  if (!locationId) return;

  const adjUrl = `${baseUrl()}/inventory_levels/set.json`;
  await fetch(adjUrl, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      location_id: locationId,
      inventory_item_id: inventoryItemId,
      available: quantity,
    }),
  });
}
