import { customType } from "drizzle-orm/pg-core";

/**
 * Raw bytes column. postgres.js round-trips `bytea` as a Node `Buffer` in
 * both directions, so no custom (de)serialization is needed here.
 */
export const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});
