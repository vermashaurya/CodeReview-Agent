import { Hono } from "hono";
import { z } from "zod";

import { indexingQueue } from "../jobs/queue";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const route = new Hono();

route.post("/repositories/:id/index", async (c) => {
  const parsedParams = paramsSchema.safeParse(c.req.param());
  if (!parsedParams.success) {
    return c.json({ error: "invalid_repository_id" }, 400);
  }

  const job = await indexingQueue.add("index_repository", {
    repositoryId: parsedParams.data.id,
  });

  return c.json(
    {
      accepted: true,
      jobId: job.id,
    },
    202,
  );
});

export const adminRoute = route;
