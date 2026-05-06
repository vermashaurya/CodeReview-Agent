import type { FileDiff, ReviewOutput } from "@icra/shared/types";
import { z } from "zod";

import { withRetry, type RetryOptions } from "../../lib/retry";
import { buildFileReviewPrompt, reviewSystemPrompt } from "./prompts";
import type { StructuredOutputModel } from "./types";

const reviewCommentSchema = z.object({
  file_path: z.string(),
  line_number: z.number(),
  severity: z.enum(["critical", "warning", "suggestion"]),
  category: z.enum(["security", "correctness", "architecture", "performance", "style"]),
  title: z.string(),
  explanation: z.string(),
  suggested_fix: z.string().optional(),
  references_similar_pattern: z.string().optional(),
});

export const reviewOutputSchema = z.object({
  summary: z.string(),
  overall_risk: z.enum(["low", "medium", "high"]),
  comments: z.array(reviewCommentSchema),
});

type ReviewOutputShape = z.infer<typeof reviewOutputSchema>;

function collectAllowedLineNumbers(fileDiff: FileDiff): Set<number> {
  const allowed = new Set<number>();

  for (const hunk of fileDiff.hunks) {
    for (const line of hunk.lines) {
      if (typeof line.newLineNumber === "number") {
        allowed.add(line.newLineNumber);
      }
    }
  }

  return allowed;
}

function normalizeReviewOutput(fileDiff: FileDiff, reviewOutput: ReviewOutputShape): ReviewOutput {
  const allowedLineNumbers = collectAllowedLineNumbers(fileDiff);
  const comments = reviewOutput.comments
    .filter((comment) => allowedLineNumbers.has(comment.line_number))
    .map((comment) => ({
      ...comment,
      file_path: fileDiff.filename,
      confidence: 0.9,
    }));

  return {
    summary: reviewOutput.summary,
    overall_risk: reviewOutput.overall_risk,
    comments,
  };
}

export interface ReviewDiffChunkParams {
  model: StructuredOutputModel;
  fileDiff: FileDiff;
  context: string;
  reviewPolicy?: string | null;
  retryOptions?: RetryOptions;
}

export async function reviewDiffChunk(params: ReviewDiffChunkParams): Promise<ReviewOutput> {
  const runnable = params.model.withStructuredOutput(reviewOutputSchema, {
    name: "submit_review",
  });

  const prompt = [reviewSystemPrompt, "", buildFileReviewPrompt(params.fileDiff, params.context, params.reviewPolicy)].join(
    "\n",
  );

  const result = await withRetry(
    async () => runnable.invoke(prompt),
    params.retryOptions ?? {
      attempts: 3,
      baseDelayMs: 2000,
    },
  );

  return normalizeReviewOutput(params.fileDiff, result);
}
