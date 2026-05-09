export interface CodeChunk {
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  content: string;
}

export interface CodeChunkWithEmbedding extends CodeChunk {
  embedding: number[];
}

export interface RetrievedChunk extends CodeChunk {
  distance: number;
  commitSha: string;
}
