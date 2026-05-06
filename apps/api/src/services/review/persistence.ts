import { and, eq } from "drizzle-orm";
import type { ReviewOutput } from "@icra/shared/types";

import { db } from "../../db/client";
import { reviewComments, reviews } from "../../db/schema";

export interface StoredReviewComment {
  id: string;
  filePath: string;
  lineNumber: number;
  title: string;
}

export interface CreateReviewRecordParams {
  repositoryId: string | null;
  prNumber: number;
  prSha: string;
  modelUsed: string;
  durationMs: number;
  reviewOutput: ReviewOutput;
}

export interface CreateReviewRecordResult {
  reviewId: string;
  comments: StoredReviewComment[];
}

export async function findExistingReview(
  prNumber: number,
  prSha: string,
): Promise<{ id: string } | null> {
  const rows = await db
    .select({
      id: reviews.id,
    })
    .from(reviews)
    .where(and(eq(reviews.prNumber, prNumber), eq(reviews.prSha, prSha)))
    .limit(1);

  return rows[0] ?? null;
}

export async function createReviewRecord(
  params: CreateReviewRecordParams,
): Promise<CreateReviewRecordResult> {
  return db.transaction(async (tx) => {
    const insertedReviews = await tx
      .insert(reviews)
      .values({
        repositoryId: params.repositoryId,
        prNumber: params.prNumber,
        prSha: params.prSha,
        status: "processing",
        modelUsed: params.modelUsed,
        inputTokens: null,
        outputTokens: null,
        durationMs: params.durationMs,
        overallRisk: params.reviewOutput.overall_risk,
        summary: params.reviewOutput.summary,
      })
      .returning({
        id: reviews.id,
      });

    const review = insertedReviews[0];
    if (!review) {
      throw new Error("Failed to insert review");
    }

    const insertedComments =
      params.reviewOutput.comments.length > 0
        ? await tx
            .insert(reviewComments)
            .values(
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
            )
            .returning({
              id: reviewComments.id,
              filePath: reviewComments.filePath,
              lineNumber: reviewComments.lineNumber,
              title: reviewComments.title,
            })
        : [];

    return {
      reviewId: review.id,
      comments: insertedComments,
    };
  });
}

export async function finalizeReviewPosting(params: {
  reviewId: string;
  githubReviewId: string;
  commentIdsByStoredCommentId: Map<string, string>;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(reviews)
      .set({
        status: "completed",
        githubReviewId: params.githubReviewId,
        completedAt: new Date(),
      })
      .where(eq(reviews.id, params.reviewId));

    for (const [storedCommentId, githubCommentId] of params.commentIdsByStoredCommentId.entries()) {
      await tx
        .update(reviewComments)
        .set({
          githubCommentId,
        })
        .where(eq(reviewComments.id, storedCommentId));
    }
  });
}

export async function markReviewFailed(reviewId: string): Promise<void> {
  await db
    .update(reviews)
    .set({
      status: "failed",
      completedAt: new Date(),
    })
    .where(eq(reviews.id, reviewId));
}
