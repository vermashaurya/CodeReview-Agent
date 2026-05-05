import { Queue } from "bullmq";

import { redisConnection } from "../lib/redis";

export interface ReviewJobData {
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  installationId?: number;
}

export const reviewQueue = new Queue<ReviewJobData>("review", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

