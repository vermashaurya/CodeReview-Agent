import { CohereEmbeddings } from "@langchain/cohere";

import { env } from "./env";

const EMBEDDING_MODEL = "embed-english-v3.0";

export const cohereDocumentEmbeddings = new CohereEmbeddings({
  apiKey: env.COHERE_API_KEY,
  model: EMBEDDING_MODEL,
  inputType: "search_document",
});

export const cohereQueryEmbeddings = new CohereEmbeddings({
  apiKey: env.COHERE_API_KEY,
  model: EMBEDDING_MODEL,
  inputType: "search_query",
});
