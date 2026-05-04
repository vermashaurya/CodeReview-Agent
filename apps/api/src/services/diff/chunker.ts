import type { DiffHunk, DiffLine, FileDiff } from "@icra/shared/types";

import type { DiffChunk, HunkSliceResult } from "../../types/diff";

const MAX_CHANGED_LINES = 500;
const CHUNK_SIZE = 200;
const CHUNK_OVERLAP = 50;

function isChangedLine(line: DiffLine): boolean {
  return line.type === "added" || line.type === "removed";
}

function countChangedLines(fileDiff: FileDiff): number {
  return fileDiff.hunks.reduce((total, hunk) => {
    return total + hunk.lines.filter(isChangedLine).length;
  }, 0);
}

function buildChunkHunks(fileDiff: FileDiff, start: number, end: number): HunkSliceResult {
  let changedLineCursor = 0;
  const hunks: DiffHunk[] = [];

  for (const hunk of fileDiff.hunks) {
    const selectedLines: DiffLine[] = [];

    for (const line of hunk.lines) {
      const changed = isChangedLine(line);
      if (!changed) {
        if (selectedLines.length > 0) {
          selectedLines.push(line);
        }
        continue;
      }

      if (changedLineCursor >= start && changedLineCursor < end) {
        selectedLines.push(line);
      }

      changedLineCursor += 1;
    }

    if (selectedLines.length > 0) {
      hunks.push({
        header: hunk.header,
        oldStart: hunk.oldStart,
        newStart: hunk.newStart,
        lines: selectedLines,
      });
    }
  }

  return {
    hunks,
    changedLines: end - start,
  };
}

export function chunkFileDiff(fileDiff: FileDiff): DiffChunk[] {
  const changedLines = countChangedLines(fileDiff);
  if (changedLines <= MAX_CHANGED_LINES) {
    return [
      {
        chunkIndex: 0,
        totalChunks: 1,
        changedLines,
        file: fileDiff,
      },
    ];
  }

  const chunks: DiffChunk[] = [];
  let start = 0;

  while (start < changedLines) {
    const end = Math.min(start + CHUNK_SIZE, changedLines);
    const hunkSlice = buildChunkHunks(fileDiff, start, end);

    chunks.push({
      chunkIndex: chunks.length,
      totalChunks: 0,
      changedLines: hunkSlice.changedLines,
      file: {
        ...fileDiff,
        hunks: hunkSlice.hunks,
      },
    });

    if (end >= changedLines) {
      break;
    }

    start = end - CHUNK_OVERLAP;
  }

  return chunks.map((chunk) => ({
    ...chunk,
    totalChunks: chunks.length,
  }));
}
