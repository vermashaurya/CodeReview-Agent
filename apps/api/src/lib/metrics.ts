import { Registry, collectDefaultMetrics } from "prom-client";

const register = new Registry();

collectDefaultMetrics({ register });

export function getMetricsRegistry(): Registry {
  return register;
}

