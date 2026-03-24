import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __liq_pool?: pg.Pool; __liq_db?: Db };

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDb() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!g.__liq_db) {
    g.__liq_pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    g.__liq_db = drizzle(g.__liq_pool, { schema });
  }
  return g.__liq_db;
}
