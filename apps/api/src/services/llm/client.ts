import { ChatGroq } from "@langchain/groq";

import { env } from "../../lib/env";

export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export function createGroqClient(modelName: string = DEFAULT_GROQ_MODEL): ChatGroq {
  return new ChatGroq({
    apiKey: env.GROQ_API_KEY,
    model: modelName,
    temperature: 0,
    maxRetries: 2,
  });
}
