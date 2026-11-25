/** Worker settings from the environment (set in the Fitnesstracker's docker-compose files). */
export interface WorkerConfig {
  redisUrl: string;
  mediaDir: string;
  tmpTtlMs: number;
  cleanupEveryMs: number;
  heartbeatFile: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const redisUrl = env.REDIS_URL ?? "redis://localhost:6379";
  if (!/^rediss?:\/\//.test(redisUrl)) throw new Error("REDIS_URL must start with redis:// or rediss://");
  const ttlHours = Number(env.MEDIA_TMP_TTL_HOURS ?? 24);
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) throw new Error("MEDIA_TMP_TTL_HOURS must be a positive number");
  const everyMinutes = Number(env.CLEANUP_EVERY_MINUTES ?? 60);
  if (!Number.isFinite(everyMinutes) || everyMinutes < 1) throw new Error("CLEANUP_EVERY_MINUTES must be at least 1");
  return {
    redisUrl,
    mediaDir: env.MEDIA_DIR ?? "/data/media",
    tmpTtlMs: ttlHours * 60 * 60 * 1000,
    cleanupEveryMs: everyMinutes * 60 * 1000,
    heartbeatFile: env.HEARTBEAT_FILE ?? "/tmp/worker-heartbeat",
  };
}
