import { describe, expect, test } from "bun:test";
import type { FileDiff } from "@icra/shared/types";
import type { ZodType } from "zod";

import { orchestrateReview } from "./orchestrator";
import type { StructuredOutputModel, StructuredOutputRunner } from "./types";
import type { DiffChunk } from "../../types/diff";

class MockStructuredOutputModel implements StructuredOutputModel {
  private readonly handlers: Map<string, (input: string) => unknown>;
  readonly prompts: Array<{ name: string; input: string }> = [];

  constructor(handlers: Record<string, (input: string) => unknown>) {
    this.handlers = new Map(Object.entries(handlers));
  }

  withStructuredOutput<Output extends Record<string, unknown>>(
    schema: ZodType<Output>,
    config: { name: string },
  ): StructuredOutputRunner<Output> {
    const handler = this.handlers.get(config.name);
    if (!handler) {
      throw new Error(`No mock handler registered for ${config.name}`);
    }

    return {
      invoke: async (input: string): Promise<Output> => {
        this.prompts.push({ name: config.name, input });
        return schema.parse(handler(input));
      },
    };
  }
}

const fileDiffA: FileDiff = {
  filename: "src/a.ts",
  language: "typescript",
  status: "modified",
  additions: 1,
  deletions: 0,
  hunks: [
    {
      header: "@@ -1,1 +1,2 @@",
      oldStart: 1,
      newStart: 1,
      lines: [
        {
          type: "context",
          content: "const start = true;",
          oldLineNumber: 1,
          newLineNumber: 1,
        },
        {
          type: "added",
          content: "dangerousCall();",
          newLineNumber: 2,
        },
      ],
    },
  ],
};

const fileDiffB: FileDiff = {
  filename: "src/b.ts",
  language: "typescript",
  status: "modified",
  additions: 1,
  deletions: 0,
  hunks: [
    {
      header: "@@ -5,1 +5,2 @@",
      oldStart: 5,
      newStart: 5,
      lines: [
        {
          type: "context",
          content: "const value = 1;",
          oldLineNumber: 5,
          newLineNumber: 5,
        },
        {
          type: "added",
          content: "return value * 2;",
          newLineNumber: 6,
        },
      ],
    },
  ],
};

describe("orchestrateReview", () => {
  test("runs a per-file pass then a summary pass and deduplicates comments", async () => {
    let reviewCalls = 0;
    const model = new MockStructuredOutputModel({
      submit_review: (input: string) => {
        reviewCalls += 1;
        if (reviewCalls === 1) {
          expect(input.includes("src/a.ts")).toBe(true);
          return {
            summary: "File A has a risky call.",
            overall_risk: "high",
            comments: [
              {
                file_path: "src/a.ts",
                line_number: 2,
                severity: "critical",
                category: "security",
                title: "Guard dangerous call",
                explanation: "This call needs validation before execution.",
                confidence: 0.91,
              },
            ],
          };
        }

        expect(input.includes("src/b.ts")).toBe(true);
        return {
          summary: "File B doubles a value.",
          overall_risk: "low",
          comments: [
            {
              file_path: "src/a.ts",
              line_number: 2,
              severity: "critical",
              category: "security",
              title: "Guard dangerous call",
              explanation: "This call needs validation before execution.",
              confidence: 0.91,
            },
            {
              file_path: "src/b.ts",
              line_number: 6,
              severity: "suggestion",
              category: "performance",
              title: "Simplify multiplication",
              explanation: "This computation can be simplified if needed.",
              confidence: 0.62,
            },
          ],
        };
      },
      submit_summary: (input: string) => {
        expect(input.includes("Existing file-level findings")).toBe(true);
        return {
          summary: "The PR introduces one critical security concern and one minor improvement opportunity.",
          overall_risk: "high",
        };
      },
    });

    const diffChunks: DiffChunk[] = [
      {
        chunkIndex: 0,
        totalChunks: 1,
        changedLines: 1,
        file: fileDiffA,
      },
      {
        chunkIndex: 0,
        totalChunks: 1,
        changedLines: 1,
        file: fileDiffB,
      },
    ];

    const result = await orchestrateReview({
      model,
      repositoryId: "repo-1",
      fileDiffs: [fileDiffA, fileDiffB],
      diffChunks,
      reviewPolicy: "Flag unsafe dynamic execution as critical.",
      retrieveSimilarChunksFn: async () => [],
    });

    expect(result.summary).toContain("critical security concern");
    expect(result.overall_risk).toBe("high");
    expect(result.comments).toHaveLength(2);
    expect(model.prompts.map((prompt) => prompt.name)).toEqual([
      "submit_review",
      "submit_review",
      "submit_summary",
    ]);
  });
});
