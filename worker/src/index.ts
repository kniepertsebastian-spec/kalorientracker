import { writeFile } from "node:fs/promises";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { cleanupTmpMedia } from "./cleanup.js";
import { loadConfig } from "./config.js";
import { JOBS, MAINTENANCE_QUEUE } from "./queues.js";

const config = loadConfig();
const connection = { url: config.redisUrl };

function log(message: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), msg: message, ...extra }));
}

const maintenance = new Queue(MAINTENANCE_QUEUE, { connection });

// Idempotent: one scheduler entry no matter how often the worker restarts.
await maintenance.upsertJobScheduler(JOBS.cleanupTmpMedia, { every: config.cleanupEveryMs }, { name: JOBS.cleanupTmpMedia });

const worker = new Worker(
  MAINTENANCE_QUEUE,
  async (job: Job) => {
    if (job.name === JOBS.cleanupTmpMedia) {
      const result = await cleanupTmpMedia(config.mediaDir, config.tmpTtlMs);
      if (result.deleted.length || result.failed.length) log("tmp media cleanup", { deleted: result.deleted.length, failed: result.failed });
      return { deleted: result.deleted.length, kept: result.kept, failed: result.failed.length };
    }
    throw new Error(`unknown maintenance job: ${job.name}`);
  },
  { connection, concurrency: 1 },
);

worker.on("failed", (job, error) => log("job failed", { queue: MAINTENANCE_QUEUE, job: job?.name, error: error.message }));
worker.on("error", (error) => log("worker error", { error: error.message }));

// Container healthcheck: the file is refreshed only while Redis answers and the worker runs (see
// Dockerfile). A separate small connection, so a ping never waits behind a blocking BullMQ call.
const pingClient = new Redis(config.redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
pingClient.on("error", () => undefined); // reported through the failed heartbeat below

async function heartbeat() {
  try {
    if (!worker.isRunning()) throw new Error("worker not running");
    await pingClient.ping();
    await writeFile(config.heartbeatFile, new Date().toISOString());
  } catch (error) {
    log("heartbeat failed", { error: (error as Error).message });
  }
}
await heartbeat();
const heartbeatTimer = setInterval(heartbeat, 30_000);

log("worker started", { queues: [MAINTENANCE_QUEUE], mediaDir: config.mediaDir });

async function shutdown(signal: string) {
  log("shutting down", { signal });
  clearInterval(heartbeatTimer);
  await worker.close();
  await maintenance.close();
  pingClient.disconnect();
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
