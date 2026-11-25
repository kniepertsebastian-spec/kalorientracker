import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("has defaults that match the compose setup", () => {
    expect(loadConfig({})).toEqual({
      redisUrl: "redis://localhost:6379",
      mediaDir: "/data/media",
      tmpTtlMs: 24 * 60 * 60 * 1000,
      cleanupEveryMs: 60 * 60 * 1000,
      heartbeatFile: "/tmp/worker-heartbeat",
      aiConcurrency: 2,
    });
  });

  it("limits the AI concurrency", () => {
    expect(loadConfig({ AI_CONCURRENCY: "4" }).aiConcurrency).toBe(4);
    expect(() => loadConfig({ AI_CONCURRENCY: "0" })).toThrow();
    expect(() => loadConfig({ AI_CONCURRENCY: "1.5" })).toThrow();
  });

  it("reads the TTL in hours and rejects nonsense", () => {
    expect(loadConfig({ MEDIA_TMP_TTL_HOURS: "2" }).tmpTtlMs).toBe(2 * 60 * 60 * 1000);
    expect(() => loadConfig({ MEDIA_TMP_TTL_HOURS: "0" })).toThrow();
    expect(() => loadConfig({ REDIS_URL: "http://redis" })).toThrow();
  });
});
