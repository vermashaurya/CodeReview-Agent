import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";

import { fetchPullRequestFiles } from "./fetcher";

describe("fetchPullRequestFiles", () => {
  test("returns validated GitHub PR file payloads from Octokit pagination", async () => {
    const octokit = {
      rest: {
        pulls: {
          listFiles: Symbol("listFiles"),
        },
      },
      paginate: async () => [
        {
          sha: "abc123",
          filename: "src/index.ts",
          status: "modified",
          additions: 2,
          deletions: 1,
          changes: 3,
          patch: "@@ -1,1 +1,2 @@\n-console.log('a');\n+console.log('b');\n+console.log('c');",
        },
      ],
    };

    const files = await fetchPullRequestFiles({
      octokit: octokit as never,
      owner: "acme",
      repo: "icra",
      pullNumber: 12,
    });

    expect(files).toHaveLength(1);
    expect(files[0]?.filename).toBe("src/index.ts");
  });

  test("throws when GitHub returns an unexpected payload shape", async () => {
    const octokit = {
      rest: {
        pulls: {
          listFiles: Symbol("listFiles"),
        },
      },
      paginate: async () => [
        {
          filename: "src/index.ts",
          status: "modified",
        },
      ],
    };

    await expect(
      fetchPullRequestFiles({
        octokit: octokit as never,
        owner: "acme",
        repo: "icra",
        pullNumber: 12,
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});
