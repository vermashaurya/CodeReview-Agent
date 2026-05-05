import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

import { env } from "../../lib/env";

export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-lite";

export function createGeminiClient(modelName: string = DEFAULT_GEMINI_MODEL): ChatGoogleGenerativeAI {
  return new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: modelName,
    temperature: 0,
    maxRetries: 2,
  });
}
