import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import ignore from "ignore";
import simpleGit from "simple-git";
import { Worker } from "bullmq";

import { redisConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import type { IndexingJobData } from "./queue";
import { loadRepositoryConfigById } from "../services/review/repositoryConfig";
import { inferLanguageFromPath } from "../services/diff/language";
import { extractChunks } from "../services/indexer/parser";
import { embedChunks } from "../services/indexer/embedder";
import { writeChunks } from "../services/indexer/writer";
import type { CodeChunk } from "../types/rag";

const supportedSourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".java",
]);

async function walkSourceFiles(rootDir: string): Promise<string[]> {
  const gitignorePath = path.join(rootDir, ".gitignore");
  const gitignoreContents = await fs.readFile(gitignorePath, "utf8").catch(() => "");
  const matcher = ignore().add(gitignoreContents).add([".git", "node_modules", "dist", ".next"]);
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, absolutePath);

      if (matcher.ignores(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (!supportedSourceExtensions.has(path.extname(entry.name))) {
        continue;
      }

      files.push(absolutePath);
    }
  }

  await walk(rootDir);
  return files;
}

async function cloneRepository(owner: string, repo: string, githubToken: string): Promise<string> {
  const workDir = await fs.mkdtemp(path.join(tmpdir(), "icra-index-"));
  const cloneUrl = `https://x-access-token:${encodeURIComponent(githubToken)}@github.com/${owner}/${repo}.git`;
  const git = simpleGit();

  await git.clone(cloneUrl, workDir, ["--depth", "1"]);

  return workDir;
}

async function processIndexingJob(data: IndexingJobData): Promise<void> {
  const repository = await loadRepositoryConfigById(data.repositoryId);
  if (!repository) {
    throw new Error(`Repository configuration not found for id ${data.repositoryId}`);
  }

  const cloneDir = await cloneRepository(
    repository.githubOwner,
    repository.githubRepo,
    repository.githubToken,
  );

  try {
    const repositoryGit = simpleGit(cloneDir);
    const commitSha = (await repositoryGit.revparse(["HEAD"])).trim();
    const sourceFiles = await walkSourceFiles(cloneDir);
    const chunks: CodeChunk[] = [];

    for (const sourceFile of sourceFiles) {
      const relativePath = path.relative(cloneDir, sourceFile);
      const content = await fs.readFile(sourceFile, "utf8");
      const language = inferLanguageFromPath(relativePath);

      chunks.push(...extractChunks(relativePath, content, language));
    }

    const embeddedChunks = await embedChunks(chunks);
    await writeChunks(repository.id, embeddedChunks, commitSha);

    logger.info(
      {
        repositoryId: repository.id,
        owner: repository.githubOwner,
        repo: repository.githubRepo,
        files: sourceFiles.length,
        chunks: embeddedChunks.length,
        commitSha,
      },
      "Repository indexing completed",
    );
  } finally {
    await fs.rm(cloneDir, { recursive: true, force: true });
  }
}

export const indexingWorker = new Worker<IndexingJobData>(
  "indexing",
  async (job) => {
    await processIndexingJob(job.data);
  },
  {
    connection: redisConnection,
  },
);

indexingWorker.on("failed", (job, error) => {
  logger.error(
    {
      jobId: job?.id,
      err: error,
    },
    "Repository indexing job failed",
  );
});

indexingWorker.on("completed", (job) => {
  logger.info(
    {
      jobId: job.id,
    },
    "Repository indexing job completed",
  );
});
