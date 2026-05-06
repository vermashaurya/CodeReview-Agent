import { Worker } from "bullmq";
import { Octokit } from "@octokit/rest";

import { redisConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import type { ReviewJobData } from "./queue";
import { fetchPullRequestFiles } from "../services/diff/fetcher";
import { chunkFileDiff } from "../services/diff/chunker";
import { parseGitHubFiles } from "../services/diff/parser";
import { createGroqClient, DEFAULT_GROQ_MODEL } from "../services/llm/client";
import { orchestrateReview } from "../services/llm/orchestrator";
import { postReview } from "../services/github/reviewer";
import { loadRepositoryConfig } from "../services/review/repositoryConfig";
import {
  createReviewRecord,
  finalizeReviewPosting,
  findExistingReview,
  markReviewFailed,
} from "../services/review/persistence";

async function processReviewJob(data: ReviewJobData): Promise<void> {
  const startedAt = Date.now();
  const existingReview = await findExistingReview(data.prNumber, data.headSha);
  if (existingReview) {
    logger.info(
      {
        prNumber: data.prNumber,
        headSha: data.headSha,
        reviewId: existingReview.id,
      },
      "Skipping duplicate review job for existing PR SHA",
    );
    return;
  }

  const repositoryConfig = await loadRepositoryConfig(data.owner, data.repo);
  if (!repositoryConfig) {
    throw new Error(`Repository configuration not found for ${data.owner}/${data.repo}`);
  }

  const octokit = new Octokit({
    auth: repositoryConfig.githubToken,
  });
  const rawFiles = await fetchPullRequestFiles({
    octokit,
    owner: data.owner,
    repo: data.repo,
    pullNumber: data.prNumber,
  });

  const parsedFiles = parseGitHubFiles(rawFiles);
  const chunks = parsedFiles.flatMap((fileDiff) => chunkFileDiff(fileDiff));
  const modelName = repositoryConfig.model ?? DEFAULT_GROQ_MODEL;
  const model = createGroqClient(modelName);
  const reviewOutput = await orchestrateReview({
    model,
    fileDiffs: parsedFiles,
    diffChunks: chunks,
    reviewPolicy: repositoryConfig.reviewPolicy,
  });
  const storedReview = await createReviewRecord({
    repositoryId: repositoryConfig.id,
    prNumber: data.prNumber,
    prSha: data.headSha,
    modelUsed: modelName,
    durationMs: Date.now() - startedAt,
    reviewOutput,
  });
  try {
    const postedReview = await postReview({
      octokit,
      owner: data.owner,
      repo: data.repo,
      prNumber: data.prNumber,
      reviewOutput,
      fileDiffs: parsedFiles,
      storedComments: storedReview.comments,
    });

    await finalizeReviewPosting({
      reviewId: storedReview.reviewId,
      githubReviewId: postedReview.githubReviewId,
      commentIdsByStoredCommentId: postedReview.githubCommentIdsByStoredCommentId,
    });

    logger.info(
      {
        owner: data.owner,
        repo: data.repo,
        prNumber: data.prNumber,
        headSha: data.headSha,
        files: parsedFiles.length,
        chunks: chunks.length,
        reviewId: storedReview.reviewId,
        githubReviewId: postedReview.githubReviewId,
        reviewOutput,
      },
      "Review job completed, posted to GitHub, and persisted",
    );
  } catch (error: unknown) {
    await markReviewFailed(storedReview.reviewId);
    throw error;
  }
}

export const reviewWorker = new Worker<ReviewJobData>(
  "review",
  async (job) => {
    await processReviewJob(job.data);
  },
  {
    connection: redisConnection,
  },
);

reviewWorker.on("failed", (job, error) => {
  logger.error(
    {
      jobId: job?.id,
      err: error,
    },
    "Review job failed",
  );
});

reviewWorker.on("completed", (job) => {
  logger.info(
    {
      jobId: job.id,
    },
    "Review job completed",
  );
});
