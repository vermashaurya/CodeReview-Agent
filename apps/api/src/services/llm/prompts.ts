import type { FileDiff, ReviewComment } from "@icra/shared/types";
import type { RetrievedChunk } from "../../types/rag";

function serializeDiff(fileDiff: FileDiff): string {
  const hunkText = fileDiff.hunks
    .map((hunk) => {
      const lines = hunk.lines
        .map((line) => {
          const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
          const oldNumber = line.oldLineNumber ?? "";
          const newNumber = line.newLineNumber ?? "";

          return `${prefix} [old:${oldNumber} new:${newNumber}] ${line.content}`;
        })
        .join("\n");

      return `${hunk.header}\n${lines}`;
    })
    .join("\n\n");

  return [
    `File: ${fileDiff.filename}`,
    `Language: ${fileDiff.language}`,
    `Status: ${fileDiff.status}`,
    `Additions: ${fileDiff.additions}`,
    `Deletions: ${fileDiff.deletions}`,
    "Unified diff:",
    hunkText,
  ].join("\n");
}

function serializeComments(comments: ReviewComment[]): string {
  if (comments.length === 0) {
    return "No file-level comments were generated.";
  }

  return comments
    .map((comment, index) => {
      return [
        `Comment ${index + 1}:`,
        `- file_path: ${comment.file_path}`,
        `- line_number: ${comment.line_number}`,
        `- severity: ${comment.severity}`,
        `- category: ${comment.category}`,
        `- title: ${comment.title}`,
        `- explanation: ${comment.explanation}`,
        `- confidence: ${comment.confidence}`,
      ].join("\n");
    })
    .join("\n\n");
}

export const reviewSystemPrompt = [
  "You are ICRA, a senior software engineer performing production-grade pull request reviews.",
  "Return structured output only through the provided schema.",
  "Do not hallucinate file paths or line numbers. Every line_number must exist in the provided diff chunk.",
  "Use confidence below 0.50 when a finding is tentative or based on incomplete context.",
  "Prefer high-signal findings covering correctness, security, architecture, performance, and style.",
  "If a finding is informed by an existing codebase pattern, set references_similar_pattern to the exact label in the form path:start-end.",
  "Do not repeat the diff verbatim. Explain the issue, the risk, and a concrete suggested fix when appropriate.",
  "If no actionable issues exist, return an empty comments array and a concise summary.",
].join("\n");

export function buildFileReviewPrompt(
  fileDiff: FileDiff,
  context: string,
  retrievedChunks: RetrievedChunk[],
  reviewPolicy?: string | null,
): string {
  const policyText = reviewPolicy ? reviewPolicy : "No repository-specific review policy provided.";
  const similarPatternsText =
    retrievedChunks.length > 0
      ? retrievedChunks
          .map((chunk, index) => {
            return [
              `Pattern ${index + 1}: ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}`,
              chunk.content,
            ].join("\n");
          })
          .join("\n\n")
      : "No similar codebase patterns were retrieved.";

  return [
    "Review this pull request diff chunk for a single file.",
    "Focus on actionable inline findings for this file only.",
    "",
    "Repository review policy:",
    policyText,
    "",
    "Additional context:",
    context,
    "",
    "Existing codebase patterns for reference:",
    similarPatternsText,
    "",
    "Diff chunk:",
    serializeDiff(fileDiff),
  ].join("\n");
}

export function buildSummaryPrompt(
  fileDiffs: FileDiff[],
  comments: ReviewComment[],
  reviewPolicy?: string | null,
): string {
  const policyText = reviewPolicy ? reviewPolicy : "No repository-specific review policy provided.";
  const diffText = fileDiffs.map((fileDiff) => serializeDiff(fileDiff)).join("\n\n---\n\n");

  return [
    "Synthesize a PR-level review summary across all changed files.",
    "Return a concise summary and overall risk only.",
    "Do not invent new inline comments in this synthesis pass.",
    "",
    "Repository review policy:",
    policyText,
    "",
    "Existing file-level findings:",
    serializeComments(comments),
    "",
    "Combined PR diff context:",
    diffText,
  ].join("\n");
}
