CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_owner TEXT NOT NULL,
  github_repo TEXT NOT NULL,
  github_token_enc TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
  review_policy JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS codebase_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  commit_sha TEXT NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chunks_repo_idx ON codebase_chunks (repository_id);
CREATE UNIQUE INDEX IF NOT EXISTS chunks_repo_file_start_idx ON codebase_chunks (repository_id, file_path, start_line);
CREATE INDEX IF NOT EXISTS codebase_chunks_embedding_hnsw_idx
  ON codebase_chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID REFERENCES repositories(id),
  pr_number INTEGER NOT NULL,
  pr_sha TEXT NOT NULL,
  github_review_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  model_used TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  duration_ms INTEGER,
  overall_risk TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS review_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  suggested_fix TEXT,
  confidence NUMERIC(3, 2),
  github_comment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comment_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES review_comments(id),
  github_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  edited_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
