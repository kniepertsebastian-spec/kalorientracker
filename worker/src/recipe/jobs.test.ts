import { UnrecoverableError } from "bullmq";
import { describe, expect, it } from "vitest";
import { processExtract, processPreview, type RecipeJobDeps } from "./jobs.js";
import { detectPlatform } from "./platform.js";
import { BlockedUrlError, FetchFailedError } from "./safeFetch.js";
import { toVideoInfo, ytDlpArgs, type VideoInfo } from "./ytdlp.js";

const recipePage = `<html><head><title>Seite</title><script type="application/ld+json">{"@type":"Recipe","name":"Skyr-Bowl","recipeIngredient":["300 g Skyr"]}</script></head><body><p>Alles mischen.</p></body></html>`;

function deps(overrides: Partial<RecipeJobDeps> = {}): RecipeJobDeps & { fetched: string[]; videos: string[] } {
  const fetched: string[] = [];
  const videos: string[] = [];
  const video: VideoInfo = { title: "Quark-Bowl", author: "koch", durationSec: 31, description: "250 g Magerquark, 1 Banane", subtitle: { ext: "vtt", url: "https://www.youtube.com/api/timedtext?x" } };
  return {
    fetched,
    videos,
    fetchPage: async (url) => {
      fetched.push(url);
      if (url.includes("timedtext")) return { url, status: 200, contentType: "text/vtt", body: "WEBVTT\n\n00:00.000 --> 00:02.000\ndazu etwas Honig", truncated: false };
      return { url, status: 200, contentType: "text/html", body: recipePage, truncated: false };
    },
    videoInfo: async (url) => {
      videos.push(url);
      return video;
    },
    ...overrides,
  };
}

describe("detectPlatform", () => {
  it.each([
    ["https://www.youtube.com/shorts/x", "youtube"],
    ["https://youtu.be/x", "youtube"],
    ["https://vm.tiktok.com/x", "tiktok"],
    ["https://www.instagram.com/reel/x", "instagram"],
    ["https://evil-youtube.com/x", "web"],
    ["https://youtube.com.evil.org/x", "web"],
    ["https://www.youtube.com:8443/x", "web"],
    ["file:///youtube.com", "web"],
  ])("%s -> %s", (url, platform) => {
    expect(detectPlatform(url)).toBe(platform);
  });
});

describe("recipe jobs", () => {
  it("preview of a web page: title from JSON-LD, no video tool", async () => {
    const d = deps();
    expect(await processPreview({ importId: "i", url: "https://www.example.org/r" }, d)).toEqual({ platform: "web", title: "Skyr-Bowl", author: null, durationSec: null });
    expect(d.videos).toEqual([]);
  });

  it("extract of a web page: JSON-LD and page text", async () => {
    const result = await processExtract({ importId: "i", url: "https://www.example.org/r" }, deps());
    expect(result.jsonLd).toMatchObject({ name: "Skyr-Bowl", ingredients: ["300 g Skyr"] });
    expect(result.text).toContain("Alles mischen.");
  });

  it("video links go to yt-dlp only, with description and subtitles", async () => {
    const d = deps();
    expect(await processPreview({ importId: "i", url: "https://www.tiktok.com/@koch/video/1" }, d)).toEqual({ platform: "tiktok", title: "Quark-Bowl", author: "koch", durationSec: 31 });
    const result = await processExtract({ importId: "i", url: "https://www.tiktok.com/@koch/video/1" }, d);
    expect(result).toMatchObject({ platform: "tiktok", jsonLd: null });
    expect(result.text).toBe("Quark-Bowl\n\n250 g Magerquark, 1 Banane\n\nGesprochener Text:\ndazu etwas Honig");
    expect(d.fetched).toEqual(["https://www.youtube.com/api/timedtext?x"]);
  });

  it("subtitles that fail do not fail the job", async () => {
    const d = deps({ fetchPage: async () => Promise.reject(new FetchFailedError("HTTP 500")) });
    expect((await processExtract({ importId: "i", url: "https://youtu.be/x" }, d)).text).toBe("Quark-Bowl\n\n250 g Magerquark, 1 Banane");
  });

  it("blocked links and 4xx are not retried, 5xx and 429 are", async () => {
    const failing = (error: Error) => deps({ fetchPage: async () => Promise.reject(error) });
    await expect(processPreview({ importId: "i", url: "https://x.org" }, failing(new BlockedUrlError("Adresse nicht erlaubt")))).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(processPreview({ importId: "i", url: "https://x.org" }, failing(new FetchFailedError("HTTP 403")))).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(processPreview({ importId: "i", url: "https://x.org" }, failing(new FetchFailedError("HTTP 503")))).rejects.not.toBeInstanceOf(UnrecoverableError);
    await expect(processPreview({ importId: "i", url: "https://x.org" }, failing(new FetchFailedError("HTTP 429")))).rejects.not.toBeInstanceOf(UnrecoverableError);
    await expect(processPreview({ url: 5 }, deps())).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

describe("yt-dlp", () => {
  it("never lets a link become an option", () => {
    const args = ytDlpArgs("--exec=rm -rf /");
    expect(args.at(-2)).toBe("--");
    expect(args.at(-1)).toBe("--exec=rm -rf /");
    expect(args).toContain("--skip-download");
  });

  it("maps the metadata and prefers German own subtitles", () => {
    const info = toVideoInfo({
      title: "Bowl",
      uploader: "koch",
      duration: 30.6,
      description: "Rezept",
      subtitles: { en: [{ ext: "vtt", url: "https://x/en" }], de: [{ ext: "json3", url: "https://x/de.json" }, { ext: "vtt", url: "https://x/de" }] },
      automatic_captions: { de: [{ ext: "vtt", url: "https://x/auto" }] },
    });
    expect(info).toEqual({ title: "Bowl", author: "koch", durationSec: 31, description: "Rezept", subtitle: { ext: "vtt", url: "https://x/de" } });
    expect(toVideoInfo({ automatic_captions: { "en-US": [{ ext: "vtt", url: "https://x/a" }] } }).subtitle).toEqual({ ext: "vtt", url: "https://x/a" });
    expect(toVideoInfo(null)).toEqual({ title: null, author: null, durationSec: null, description: null, subtitle: null });
  });
});
