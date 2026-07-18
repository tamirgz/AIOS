import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  // Core schema + every module's schema fragment compose into one migration stream.
  schema: ["./src/core/db/schema/*.ts", "./src/modules/*/schema.ts"],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://aios:aios@localhost:5544/aios",
  },
});
