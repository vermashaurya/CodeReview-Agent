import type { ReviewOutput } from "@icra/shared/types";

import { db } from "../../db/client";
import { reviewComments, reviews } from "../../db/schema";

export interface PersistReviewResultParams {
  repositoryId: string | null;
  prNumber: number;
  prSha: string;
  modelUsed: string;
  durationMs: number;
  reviewOutput: ReviewOutput;
}

export async function persistReviewResult(params: PersistReviewResultParams): Promise<string> {
  return db.transaction(async (tx) => {
    const insertedReviews = await tx
      .insert(reviews)
      .values({
        repositoryId: params.repositoryId,
        prNumber: params.prNumber,
        prSha: params.prSha,
        status: "completed",
        modelUsed: params.modelUsed,
        inputTokens: null,
        outputTokens: null,
        durationMs: params.durationMs,
        overallRisk: params.reviewOutput.overall_risk,
        summary: params.reviewOutput.summary,
        completedAt: new Date(),
      })
      .returning({
        id: reviews.id,
      });

    const review = insertedReviews[0];
    if (!review) {
      throw new Error("Failed to insert review");
    }

    if (params.reviewOutput.comments.length > 0) {
      await tx.insert(reviewComments).values(
        params.reviewOutput.comments.map((comment) => ({
          reviewId: review.id,
          filePath: comment.file_path,
          lineNumber: comment.line_number,
          severity: comment.severity,
          category: comment.category,
          title: comment.title,
          explanation: comment.explanation,
          suggestedFix: comment.suggested_fix ?? null,
          confidence: comment.confidence.toFixed(2),
        })),
      );
    }

    return review.id;
  });
}
