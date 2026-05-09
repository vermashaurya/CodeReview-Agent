import { cohereDocumentEmbeddings, cohereQueryEmbeddings } from "../../lib/cohere";
import type { CodeChunk, CodeChunkWithEmbedding } from "../../types/rag";

const MAX_BATCH_SIZE = 100;
const MAX_CONCURRENCY = 3;

async function embedBatch(chunks: CodeChunk[]): Promise<CodeChunkWithEmbedding[]> {
  const embeddings = await cohereDocumentEmbeddings.embedDocuments(
    chunks.map((chunk) => chunk.content),
  );

  return chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index] ?? [],
  }));
}

export async function embedQueryText(queryText: string): Promise<number[]> {
  return cohereQueryEmbeddings.embedQuery(queryText);
}

export async function embedChunks(chunks: CodeChunk[]): Promise<CodeChunkWithEmbedding[]> {
  const batches: CodeChunk[][] = [];

  for (let index = 0; index < chunks.length; index += MAX_BATCH_SIZE) {
    batches.push(chunks.slice(index, index + MAX_BATCH_SIZE));
  }

  const results: CodeChunkWithEmbedding[] = [];
  let nextBatchIndex = 0;

  async function worker(): Promise<void> {
    while (nextBatchIndex < batches.length) {
      const currentIndex = nextBatchIndex;
      nextBatchIndex += 1;
      const batch = batches[currentIndex];

      if (!batch) {
        continue;
      }

      const embeddedBatch = await embedBatch(batch);
      results.push(...embeddedBatch);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, batches.length) }, async () => worker()),
  );

  return results;
}
