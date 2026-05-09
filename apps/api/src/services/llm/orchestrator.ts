import type { FileDiff, ReviewComment, ReviewOutput } from "@icra/shared/types";
import { z } from "zod";

import type { DiffChunk } from "../../types/diff";
import { withRetry, type RetryOptions } from "../../lib/retry";
import { buildSummaryPrompt, reviewSystemPrompt } from "./prompts";
import { reviewDiffChunk } from "./reviewer";
import type { StructuredOutputModel } from "./types";
import type { RetrievedChunk } from "../../types/rag";

const reviewSummarySchema = z.object({
  summary: z.string(),
  overall_risk: z.enum(["low", "medium", "high"]),
});

function deduplicateComments(comments: ReviewComment[]): ReviewComment[] {
  const seen = new Set<string>();

  return comments.filter((comment) => {
    const key = `${comment.file_path}:${comment.line_number}:${comment.title}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function truncateForSummaryPrompt(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) {
    return text;
  }

  return `${text.slice(0, maxCharacters)}\n\n[truncated]`;
}

async function summarizeReview(params: {
  model: StructuredOutputModel;
  fileDiffs: FileDiff[];
  comments: ReviewComment[];
  reviewPolicy?: string | null;
  retryOptions?: RetryOptions;
}): Promise<{ summary: string; overall_risk: "low" | "medium" | "high" }> {
  const runnable = params.model.withStructuredOutput(reviewSummarySchema, {
    name: "submit_summary",
  });

  const summaryPrompt = buildSummaryPrompt(params.fileDiffs, params.comments, params.reviewPolicy);
  const prompt = [reviewSystemPrompt, "", truncateForSummaryPrompt(summaryPrompt, 32000)].join("\n");

  return withRetry(
    async () => runnable.invoke(prompt),
    params.retryOptions ?? {
      attempts: 3,
      baseDelayMs: 2000,
    },
  );
}

export interface OrchestrateReviewParams {
  model: StructuredOutputModel;
  repositoryId: string;
  fileDiffs: FileDiff[];
  diffChunks: DiffChunk[];
  reviewPolicy?: string | null;
  retryOptions?: RetryOptions;
  retrieveSimilarChunksFn?: (
    repositoryId: string,
    queryText: string,
    topK?: number,
  ) => Promise<RetrievedChunk[]>;
}

export async function orchestrateReview(params: OrchestrateReviewParams): Promise<ReviewOutput> {
  const collectedComments: ReviewComment[] = [];

  for (const diffChunk of params.diffChunks) {
    const context =
      diffChunk.totalChunks > 1
        ? `This file was split into ${diffChunk.totalChunks} review chunks. You are reviewing chunk ${diffChunk.chunkIndex + 1} containing ${diffChunk.changedLines} changed lines.`
        : "Review the full file diff. No chunking was needed.";

    const fileReview = await reviewDiffChunk({
      model: params.model,
      repositoryId: params.repositoryId,
      fileDiff: diffChunk.file,
      context,
      reviewPolicy: params.reviewPolicy,
      retryOptions: params.retryOptions,
      retrieveSimilarChunksFn: params.retrieveSimilarChunksFn,
    });

    collectedComments.push(...fileReview.comments);
  }

  const comments = deduplicateComments(collectedComments);
  const summaryResult = await summarizeReview({
    model: params.model,
    fileDiffs: params.fileDiffs,
    comments,
    reviewPolicy: params.reviewPolicy,
    retryOptions: params.retryOptions,
  });

  return {
    summary: summaryResult.summary,
    overall_risk: summaryResult.overall_risk,
    comments,
  };
}
