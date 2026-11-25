import { execFile } from "node:child_process";

// Video metadata via yt-dlp: title, author, length, description and subtitles. Nothing is
// downloaded (--skip-download); the recipe is in the description or the spoken text.

export interface SubtitleTrack {
  ext: string;
  url: string;
}

export interface VideoInfo {
  title: string | null;
  author: string | null;
  durationSec: number | null;
  description: string | null;
  /** The best subtitle track (German first, then English, own before automatic), or null. */
  subtitle: SubtitleTrack | null;
}

const LANGS = ["de", "de-DE", "de-orig", "en", "en-US", "en-GB", "en-orig"];

function pickTrack(tracks: unknown): SubtitleTrack | null {
  if (!tracks || typeof tracks !== "object") return null;
  const byLang = tracks as Record<string, unknown>;
  const langs = [...LANGS, ...Object.keys(byLang).filter((l) => /^(de|en)\b/i.test(l))];
  for (const lang of langs) {
    const list = byLang[lang];
    if (!Array.isArray(list)) continue;
    const vtt = list.find((t) => t && typeof t === "object" && (t as SubtitleTrack).ext === "vtt" && typeof (t as SubtitleTrack).url === "string");
    if (vtt) return { ext: "vtt", url: (vtt as SubtitleTrack).url };
  }
  return null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function toVideoInfo(json: unknown): VideoInfo {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  return {
    title: str(o.title)?.slice(0, 200) ?? null,
    author: str(o.uploader) ?? str(o.channel) ?? str(o.creator),
    durationSec: typeof o.duration === "number" && Number.isFinite(o.duration) ? Math.round(o.duration) : null,
    description: str(o.description),
    subtitle: pickTrack(o.subtitles) ?? pickTrack(o.automatic_captions),
  };
}

export function ytDlpArgs(url: string): string[] {
  // "--" ends the options: a link can never be read as a yt-dlp option.
  return ["--dump-single-json", "--skip-download", "--no-playlist", "--no-warnings", "--no-progress", "--socket-timeout", "15", "--", url];
}

export function videoInfo(url: string, binary = "yt-dlp"): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    execFile(binary, ytDlpArgs(url), { timeout: 90_000, maxBuffer: 32 * 1024 * 1024, env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: "/tmp" } }, (error, stdout, stderr) => {
      if (error) {
        const line = String(stderr).split("\n").map((l) => l.trim()).filter(Boolean).pop() ?? error.message;
        return reject(new Error(line.replace(/^ERROR:\s*/, "").slice(0, 200)));
      }
      try {
        resolve(toVideoInfo(JSON.parse(stdout)));
      } catch {
        reject(new Error("yt-dlp lieferte kein lesbares Ergebnis"));
      }
    });
  });
}
