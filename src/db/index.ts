import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const g = globalThis as unknown as { __liq_pool?: pg.Pool };

function getPool(): pg.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!g.__liq_pool) {
    g.__liq_pool = new pg.Pool({ connectionString: url });
  }
  return g.__liq_pool;
}

export const db = drizzle(getPool(), { schema });
