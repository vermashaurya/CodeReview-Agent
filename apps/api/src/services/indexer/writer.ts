import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "../../db/client";
import { codebaseChunks } from "../../db/schema";
import type { CodeChunkWithEmbedding } from "../../types/rag";

export async function writeChunks(
  repositoryId: string,
  chunks: CodeChunkWithEmbedding[],
  commitSha: string,
): Promise<void> {
  const filePaths = Array.from(new Set(chunks.map((chunk) => chunk.filePath)));

  await db.transaction(async (tx) => {
    if (filePaths.length > 0) {
      await tx
        .delete(codebaseChunks)
        .where(
          and(
            eq(codebaseChunks.repositoryId, repositoryId),
            inArray(codebaseChunks.filePath, filePaths),
            ne(codebaseChunks.commitSha, commitSha),
          ),
        );
    }

    for (const chunk of chunks) {
      await tx
        .insert(codebaseChunks)
        .values({
          repositoryId,
          filePath: chunk.filePath,
          language: chunk.language,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          content: chunk.content,
          embedding: chunk.embedding,
          commitSha,
        })
        .onConflictDoUpdate({
          target: [
            codebaseChunks.repositoryId,
            codebaseChunks.filePath,
            codebaseChunks.startLine,
          ],
          set: {
            endLine: chunk.endLine,
            language: chunk.language,
            content: chunk.content,
            embedding: chunk.embedding,
            commitSha,
            indexedAt: new Date(),
          },
        });
    }
  });
}
