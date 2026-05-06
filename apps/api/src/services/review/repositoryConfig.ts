import { and, eq } from "drizzle-orm";

import { db } from "../../db/client";
import { repositories } from "../../db/schema";

export interface RepositoryConfig {
  id: string;
  model: string;
  reviewPolicy: string | null;
  githubToken: string;
}

function stringifyReviewPolicy(reviewPolicy: unknown): string | null {
  if (reviewPolicy === null || typeof reviewPolicy === "undefined") {
    return null;
  }

  if (typeof reviewPolicy === "string") {
    return reviewPolicy;
  }

  return JSON.stringify(reviewPolicy);
}

export async function loadRepositoryConfig(
  owner: string,
  repo: string,
): Promise<RepositoryConfig | null> {
  const rows = await db
    .select({
      id: repositories.id,
      model: repositories.model,
      reviewPolicy: repositories.reviewPolicy,
      githubToken: repositories.githubTokenEnc,
    })
    .from(repositories)
    .where(and(eq(repositories.githubOwner, owner), eq(repositories.githubRepo, repo)))
    .limit(1);

  const repository = rows[0];
  if (!repository) {
    return null;
  }

  return {
    id: repository.id,
    model: repository.model,
    reviewPolicy: stringifyReviewPolicy(repository.reviewPolicy),
    githubToken: repository.githubToken,
  };
}
