import type { FileDiff, ReviewOutput } from "@icra/shared/types";
import type { Octokit } from "@octokit/rest";

import type { StoredReviewComment } from "../review/persistence";

interface ExistingGitHubReviewComment {
  path: string;
  line?: number;
  body?: string;
  user?: {
    type?: string;
  };
}

interface PreparedInlineComment {
  path: string;
  position: number;
  body: string;
  storedCommentId: string;
}

function extractTitleFromBody(body: string | undefined): string | null {
  if (!body) {
    return null;
  }

  const match = body.match(/\*\*Title:\*\*\s*(.+)/);
  return match?.[1]?.trim() ?? null;
}

function buildDuplicateKey(filePath: string, lineNumber: number, title: string): string {
  return `${filePath}:${lineNumber}:${title}`;
}

function formatSeverityBadge(severity: "critical" | "warning" | "suggestion"): string {
  if (severity === "critical") {
    return "🔴 Critical";
  }

  if (severity === "warning") {
    return "🟡 Warning";
  }

  return "🔵 Suggestion";
}

function formatCommentBody(comment: ReviewOutput["comments"][number]): string {
  const segments = [
    `**${formatSeverityBadge(comment.severity)}**`,
    `**Category:** ${comment.category}`,
    `**Title:** ${comment.title}`,
    "",
    comment.explanation,
  ];

  if (comment.suggested_fix) {
    segments.push("", "**Suggested fix:**", "```suggestion", comment.suggested_fix, "```");
  }

  return segments.join("\n");
}

function formatReviewSummary(reviewOutput: ReviewOutput): string {
  const criticalCount = reviewOutput.comments.filter((comment) => comment.severity === "critical").length;
  const warningCount = reviewOutput.comments.filter((comment) => comment.severity === "warning").length;
  const suggestionCount = reviewOutput.comments.filter((comment) => comment.severity === "suggestion").length;

  return [
    "## Summary",
    reviewOutput.summary,
    "",
    "## Findings",
    `- Critical: ${criticalCount}`,
    `- Warnings: ${warningCount}`,
    `- Suggestions: ${suggestionCount}`,
    "",
    "## Context Used",
    "- Pull request diff",
    "- Repository review policy (if configured)",
    "- Structured LLM analysis",
  ].join("\n");
}

export function lineToPosition(fileDiff: FileDiff, lineNumber: number): number | null {
  let position = 0;

  for (const hunk of fileDiff.hunks) {
    for (const line of hunk.lines) {
      position += 1;

      if (line.newLineNumber === lineNumber) {
        return position;
      }
    }
  }

  return null;
}

async function listExistingBotComments(params: {
  octokit: Octokit;
  owner: string;
  repo: string;
  prNumber: number;
}): Promise<Set<string>> {
  const comments = await params.octokit.paginate(params.octokit.rest.pulls.listReviewComments, {
    owner: params.owner,
    repo: params.repo,
    pull_number: params.prNumber,
    per_page: 100,
  });

  const duplicateKeys = new Set<string>();

  for (const comment of comments as ExistingGitHubReviewComment[]) {
    if (comment.user?.type !== "Bot") {
      continue;
    }

    const title = extractTitleFromBody(comment.body);
    if (!title || typeof comment.line !== "number") {
      continue;
    }

    duplicateKeys.add(buildDuplicateKey(comment.path, comment.line, title));
  }

  return duplicateKeys;
}

function prepareInlineComments(params: {
  reviewOutput: ReviewOutput;
  fileDiffs: FileDiff[];
  storedComments: StoredReviewComment[];
  duplicateKeys: Set<string>;
}): PreparedInlineComment[] {
  const storedCommentByKey = new Map<string, StoredReviewComment>();
  for (const storedComment of params.storedComments) {
    storedCommentByKey.set(
      buildDuplicateKey(storedComment.filePath, storedComment.lineNumber, storedComment.title),
      storedComment,
    );
  }

  return params.reviewOutput.comments.flatMap((comment) => {
    const duplicateKey = buildDuplicateKey(comment.file_path, comment.line_number, comment.title);
    if (params.duplicateKeys.has(duplicateKey)) {
      return [];
    }

    const fileDiff = params.fileDiffs.find((candidate) => candidate.filename === comment.file_path);
    if (!fileDiff) {
      return [];
    }

    const position = lineToPosition(fileDiff, comment.line_number);
    if (position === null) {
      return [];
    }

    const storedComment = storedCommentByKey.get(duplicateKey);
    if (!storedComment) {
      return [];
    }

    return [
      {
        path: comment.file_path,
        position,
        body: formatCommentBody(comment),
        storedCommentId: storedComment.id,
      },
    ];
  });
}

export async function postReview(params: {
  octokit: Octokit;
  owner: string;
  repo: string;
  prNumber: number;
  reviewOutput: ReviewOutput;
  fileDiffs: FileDiff[];
  storedComments: StoredReviewComment[];
}): Promise<{ githubReviewId: string; githubCommentIdsByStoredCommentId: Map<string, string> }> {
  const duplicateKeys = await listExistingBotComments({
    octokit: params.octokit,
    owner: params.owner,
    repo: params.repo,
    prNumber: params.prNumber,
  });

  const inlineComments = prepareInlineComments({
    reviewOutput: params.reviewOutput,
    fileDiffs: params.fileDiffs,
    storedComments: params.storedComments,
    duplicateKeys,
  });

  const response = await params.octokit.rest.pulls.createReview({
    owner: params.owner,
    repo: params.repo,
    pull_number: params.prNumber,
    event: "COMMENT",
    body: formatReviewSummary(params.reviewOutput),
    comments: inlineComments.map((comment) => ({
      path: comment.path,
      position: comment.position,
      body: comment.body,
    })),
  });

  const githubCommentIdsByStoredCommentId = new Map<string, string>();
  // GitHub's createReview response does not include individual comment IDs.
  // Comment IDs can be backfilled via listReviewComments in a future phase.

  return {
    githubReviewId: String(response.data.id),
    githubCommentIdsByStoredCommentId,
  };
}
