import { Hono } from "hono";

import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { getMetricsRegistry } from "./lib/metrics";
import { adminRoute } from "./routes/admin";
import { webhookRoute } from "./routes/webhook";
import "./jobs/indexingProcessor";
import "./jobs/reviewProcessor";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/metrics", async (c) => {
  const registry = getMetricsRegistry();
  c.header("Content-Type", registry.contentType);

  return c.text(await registry.metrics());
});

app.route("/webhook", webhookRoute);
app.route("/api", adminRoute);

app.onError((error, c) => {
  logger.error({ err: error }, "Unhandled API error");

  return c.json(
    {
      error: "internal_server_error",
    },
    500,
  );
});

export default {
  port: env.API_PORT,
  fetch: app.fetch,
};

logger.info({ port: env.API_PORT }, "ICRA API starting");
