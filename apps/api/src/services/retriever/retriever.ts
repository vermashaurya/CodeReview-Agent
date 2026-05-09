import { and, eq, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { codebaseChunks } from "../../db/schema";
import { embedQueryText } from "../indexer/embedder";
import type { RetrievedChunk } from "../../types/rag";

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export async function retrieveSimilarChunks(
  repositoryId: string,
  queryText: string,
  topK: number = 8,
): Promise<RetrievedChunk[]> {
  const embedding = await embedQueryText(queryText);
  if (embedding.length === 0) {
    return [];
  }

  const vectorLiteral = toVectorLiteral(embedding);
  const distance = sql<number>`${codebaseChunks.embedding} <=> ${vectorLiteral}::vector`;

  const rows = await db
    .select({
      filePath: codebaseChunks.filePath,
      language: codebaseChunks.language,
      startLine: codebaseChunks.startLine,
      endLine: codebaseChunks.endLine,
      content: codebaseChunks.content,
      commitSha: codebaseChunks.commitSha,
      distance,
    })
    .from(codebaseChunks)
    .where(and(eq(codebaseChunks.repositoryId, repositoryId)))
    .orderBy(distance)
    .limit(topK);

  return rows.map((row) => ({
    filePath: row.filePath,
    language: row.language,
    startLine: row.startLine,
    endLine: row.endLine,
    content: row.content,
    commitSha: row.commitSha,
    distance: Number(row.distance),
  }));
}
