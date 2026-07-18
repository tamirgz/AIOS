// Shared by the Next.js server AND the agent worker — do not import the
// `server-only` package here (it throws under plain Node/tsx).
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url =
  process.env.DATABASE_URL ?? "postgres://aios:aios@localhost:5544/aios";

// Cache the connection across Next.js HMR reloads.
const g = globalThis as unknown as { __aiosSql?: ReturnType<typeof postgres> };

export const sql = g.__aiosSql ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") g.__aiosSql = sql;

export const db = drizzle(sql);
export type Db = typeof db;
