/**
 * Queue names shared with the backend (it enqueues, this worker processes). Roadmap 04 adds the AI
 * jobs (photo scan, voice, recipe import via yt-dlp) to `AI_QUEUE`; until then only maintenance runs.
 */
export const MAINTENANCE_QUEUE = "kcal-maintenance";
export const AI_QUEUE = "kcal-ai";

export const JOBS = {
  cleanupTmpMedia: "cleanup-tmp-media",
} as const;
