import { describe, expect, test } from "bun:test";

import { extractChunks } from "./parser";

describe("extractChunks", () => {
  test("uses a single sliding-window chunk for files under 400 lines", () => {
    const content = [
      "export class Greeter {",
      "  greet(name: string) {",
      "    return `hello ${name}`;",
      "  }",
      "}",
      "",
      "export function add(a: number, b: number) {",
      "  return a + b;",
      "}",
    ].join("\n");

    const chunks = extractChunks("src/example.ts", content, "typescript");

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.startLine).toBe(1);
    expect(chunks[0]?.endLine).toBe(9);
    expect(chunks[0]?.content.includes("class Greeter")).toBe(true);
    expect(chunks[0]?.content.includes("function add")).toBe(true);
  });

  test("splits files into 400-line windows with 80-line overlap", () => {
    const content = Array.from({ length: 420 }, (_, index) => `line ${index + 1}`).join("\n");

    const chunks = extractChunks("src/example.rb", content, "ruby");

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.startLine).toBe(1);
    expect(chunks[0]?.endLine).toBe(400);
    expect(chunks[1]?.startLine).toBe(321);
  });
});
