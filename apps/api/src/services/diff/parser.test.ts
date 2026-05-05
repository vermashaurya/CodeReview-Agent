import { describe, expect, test } from "bun:test";

import { parseGitHubFiles } from "./parser";

describe("parseGitHubFiles", () => {
  test("parses a multi-hunk GitHub patch into structured FileDiff objects", async () => {
    const patch = await Bun.file(
      new URL("./__fixtures__/multi-hunk.patch", import.meta.url),
    ).text();

    const files = parseGitHubFiles([
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

    expect(files).toHaveLength(1);
    expect(files[0]?.filename).toBe("src/load-user.ts");
    expect(files[0]?.language).toBe("typescript");
    expect(files[0]?.hunks).toHaveLength(2);

    const firstHunk = files[0]?.hunks[0];
    expect(firstHunk?.oldStart).toBe(1);
    expect(firstHunk?.newStart).toBe(1);
    expect(firstHunk?.lines[1]).toEqual({
      type: "removed",
      content: 'import { logger } from "./logger";',
      oldLineNumber: 2,
    });
    expect(firstHunk?.lines[2]).toEqual({
      type: "added",
      content: 'import { logger } from "./logger";',
      newLineNumber: 2,
    });
    expect(firstHunk?.lines[3]).toEqual({
      type: "added",
      content: 'import { metrics } from "./metrics";',
      newLineNumber: 3,
    });

    const secondHunk = files[0]?.hunks[1];
    expect(secondHunk?.lines.at(-1)).toEqual({
      type: "context",
      content: "}",
      oldLineNumber: 18,
      newLineNumber: 22,
    });
  });

  test("skips binary files that do not have a patch payload", () => {
    const files = parseGitHubFiles([
      {
        sha: "def456",
        filename: "assets/logo.png",
        status: "modified",
        additions: 0,
        deletions: 0,
        changes: 0,
      },
    ]);

    expect(files).toHaveLength(0);
  });
});

