import type { ZodType } from "zod";

export interface StructuredOutputRunner<Output> {
  invoke(input: string): Promise<Output>;
}

export interface StructuredOutputModel {
  withStructuredOutput<Output extends Record<string, unknown>>(
    schema: ZodType<Output>,
    config: { name: string },
  ): StructuredOutputRunner<Output>;
}
