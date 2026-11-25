/**
 * Queue names shared with the backend (it enqueues, this worker processes). `AI_QUEUE` carries the
 * recipe-import jobs (see recipe/jobs.ts); photo scan and voice run in the backend directly.
 */
export const MAINTENANCE_QUEUE = "kcal-maintenance";
export const AI_QUEUE = "kcal-ai";

export const JOBS = {
  cleanupTmpMedia: "cleanup-tmp-media",
} as const;
