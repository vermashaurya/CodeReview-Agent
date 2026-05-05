import type { DiffHunk, FileDiff } from "@icra/shared/types";

export interface ParsedGitHubPullRequestFile {
  sha: string;
  filename: string;
  status: "added" | "modified" | "removed" | "renamed" | "copied" | "changed" | string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
}

export interface DiffChunk {
  chunkIndex: number;
  totalChunks: number;
  changedLines: number;
  file: FileDiff;
}

export interface HunkSliceResult {
  hunks: DiffHunk[];
  changedLines: number;
}

