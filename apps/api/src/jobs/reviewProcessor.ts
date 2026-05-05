import { Worker } from "bullmq";
import { Octokit } from "@octokit/rest";

import { redisConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import type { ReviewJobData } from "./queue";
import { fetchPullRequestFiles } from "../services/diff/fetcher";
import { chunkFileDiff } from "../services/diff/chunker";
import { parseGitHubFiles } from "../services/diff/parser";
import { createGeminiClient, DEFAULT_GEMINI_MODEL } from "../services/llm/client";
import { orchestrateReview } from "../services/llm/orchestrator";
import { persistReviewResult } from "../services/review/persistence";
import { loadRepositoryConfig } from "../services/review/repositoryConfig";

async function processReviewJob(data: ReviewJobData): Promise<void> {
  const startedAt = Date.now();
  const octokit = new Octokit();
  const rawFiles = await fetchPullRequestFiles({
    octokit,
    owner: data.owner,
    repo: data.repo,
    pullNumber: data.prNumber,
  });

  const parsedFiles = parseGitHubFiles(rawFiles);
  const chunks = parsedFiles.flatMap((fileDiff) => chunkFileDiff(fileDiff));
  const repositoryConfig = await loadRepositoryConfig(data.owner, data.repo);
  const modelName = repositoryConfig?.model ?? DEFAULT_GEMINI_MODEL;
  const model = createGeminiClient(modelName);
  const reviewOutput = await orchestrateReview({
    model,
    fileDiffs: parsedFiles,
    diffChunks: chunks,
    reviewPolicy: repositoryConfig?.reviewPolicy ?? null,
  });
  const reviewId = await persistReviewResult({
    repositoryId: repositoryConfig?.id ?? null,
    prNumber: data.prNumber,
    prSha: data.headSha,
    modelUsed: modelName,
    durationMs: Date.now() - startedAt,
    reviewOutput,
  });

  logger.info(
    {
      owner: data.owner,
      repo: data.repo,
      prNumber: data.prNumber,
      headSha: data.headSha,
      files: parsedFiles.length,
      chunks: chunks.length,
      reviewId,
      reviewOutput,
    },
    "Review job completed and persisted",
  );
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
