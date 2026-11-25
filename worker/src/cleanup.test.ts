import { mkdir, mkdtemp, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTmpMedia } from "./cleanup.js";

const HOUR = 60 * 60 * 1000;
let mediaDir: string;

beforeEach(async () => {
  mediaDir = await mkdtemp(path.join(tmpdir(), "worker-media-"));
});
afterEach(async () => {
  await rm(mediaDir, { recursive: true, force: true });
});

async function fileAged(relative: string, ageMs: number, now: number) {
  const file = path.join(mediaDir, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "x");
  const time = new Date(now - ageMs);
  await utimes(file, time, time);
  return file;
}

describe("cleanupTmpMedia", () => {
  it("deletes only tmp files older than the TTL", async () => {
    const now = Date.now();
    await fileAged("tmp/old.webp", 25 * HOUR, now);
    await fileAged("tmp/fresh.webp", 1 * HOUR, now);
    const result = await cleanupTmpMedia(mediaDir, 24 * HOUR, now);
    expect(result).toEqual({ deleted: ["old.webp"], kept: 1, failed: [] });
    expect(await readdir(path.join(mediaDir, "tmp"))).toEqual(["fresh.webp"]);
  });

  it("never touches other media folders, subfolders or symlinks", async () => {
    const now = Date.now();
    const kept = await fileAged("scans/label.webp", 100 * HOUR, now);
    await fileAged("tmp/nested/old.webp", 100 * HOUR, now);
    await symlink(kept, path.join(mediaDir, "tmp", "link.webp"));
    const result = await cleanupTmpMedia(mediaDir, 24 * HOUR, now);
    expect(result.deleted).toEqual([]);
    expect(result.kept).toBe(2);
    expect(await readdir(path.join(mediaDir, "scans"))).toEqual(["label.webp"]);
  });

  it("is a no-op when tmp/ does not exist yet", async () => {
    expect(await cleanupTmpMedia(mediaDir, HOUR)).toEqual({ deleted: [], kept: 0, failed: [] });
  });
});
