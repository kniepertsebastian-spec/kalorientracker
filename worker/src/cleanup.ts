import { lstat, readdir, unlink } from "node:fs/promises";
import path from "node:path";

export interface CleanupResult {
  deleted: string[];
  kept: number;
  failed: string[];
}

/**
 * Deletes temporary media (MEDIA_DIR/tmp: label photos, cookbook pages, downloaded recipe videos)
 * older than `maxAgeMs`. An AI job removes its own input when done; this sweep catches whatever a
 * crashed or abandoned job left behind. Only regular files directly in tmp/ are touched — no
 * recursion, no symlinks — so a misconfigured path can never reach beyond that folder.
 */
export async function cleanupTmpMedia(mediaDir: string, maxAgeMs: number, now: number = Date.now()): Promise<CleanupResult> {
  const tmpDir = path.join(mediaDir, "tmp");
  const result: CleanupResult = { deleted: [], kept: 0, failed: [] };
  let names: string[];
  try {
    names = await readdir(tmpDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return result;
    throw error;
  }
  for (const name of names) {
    const file = path.join(tmpDir, name);
    try {
      const stats = await lstat(file);
      if (!stats.isFile()) {
        result.kept++;
        continue;
      }
      if (now - stats.mtimeMs < maxAgeMs) {
        result.kept++;
        continue;
      }
      await unlink(file);
      result.deleted.push(name);
    } catch (error) {
      // Deleted in the meantime (the job cleaned up after itself) is fine.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.failed.push(name);
    }
  }
  return result;
}
