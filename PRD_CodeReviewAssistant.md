# Product Requirements Document
# Intelligent Code Review Assistant (ICRA)

**Version:** 1.0  
**Status:** Draft  
**Author:** Internal  
**Last Updated:** May 2026

---

## 1. Executive Summary

The Intelligent Code Review Assistant (ICRA) is an AI-powered system that integrates with GitHub (and optionally Azure DevOps) to automatically analyse pull requests and deliver deep, context-aware code review comments. Unlike generic linters or rule-based tools, ICRA understands your specific codebase conventions via Retrieval-Augmented Generation (RAG), detects architectural inconsistencies, security anti-patterns, and logic errors, and continuously improves through developer feedback. It posts structured, actionable inline comments directly to PRs and exposes a real-time dashboard for team-level insights.

---

## 2. Problem Statement

Enterprise software teams face two compounding problems in code review:

1. **Reviewer bandwidth is the bottleneck.** Senior engineers spend a disproportionate share of their time on reviews that could be caught automatically — style violations, common security mistakes, missing error handling, or patterns inconsistent with team conventions. This blocks junior developers and slows cycle time.

2. **Generic tools miss context.** ESLint, SonarQube, and similar tools are excellent for rules they know about, but cannot reason about whether a new authentication flow is consistent with existing patterns in the codebase, or whether a new service boundary violates the team's established domain architecture.

ICRA addresses both: it handles the mechanical and context-aware review burden so that human reviewers can focus on intent, design tradeoffs, and business logic.

---

## 3. Goals and Non-Goals

### Goals

- Automatically analyse every PR within 60 seconds of being opened or updated.
- Surface comments that are genuinely specific to the changed code and the surrounding codebase context — not boilerplate.
- Categorise findings by type (security, correctness, architecture, performance, style) and severity (critical, warning, suggestion).
- Post findings as inline GitHub PR review comments at the exact changed line.
- Capture developer feedback (accept / dismiss / edit) on each comment and feed it back into continuous improvement.
- Provide a dashboard showing per-team and per-repository review trends over time.
- Support multi-tenancy from day one so the system can serve multiple repositories or teams with isolated codebase indexes.

### Non-Goals (v1)

- Automatically merging or blocking PRs (no automated gatekeeping; ICRA is advisory only).
- Full IDE integration (that is a v2 concern).
- Support for non-text artefacts (images, binaries, notebooks).
- Self-hosted LLM inference (cloud LLM APIs only in v1).
- Fine-tuning the base LLM model (prompt + retrieval improvement only in v1).

---

## 4. Users and Stakeholders

| Persona | Description | Primary Interaction |
|---|---|---|
| Developer | Opens PRs, receives and acts on review comments | GitHub PR interface |
| Tech Lead / Reviewer | Validates AI review quality, sets review policies | Dashboard + GitHub |
| Engineering Manager | Monitors team review health and velocity | Dashboard |
| Platform Admin | Installs ICRA, manages API keys, configures repositories | Admin UI + config files |

---

## 5. System Architecture Overview

```
GitHub Webhook (PR opened/updated)
        │
        ▼
  API Gateway / Webhook Handler (Hono.js on Bun)
        │
        ▼
  Job Queue (BullMQ + Redis)
        │
        ├──► Diff Parser & Chunker
        │         │
        │         ├──► RAG Retriever (pgvector) ──► codebase embedding index
        │         ├──► Static Analysis runner (ESLint / Semgrep)
        │         └──► Context assembler
        │
        ├──► LLM Orchestrator (LangChain.js)
        │         │
        │         └──► Claude Sonnet / GPT-4o (structured JSON output)
        │
        └──► GitHub Review Writer (Octokit)
                  │
                  └──► POST inline comments to PR

  Persistence:
    PostgreSQL (pgvector extension)
      - codebase_chunks (embedding vectors + source metadata)
      - reviews (PR metadata, final review JSON)
      - comments (individual comment records + feedback)
      - repositories (tenant config)

  Frontend:
    Next.js 14 (App Router) + shadcn/ui
      - Real-time dashboard (WebSocket via Socket.io)
      - Comment feedback UI
      - Admin configuration
```

---

## 6. Functional Requirements

### 6.1 Webhook Ingestion

- **FR-01:** The system MUST expose a POST `/webhook/github` endpoint that accepts GitHub webhook payloads for `pull_request` events (types: `opened`, `synchronize`, `reopened`).
- **FR-02:** The system MUST verify the `X-Hub-Signature-256` HMAC header on every incoming webhook to reject tampered or unauthorised requests.
- **FR-03:** The webhook handler MUST respond with HTTP 200 within 500ms and enqueue all processing work asynchronously. GitHub will retry on non-2xx or timeout.
- **FR-04:** The system MUST support Azure DevOps service hooks as an additional ingestion source (v1 optional, fully designed from the start).

### 6.2 Diff Parsing and Chunking

- **FR-05:** The system MUST fetch the full unified diff for the PR via the GitHub REST API (`GET /repos/{owner}/{repo}/pulls/{pull_number}/files`).
- **FR-06:** Diffs MUST be parsed into structured `FileDiff` objects containing: filename, language (inferred), list of hunks (each with: start line, context lines, added lines with line numbers, removed lines with line numbers).
- **FR-07:** Files exceeding 500 changed lines MUST be split into overlapping chunks of 200 lines with 50-line overlap to stay within LLM context limits, and results merged before posting.
- **FR-08:** Binary files, auto-generated files (detected by comment headers), and files matching `.gitignore`-style exclusion patterns in the repository config MUST be skipped.

### 6.3 Codebase Indexing (RAG)

- **FR-09:** The system MUST provide a CLI command `icra index --repo <owner/repo>` that clones the repository, walks all source files, parses them into function/class-level chunks using tree-sitter, generates embeddings, and stores them in pgvector.
- **FR-10:** Chunking MUST be function-level (not file-level, not line-level). A chunk is one function, method, class declaration, or top-level module block. The chunk record stores: content, file path, start line, end line, language, embedding vector (1536-dim), last_commit SHA.
- **FR-11:** The system MUST support incremental re-indexing: on a push to `main`, only files changed in that commit are re-embedded. Full reindex is a manual admin operation.
- **FR-12:** At review time, the incoming diff chunk MUST be embedded and the top-8 most similar codebase chunks retrieved via cosine similarity search on pgvector (`<=>` operator).
- **FR-13:** Embeddings MUST use OpenAI `text-embedding-3-small` (1536 dimensions). The embedding model is configurable via environment variable.

### 6.4 Static Analysis Integration

- **FR-14:** Before sending to the LLM, the system MUST run ESLint (for JS/TS files) and Semgrep (for all supported languages) on the changed files and collect their findings.
- **FR-15:** Static analysis results MUST be included in the LLM prompt context as structured data so the LLM can incorporate, expand on, or contextualise them rather than duplicating them.
- **FR-16:** Static analysis MUST run in an isolated sandbox (Docker container with no network access) to safely execute on untrusted code.

### 6.5 LLM Review Generation

- **FR-17:** The LLM MUST be prompted with: (a) system prompt establishing reviewer persona and output schema, (b) the diff chunk being reviewed, (c) retrieved codebase context chunks labelled with their source path, (d) static analysis findings for the changed files, (e) repository-level review policy (configurable per repo).
- **FR-18:** The LLM MUST return a structured JSON object conforming to the `ReviewOutput` schema (see Section 8.1). The system MUST use function calling / tool use to enforce this schema rather than parsing free text.
- **FR-19:** The system MUST support model selection per repository (default: `claude-sonnet-4-20250514`; alternative: `gpt-4o`). The model is stored in the repository config.
- **FR-20:** Each PR MUST be reviewed in two passes: (a) per-file pass that generates file-scoped comments; (b) synthesis pass that reviews the full set of changes holistically and adds PR-level summary and cross-file architectural comments.
- **FR-21:** The system MUST implement exponential backoff retry (max 3 attempts) on LLM API failures and rate limit errors.

### 6.6 GitHub Comment Posting

- **FR-22:** The system MUST post all generated comments as a single GitHub pull request review via `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` with event type `COMMENT` (not APPROVE or REQUEST_CHANGES in v1).
- **FR-23:** Each comment MUST be posted as an inline review comment at the exact line number returned by the LLM, referencing the correct `path` and `position` values from the diff.
- **FR-24:** The PR-level summary MUST be posted as the review body, formatted as Markdown with sections: Summary, Critical Issues, Warnings, Suggestions, Context Used.
- **FR-25:** Each inline comment body MUST include: severity badge (🔴 Critical / 🟡 Warning / 🔵 Suggestion), category tag, explanation, and (where applicable) a concrete suggested fix in a fenced code block.
- **FR-26:** The system MUST NOT post duplicate comments on re-review. Before posting, it MUST check existing review comments from the ICRA bot account and skip comments for lines that already have an identical finding from the same review SHA.

### 6.7 Feedback Collection

- **FR-27:** A feedback endpoint `POST /api/feedback` MUST accept: `comment_id`, `action` (accepted | dismissed | edited), `edited_text` (optional), `user_github_id`.
- **FR-28:** Feedback MUST be stored in the `comment_feedback` table and asynchronously used to recompute per-category and per-repository precision metrics visible in the dashboard.
- **FR-29:** The dashboard MUST surface a "flagged as unhelpful" queue for admin review, surfacing comments with high dismissal rates so prompt engineers can improve the system prompt.

### 6.8 Dashboard

- **FR-30:** The Next.js dashboard MUST display: (a) per-repository review volume over time, (b) comment acceptance rate by category, (c) average time-to-first-review, (d) top recurring issue types, (e) per-developer comment breakdown.
- **FR-31:** The dashboard MUST support GitHub OAuth for login. Only members of the connected GitHub organisation can access the dashboard.
- **FR-32:** Review results MUST appear on the dashboard in real time using WebSocket push (Socket.io) when a review job completes.

---

## 7. Non-Functional Requirements

### 7.1 Performance

- **NFR-01:** End-to-end latency from webhook receipt to first PR comment posted MUST be under 60 seconds for PRs with fewer than 200 changed lines under normal LLM API conditions.
- **NFR-02:** The job queue MUST support at least 50 concurrent review jobs without degradation.
- **NFR-03:** pgvector similarity search MUST complete within 200ms for repositories with up to 500,000 indexed chunks. Requires an IVFFlat or HNSW index.

### 7.2 Reliability

- **NFR-04:** Failed jobs MUST be retried up to 3 times with exponential backoff. Permanently failed jobs MUST be moved to a dead-letter queue and surfaced in the admin dashboard.
- **NFR-05:** The system MUST be stateless at the API layer — all state lives in Redis (queue) and PostgreSQL — so horizontal scaling requires only adding API replicas.

### 7.3 Security

- **NFR-06:** GitHub tokens MUST be stored encrypted at rest using AES-256. They MUST never be logged.
- **NFR-07:** All LLM prompts that include code MUST be transmitted over TLS. No code content is stored by the LLM provider beyond their stated retention policy; the GitHub App MUST request only the minimum required OAuth scopes (`pull_requests: write`, `contents: read`, `metadata: read`).
- **NFR-08:** Static analysis execution MUST occur inside a network-isolated Docker container. The host network MUST NOT be accessible from within the analysis container.
- **NFR-09:** Multi-tenant isolation: each repository's vector embeddings MUST be scoped by `repository_id` in all queries. Cross-repository retrieval MUST be impossible by default.

### 7.4 Observability

- **NFR-10:** All job lifecycle events (enqueued, started, completed, failed) MUST emit structured JSON logs with: job_id, repository_id, pr_number, duration_ms, token_count, model_used.
- **NFR-11:** The system MUST expose a Prometheus `/metrics` endpoint with: queue depth, job processing time (p50/p95/p99), LLM API error rate, comment post success rate.

---

## 8. Data Models

### 8.1 ReviewOutput Schema (LLM Output Contract)

```typescript
interface ReviewOutput {
  summary: string;                     // 2-4 sentence PR-level overview
  overall_risk: 'low' | 'medium' | 'high';
  comments: ReviewComment[];
}

interface ReviewComment {
  file_path: string;                   // relative path in repo
  line_number: number;                 // line in the new file (post-diff)
  severity: 'critical' | 'warning' | 'suggestion';
  category: 'security' | 'correctness' | 'architecture' | 'performance' | 'style';
  title: string;                       // ≤ 10 words
  explanation: string;                 // 2-5 sentences of context
  suggested_fix?: string;              // code block or prose suggestion
  references_similar_pattern?: string; // path to similar existing code retrieved via RAG
  confidence: number;                  // 0.0–1.0, used to suppress low-confidence noise
}
```

### 8.2 Database Schema (PostgreSQL)

```sql
-- Tenant / repository configuration
CREATE TABLE repositories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_owner  TEXT NOT NULL,
  github_repo   TEXT NOT NULL,
  github_token_enc TEXT NOT NULL,      -- AES-256 encrypted
  model         TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  review_policy JSONB,                  -- custom instructions per repo
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(github_owner, github_repo)
);

-- Codebase chunk embeddings
CREATE TABLE codebase_chunks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id  UUID REFERENCES repositories(id) ON DELETE CASCADE,
  file_path      TEXT NOT NULL,
  language       TEXT NOT NULL,
  start_line     INT NOT NULL,
  end_line       INT NOT NULL,
  content        TEXT NOT NULL,
  embedding      VECTOR(1536),
  commit_sha     TEXT NOT NULL,
  indexed_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON codebase_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON codebase_chunks (repository_id);

-- Pull request review records
CREATE TABLE reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id  UUID REFERENCES repositories(id),
  pr_number      INT NOT NULL,
  pr_sha         TEXT NOT NULL,
  github_review_id BIGINT,
  status         TEXT NOT NULL DEFAULT 'pending', -- pending|processing|completed|failed
  model_used     TEXT,
  input_tokens   INT,
  output_tokens  INT,
  duration_ms    INT,
  overall_risk   TEXT,
  summary        TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  completed_at   TIMESTAMPTZ
);

-- Individual review comments
CREATE TABLE review_comments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id      UUID REFERENCES reviews(id) ON DELETE CASCADE,
  file_path      TEXT NOT NULL,
  line_number    INT NOT NULL,
  severity       TEXT NOT NULL,
  category       TEXT NOT NULL,
  title          TEXT NOT NULL,
  explanation    TEXT NOT NULL,
  suggested_fix  TEXT,
  confidence     NUMERIC(3,2),
  github_comment_id BIGINT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Developer feedback on comments
CREATE TABLE comment_feedback (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id     UUID REFERENCES review_comments(id),
  github_user_id TEXT NOT NULL,
  action         TEXT NOT NULL,        -- accepted|dismissed|edited
  edited_text    TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);
```

---

## 9. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Runtime | Bun | Significantly faster than Node.js for I/O-heavy workloads; native TypeScript; compatible with most npm packages |
| API framework | Hono.js | Extremely lightweight, type-safe, runs on Bun natively, excellent middleware support |
| Job queue | BullMQ + Redis (Upstash or self-hosted) | Battle-tested, supports priorities, retries, dead-letter queue, concurrency control |
| Database | PostgreSQL 16 + pgvector extension | Single database handles both relational data and vector similarity search, eliminating operational complexity of a separate vector store |
| ORM | Drizzle ORM | Fully type-safe, schema-as-code, excellent PostgreSQL support, fast |
| Embeddings | OpenAI `text-embedding-3-small` | Best quality-to-cost ratio; 1536 dimensions; ~$0.00002 per 1K tokens |
| LLM | Anthropic Claude Sonnet (primary), GPT-4o (secondary) | Claude has excellent structured output via tool use and strong code understanding |
| LLM orchestration | LangChain.js | Standardises model switching, prompt templating, and retrieval chain composition |
| Code parsing | tree-sitter (Node bindings) | Language-aware AST parsing for function-level chunking across 40+ languages |
| Static analysis | ESLint + Semgrep | ESLint for JS/TS rules; Semgrep for cross-language security patterns |
| Frontend | Next.js 14 (App Router) | Best-in-class React framework; server components; built-in API routes |
| UI components | shadcn/ui + Tailwind CSS | Unstyled accessible components; full design control; no vendor lock-in |
| Real-time | Socket.io | WebSocket-based push for dashboard live updates |
| Auth | NextAuth.js (GitHub OAuth) | Native GitHub OAuth; minimal configuration |
| Container | Docker + Docker Compose | Local dev parity; static analysis sandbox isolation |
| Observability | Pino (structured logging) + prom-client | JSON logs for log aggregation; Prometheus metrics for alerting |

---

## 10. API Surface

### Internal REST API (Hono.js backend)

| Method | Path | Description |
|---|---|---|
| POST | `/webhook/github` | GitHub webhook receiver |
| POST | `/webhook/azuredevops` | Azure DevOps hook receiver (v1 optional) |
| GET | `/api/reviews/:repo` | List recent reviews for a repository |
| GET | `/api/reviews/:repo/:pr_number` | Get full review detail for a PR |
| POST | `/api/feedback` | Submit developer feedback on a comment |
| GET | `/api/repositories` | List configured repositories |
| POST | `/api/repositories` | Register a new repository |
| POST | `/api/repositories/:id/index` | Trigger a full reindex |
| GET | `/metrics` | Prometheus metrics endpoint |
| GET | `/health` | Health check |

### WebSocket Events (Socket.io)

| Event | Direction | Payload |
|---|---|---|
| `review:started` | Server → Client | `{ repo, pr_number, job_id }` |
| `review:completed` | Server → Client | `{ repo, pr_number, review_id, overall_risk, comment_count }` |
| `review:failed` | Server → Client | `{ repo, pr_number, error }` |

---

## 11. Phased Delivery Plan

### Phase 1 — Core Pipeline (Weeks 1–3)
Webhook ingestion, diff parsing, basic LLM review (no RAG), GitHub comment posting. By end of phase: a working bot that reviews PRs using only the diff as context.

### Phase 2 — RAG Integration (Weeks 4–6)
tree-sitter chunking, embedding pipeline, pgvector storage and retrieval, incremental indexing. By end of phase: comments that reference real patterns from the codebase.

### Phase 3 — Static Analysis + Quality (Weeks 7–8)
ESLint and Semgrep integration, sandboxed execution, two-pass review (per-file + synthesis), confidence scoring to suppress noise.

### Phase 4 — Dashboard + Feedback (Weeks 9–11)
Next.js dashboard, GitHub OAuth, WebSocket real-time updates, feedback endpoint and storage, acceptance rate metrics.

### Phase 5 — Hardening + Multi-tenancy (Weeks 12–14)
Admin UI, per-repository review policies, encrypted token storage, Prometheus metrics, dead-letter queue management, load testing.

---

## 12. Open Questions

1. Should ICRA post a `REQUEST_CHANGES` review event for PRs with critical findings, or remain advisory (`COMMENT`) only in v1? Recommendation: advisory only; gatekeeping is a policy decision that varies per team.
2. What is the acceptable LLM cost per PR review? Estimate: ~$0.03–0.08 per review at current Sonnet pricing for a typical 200-line PR.
3. How should PII in code (hardcoded credentials, emails) be handled? Recommendation: Semgrep catches most of these; escalate to critical severity and optionally notify the PR author privately.
4. Is SSO (SAML/OIDC) required for the dashboard in v1, or is GitHub OAuth sufficient?

---

## 13. Success Metrics

| Metric | Target (90 days post-launch) |
|---|---|
| Comment acceptance rate | ≥ 60% of posted comments accepted or edited (not dismissed) |
| Time to first comment | ≤ 60 seconds p95 |
| Review coverage | 100% of PRs in enrolled repositories receive a review |
| False positive rate | ≤ 25% dismissal rate on critical severity comments |
| Developer NPS | ≥ +30 from a post-launch survey |
