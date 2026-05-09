import type { CodeChunk } from "../../types/rag";

export function extractChunks(filePath: string, content: string, language: string): CodeChunk[] {
  const lines = content.split("\n");
  const chunks: CodeChunk[] = [];
  const windowSize = 400;
  const overlap = 80;

  let startLine = 1;
  while (startLine <= lines.length) {
    const endLine = Math.min(startLine + windowSize - 1, lines.length);
    const chunkLines = lines.slice(startLine - 1, endLine).join("\n").trim();

    if (chunkLines.length > 0) {
      chunks.push({
        filePath,
        language,
        startLine,
        endLine,
        content: chunkLines,
      });
    }

    if (endLine === lines.length) {
      break;
    }

    startLine = endLine - overlap + 1;
  }

  return chunks;
}
