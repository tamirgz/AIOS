import { customType } from "drizzle-orm/pg-core";

/**
 * Dimension-less pgvector column. The embedding model is user-configurable
 * (Settings → embedding model) and models differ in output dimensions
 * (nomic-embed-text = 768, bge-m3 = 1024 …), so columns must not pin a size.
 * Consistency is guaranteed by wiping all embeddings when the model changes —
 * rows are only ever compared within one model's vector space.
 */
export const embeddingVector = customType<{ data: unknown }>({
  dataType() {
    return "vector";
  },
});
