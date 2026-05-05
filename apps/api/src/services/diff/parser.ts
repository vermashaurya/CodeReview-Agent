import type { DiffHunk, DiffLine, FileDiff } from "@icra/shared/types";

import { inferLanguageFromPath } from "./language";
import type { ParsedGitHubPullRequestFile } from "../../types/diff";

const hunkHeaderPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function parseHunkHeader(header: string): { oldStart: number; newStart: number } {
  const match = header.match(hunkHeaderPattern);
  if (!match) {
    throw new Error(`Invalid diff hunk header: ${header}`);
  }

  return {
    oldStart: Number.parseInt(match[1], 10),
    newStart: Number.parseInt(match[3], 10),
  };
}

function parsePatch(patch: string): DiffHunk[] {
  const lines = patch.split("\n");
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLineNumber = 0;
  let newLineNumber = 0;

  for (const rawLine of lines) {
    if (rawLine.startsWith("@@")) {
      const { oldStart, newStart } = parseHunkHeader(rawLine);
      currentHunk = {
        header: rawLine,
        oldStart,
        newStart,
        lines: [],
      };
      oldLineNumber = oldStart;
      newLineNumber = newStart;
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (rawLine.startsWith("\\ No newline at end of file")) {
      continue;
    }

    const prefix = rawLine[0];
    const content = rawLine.slice(1);
    let line: DiffLine | null = null;

    if (prefix === "+") {
      line = {
        type: "added",
        content,
        newLineNumber,
      };
      newLineNumber += 1;
    } else if (prefix === "-") {
      line = {
        type: "removed",
        content,
        oldLineNumber,
      };
      oldLineNumber += 1;
    } else if (prefix === " ") {
      line = {
        type: "context",
        content,
        oldLineNumber,
        newLineNumber,
      };
      oldLineNumber += 1;
      newLineNumber += 1;
    }

    if (line) {
      currentHunk.lines.push(line);
    }
  }

  return hunks;
}

function mapStatus(status: ParsedGitHubPullRequestFile["status"]): FileDiff["status"] | null {
  if (status === "removed") {
    return "deleted";
  }

  if (status === "renamed") {
    return "renamed";
  }

  if (status === "added") {
    return "added";
  }

  if (status === "modified" || status === "changed" || status === "copied") {
    return "modified";
  }

  return null;
}

export function parseGitHubFiles(rawFiles: ParsedGitHubPullRequestFile[]): FileDiff[] {
  const parsedFiles: FileDiff[] = [];

  for (const rawFile of rawFiles) {
    if (!rawFile.patch) {
      continue;
    }

    const status = mapStatus(rawFile.status);
    if (!status) {
      continue;
    }

    parsedFiles.push({
      filename: rawFile.filename,
      language: inferLanguageFromPath(rawFile.filename),
      status,
      additions: rawFile.additions,
      deletions: rawFile.deletions,
      hunks: parsePatch(rawFile.patch),
    });
  }

  return parsedFiles;
}

