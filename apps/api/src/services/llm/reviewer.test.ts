import { describe, expect, test } from "bun:test";
import type { FileDiff } from "@icra/shared/types";
import type { ZodType } from "zod";

import { reviewDiffChunk } from "./reviewer";
import type { StructuredOutputModel, StructuredOutputRunner } from "./types";
import type { RetrievedChunk } from "../../types/rag";

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

const fileDiff: FileDiff = {
  filename: "src/example.ts",
  language: "typescript",
  status: "modified",
  additions: 2,
  deletions: 1,
  hunks: [
    {
      header: "@@ -10,2 +10,3 @@",
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
          type: "added",
          content: "console.log(newValue);",
          newLineNumber: 12,
        },
      ],
    },
  ],
};

describe("reviewDiffChunk", () => {
  test("normalizes file_path and filters hallucinated line numbers", async () => {
    const model = new MockStructuredOutputModel({
      submit_review: () => ({
        summary: "Found a risky logging statement.",
        overall_risk: "medium",
        comments: [
          {
            file_path: "wrong/file.ts",
            line_number: 12,
            severity: "warning",
            category: "style",
            title: "Avoid debug logging",
            explanation: "This log statement should not ship.",
            references_similar_pattern: "src/pattern.ts:5-12",
            confidence: 0.734,
          },
          {
            file_path: "wrong/file.ts",
            line_number: 999,
            severity: "warning",
            category: "correctness",
            title: "Hallucinated line",
            explanation: "This should be removed by validation.",
            confidence: 0.82,
          },
        ],
      }),
    });

    const result = await reviewDiffChunk({
      model,
      repositoryId: "repo-1",
      fileDiff,
      context: "No additional context.",
      retrieveSimilarChunksFn: async (): Promise<RetrievedChunk[]> => [
        {
          filePath: "src/pattern.ts",
          language: "typescript",
          startLine: 5,
          endLine: 12,
          content: "export function sanitize(input: string) { return input.trim(); }",
          commitSha: "abc123",
          distance: 0.12,
        },
      ],
    });

    expect(result.summary).toBe("Found a risky logging statement.");
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]).toEqual({
      file_path: "src/example.ts",
      line_number: 12,
      severity: "warning",
      category: "style",
      title: "Avoid debug logging",
      explanation: "This log statement should not ship.",
      references_similar_pattern: "src/pattern.ts:5-12",
      confidence: 0.73,
    });
    expect(model.prompts[0]?.name).toBe("submit_review");
    expect(model.prompts[0]?.input.includes("Do not hallucinate file paths or line numbers.")).toBe(true);
    expect(model.prompts[0]?.input.includes("Existing codebase patterns for reference")).toBe(true);
  });

  test("retries Gemini calls with exponential backoff", async () => {
    let attempts = 0;
    const sleepCalls: number[] = [];
    const model = new MockStructuredOutputModel({
      submit_review: () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("temporary Gemini failure");
        }

        return {
          summary: "No issues found.",
          overall_risk: "low",
          comments: [],
        };
      },
    });

    const result = await reviewDiffChunk({
      model,
      repositoryId: "repo-1",
      fileDiff,
      context: "No additional context.",
      retrieveSimilarChunksFn: async (): Promise<RetrievedChunk[]> => [],
      retryOptions: {
        attempts: 3,
        baseDelayMs: 2000,
        sleep: async (delayMs: number): Promise<void> => {
          sleepCalls.push(delayMs);
        },
      },
    });

    expect(result.overall_risk).toBe("low");
    expect(attempts).toBe(3);
    expect(sleepCalls).toEqual([2000, 4000]);
  });
});
