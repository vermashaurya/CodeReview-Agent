import { Hono } from "hono";
import { Webhooks } from "@octokit/webhooks";

import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { reviewQueue } from "../jobs/queue";
import { pullRequestWebhookSchema } from "../types/github";

const webhooks = new Webhooks({
  secret: env.GITHUB_WEBHOOK_SECRET,
});

const route = new Hono();
const supportedActions = new Set(["opened", "reopened", "synchronize"]);

route.post("/github", async (c) => {
  const deliveryId = c.req.header("x-github-delivery");
  const eventName = c.req.header("x-github-event");
  const signature = c.req.header("x-hub-signature-256");
  const body = await c.req.text();

  if (!deliveryId || !eventName || !signature) {
    return c.json({ error: "missing_github_headers" }, 400);
  }

  const verified = await webhooks.verify(body, signature);
  if (!verified) {
    return c.json({ error: "invalid_signature" }, 401);
  }

  if (eventName !== "pull_request") {
    return c.json({ accepted: true, ignored: true }, 200);
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(body) as unknown;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsedPayload = pullRequestWebhookSchema.safeParse(rawPayload);
  if (!parsedPayload.success) {
    logger.warn(
      {
        deliveryId,
        issues: parsedPayload.error.issues,
      },
      "Invalid pull_request webhook payload",
    );

    return c.json({ error: "invalid_payload" }, 400);
  }

  const payload = parsedPayload.data;
  if (!payload.action || !supportedActions.has(payload.action)) {
    return c.json({ accepted: true, ignored: true }, 200);
  }

  const job = await reviewQueue.add("review", {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    prNumber: payload.pull_request.number,
    headSha: payload.pull_request.head.sha,
    installationId: payload.installation?.id,
  });

  logger.info(
    {
      deliveryId,
      eventName,
      action: payload.action,
      jobId: job.id,
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      prNumber: payload.pull_request.number,
      headSha: payload.pull_request.head.sha,
    },
    "GitHub webhook enqueued review job",
  );

  return c.json({ accepted: true, jobId: job.id }, 200);
});

export const webhookRoute = route;
