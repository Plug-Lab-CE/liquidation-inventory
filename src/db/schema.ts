import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  role: text("role").notNull().$type<"employee" | "administrator">(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const manifestUploads = pgTable("manifest_uploads", {
  id: uuid("id").defaultRandom().primaryKey(),
  uploadedById: uuid("uploaded_by_id").references(() => users.id),
  originalFilename: text("original_filename").notNull(),
  storagePath: text("storage_path").notNull(),
  status: text("status")
    .notNull()
    .$type<"processing" | "ready" | "failed">(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryItems = pgTable("inventory_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  manifestId: uuid("manifest_id")
    .references(() => manifestUploads.id, { onDelete: "cascade" })
    .notNull(),
  status: text("status")
    .notNull()
    .$type<"pending_review" | "awaiting_approval" | "published">(),

  title: text("title").notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull(),
  unitRetail: numeric("unit_retail", { precision: 14, scale: 2 }),
  extRetail: numeric("ext_retail", { precision: 14, scale: 2 }),
  brand: text("brand"),
  upc: text("upc"),
  category: text("category"),
  condition: text("condition"),
  palletIds: jsonb("pallet_ids").$type<string[]>().notNull().default([]),
  lotIds: jsonb("lot_ids").$type<string[]>().notNull().default([]),
  sourceRows: jsonb("source_rows").$type<Record<string, unknown>[]>().notNull().default([]),

  conditionNotes: text("condition_notes"),
  discountPercent: integer("discount_percent"),
  salePrice: numeric("sale_price", { precision: 14, scale: 2 }),
  accountedFor: boolean("accounted_for").notNull().default(false),
  candidateImageUrls: jsonb("candidate_image_urls").$type<string[]>().notNull().default([]),
  selectedImageUrls: jsonb("selected_image_urls").$type<string[]>().notNull().default([]),

  shopifyProductId: text("shopify_product_id"),
  shopifyVariantId: text("shopify_variant_id"),
  publishedAt: timestamp("published_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type ManifestUpload = typeof manifestUploads.$inferSelect;
export type InventoryItem = typeof inventoryItems.$inferSelect;
