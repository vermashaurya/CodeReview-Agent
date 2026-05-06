import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";

export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubOwner: text("github_owner").notNull(),
  githubRepo: text("github_repo").notNull(),
  githubTokenEnc: text("github_token_enc").notNull(),
  model: text("model").notNull().default("llama-3.3-70b-versatile"),
  reviewPolicy: jsonb("review_policy"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const codebaseChunks = pgTable(
  "codebase_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id").references(() => repositories.id, {
      onDelete: "cascade",
    }),
    filePath: text("file_path").notNull(),
    language: text("language").notNull(),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    commitSha: text("commit_sha").notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    repoIdx: index("chunks_repo_idx").on(table.repositoryId),
    repoFileStartIdx: uniqueIndex("chunks_repo_file_start_idx").on(
      table.repositoryId,
      table.filePath,
      table.startLine,
    ),
  }),
);

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  repositoryId: uuid("repository_id").references(() => repositories.id),
  prNumber: integer("pr_number").notNull(),
  prSha: text("pr_sha").notNull(),
  githubReviewId: text("github_review_id"),
  status: text("status").notNull().default("pending"),
  modelUsed: text("model_used"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  durationMs: integer("duration_ms"),
  overallRisk: text("overall_risk"),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const reviewComments = pgTable("review_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewId: uuid("review_id").references(() => reviews.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  lineNumber: integer("line_number").notNull(),
  severity: text("severity").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  explanation: text("explanation").notNull(),
  suggestedFix: text("suggested_fix"),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  githubCommentId: text("github_comment_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const commentFeedback = pgTable("comment_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  commentId: uuid("comment_id").references(() => reviewComments.id),
  githubUserId: text("github_user_id").notNull(),
  action: text("action").notNull(),
  editedText: text("edited_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
