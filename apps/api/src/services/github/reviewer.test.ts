import { describe, expect, test } from "bun:test";
import type { FileDiff, ReviewOutput } from "@icra/shared/types";

import { lineToPosition, postReview } from "./reviewer";
import type { StoredReviewComment } from "../review/persistence";

const fileDiff: FileDiff = {
  filename: "src/example.ts",
  language: "typescript",
  status: "modified",
  additions: 3,
  deletions: 1,
  hunks: [
    {
      header: "@@ -10,3 +10,4 @@",
      oldStart: 10,
      newStart: 10,
      lines: [
        {
          type: "context",
          content: "const a = 1;",
          oldLineNumber: 10,
          newLineNumber: 10,
        },
        {
          type: "removed",
          content: "return oldValue;",
          oldLineNumber: 11,
        },
        {
          type: "added",
          content: "return newValue;",
          newLineNumber: 11,
        },
        {
          type: "context",
          content: "console.log('done');",
          oldLineNumber: 12,
          newLineNumber: 12,
        },
      ],
    },
    {
      header: "@@ -20,2 +21,3 @@",
      oldStart: 20,
      newStart: 21,
      lines: [
        {
          type: "context",
          content: "if (enabled) {",
          oldLineNumber: 20,
          newLineNumber: 21,
        },
        {
          type: "added",
          content: "  dangerousCall();",
          newLineNumber: 22,
        },
        {
          type: "context",
          content: "}",
          oldLineNumber: 21,
          newLineNumber: 23,
        },
      ],
    },
  ],
};

describe("lineToPosition", () => {
  test("maps a new-file line number to unified diff position", () => {
    expect(lineToPosition(fileDiff, 10)).toBe(1);
    expect(lineToPosition(fileDiff, 11)).toBe(3);
    expect(lineToPosition(fileDiff, 22)).toBe(6);
    expect(lineToPosition(fileDiff, 999)).toBeNull();
  });
});

describe("postReview", () => {
  test("skips duplicate bot comments and posts only fresh inline comments", async () => {
    const reviewOutput: ReviewOutput = {
      summary: "The PR introduces one risky call.",
      overall_risk: "high",
      comments: [
        {
          file_path: "src/example.ts",
          line_number: 22,
          severity: "critical",
          category: "security",
          title: "Guard dangerous call",
          explanation: "This call should be validated before execution.",
          confidence: 0.91,
        },
        {
          file_path: "src/example.ts",
          line_number: 11,
          severity: "warning",
          category: "correctness",
          title: "Check return value",
          explanation: "This changed return should be verified.",
          suggested_fix: "return sanitize(newValue);",
          confidence: 0.72,
        },
      ],
    };

    const storedComments: StoredReviewComment[] = [
      {
        id: "stored-comment-1",
        filePath: "src/example.ts",
        lineNumber: 22,
        title: "Guard dangerous call",
      },
      {
        id: "stored-comment-2",
        filePath: "src/example.ts",
        lineNumber: 11,
        title: "Check return value",
      },
    ];

    let createReviewPayload: unknown;
    const octokit = {
      paginate: async () => [
        {
          path: "src/example.ts",
          line: 22,
          body: "**🔴 Critical**\n**Category:** security\n**Title:** Guard dangerous call\n\nAlready posted.",
          user: {
            type: "Bot",
          },
        },
      ],
      rest: {
        pulls: {
          listReviewComments: Symbol("listReviewComments"),
          createReview: async (payload: unknown) => {
            createReviewPayload = payload;
            return {
              data: {
                id: 5001,
                comments: [
                  {
                    id: 9001,
                  },
                ],
              },
            };
          },
        },
      },
    };

    const result = await postReview({
      octokit: octokit as never,
      owner: "acme",
      repo: "icra",
      prNumber: 10,
      reviewOutput,
      fileDiffs: [fileDiff],
      storedComments,
    });

    expect(result.githubReviewId).toBe("5001");
    expect(result.githubCommentIdsByStoredCommentId.get("stored-comment-2")).toBeUndefined();
    expect(createReviewPayload).toMatchObject({
      owner: "acme",
      repo: "icra",
      pull_number: 10,
      event: "COMMENT",
      comments: [
        {
          path: "src/example.ts",
          position: 3,
        },
      ],
    });
  });
});
