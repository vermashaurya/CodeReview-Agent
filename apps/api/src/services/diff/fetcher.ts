import { z } from "zod";
import type { Octokit } from "@octokit/rest";

import type { ParsedGitHubPullRequestFile } from "../../types/diff";

const githubPullRequestFileSchema = z.object({
  sha: z.string().min(1),
  filename: z.string().min(1),
  status: z.string().min(1),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changes: z.number().int().nonnegative(),
  patch: z.string().optional(),
  previous_filename: z.string().optional(),
});

const githubPullRequestFilesSchema = z.array(githubPullRequestFileSchema);

export interface FetchPullRequestFilesParams {
  octokit: Octokit;
  owner: string;
  repo: string;
  pullNumber: number;
}

export async function fetchPullRequestFiles(
  params: FetchPullRequestFilesParams,
): Promise<ParsedGitHubPullRequestFile[]> {
  const response = await params.octokit.paginate(
    params.octokit.rest.pulls.listFiles,
    {
      owner: params.owner,
      repo: params.repo,
      pull_number: params.pullNumber,
      per_page: 100,
    },
  );

  return githubPullRequestFilesSchema.parse(response);
}

