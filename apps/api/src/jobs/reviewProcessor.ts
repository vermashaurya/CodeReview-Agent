import { Worker } from "bullmq";
import { Octokit } from "@octokit/rest";

import { redisConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import type { ReviewJobData } from "./queue";
import { fetchPullRequestFiles } from "../services/diff/fetcher";
import { chunkFileDiff } from "../services/diff/chunker";
import { parseGitHubFiles } from "../services/diff/parser";

async function processReviewJob(data: ReviewJobData): Promise<void> {
  const octokit = new Octokit();
  const rawFiles = await fetchPullRequestFiles({
    octokit,
    owner: data.owner,
    repo: data.repo,
    pullNumber: data.prNumber,
  });

  const parsedFiles = parseGitHubFiles(rawFiles);
  const chunks = parsedFiles.flatMap((fileDiff) => chunkFileDiff(fileDiff));

  logger.info(
    {
      owner: data.owner,
      repo: data.repo,
      prNumber: data.prNumber,
      headSha: data.headSha,
      files: parsedFiles.length,
      chunks: chunks.length,
      parsedFiles,
    },
    "Review job diff parsed",
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

