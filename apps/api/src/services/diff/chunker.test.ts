import { describe, expect, test } from "bun:test";

import { chunkFileDiff } from "./chunker";
import { parseGitHubFiles } from "./parser";

describe("chunkFileDiff", () => {
  test("returns a single chunk for small diffs", async () => {
    const patch = await Bun.file(
      new URL("./__fixtures__/multi-hunk.patch", import.meta.url),
    ).text();

    const [fileDiff] = parseGitHubFiles([
      {
        sha: "abc123",
        filename: "src/load-user.ts",
        status: "modified",
        additions: 5,
        deletions: 1,
        changes: 6,
        patch,
      },
    ]);

    const chunks = chunkFileDiff(fileDiff!);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.changedLines).toBe(6);
  });

  test("splits very large diffs into overlapping 200-line chunks", async () => {
    const patch = await Bun.file(
      new URL("./__fixtures__/large.patch", import.meta.url),
    ).text();

    const [fileDiff] = parseGitHubFiles([
      {
        sha: "ghi789",
        filename: "src/generated.ts",
        status: "modified",
        additions: 520,
        deletions: 0,
        changes: 520,
        patch,
      },
    ]);

    const chunks = chunkFileDiff(fileDiff!);

    expect(chunks).toHaveLength(4);
    expect(chunks[0]?.changedLines).toBe(200);
    expect(chunks[1]?.changedLines).toBe(200);
    expect(chunks[2]?.changedLines).toBe(200);
    expect(chunks[3]?.changedLines).toBe(70);
    expect(chunks.every((chunk) => chunk.totalChunks === 4)).toBe(true);
  });
});
