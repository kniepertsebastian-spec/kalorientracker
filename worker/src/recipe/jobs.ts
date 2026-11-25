import { UnrecoverableError } from "bullmq";
import { extractJsonLdRecipe, MAX_TEXT_CHARS, pageText, pageTitle, vttToText, type JsonLdRecipe } from "./extract.js";
import { detectPlatform } from "./platform.js";
import { BlockedUrlError, FetchFailedError, fetchPage, type FetchedPage } from "./safeFetch.js";
import { videoInfo, type VideoInfo } from "./ytdlp.js";

// The recipe-import jobs on the "kcal-ai" queue (contract: backend
// src/modules/nutritionCapture/importJobs.ts). The worker only reads public pages and video
// metadata; the AI step and the database stay with the backend, which reads the return value.
//   recipe-preview: platform, title, author, length (free, no AI)
//   recipe-extract: JSON-LD recipe if there is one, plus the text (page, description, subtitles)

export const RECIPE_JOBS = { preview: "recipe-preview", extract: "recipe-extract" } as const;

export interface RecipeJobData {
  importId: string;
  url: string;
}

export interface PreviewResult {
  platform: string;
  title: string | null;
  author: string | null;
  durationSec: number | null;
}

export interface ExtractResult {
  platform: string;
  title: string | null;
  jsonLd: JsonLdRecipe | null;
  text: string;
}

export interface RecipeJobDeps {
  fetchPage: (url: string) => Promise<FetchedPage>;
  videoInfo: (url: string) => Promise<VideoInfo>;
}

export const defaultDeps: RecipeJobDeps = { fetchPage: (url) => fetchPage(url), videoInfo: (url) => videoInfo(url) };

function checkData(data: unknown): RecipeJobData {
  const d = data as Partial<RecipeJobData> | null;
  if (!d || typeof d.url !== "string" || typeof d.importId !== "string") throw new UnrecoverableError("Ungültiger Auftrag");
  return { importId: d.importId, url: d.url };
}

// A blocked address or a page that answers 4xx won't get better on a retry.
async function permanent<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof BlockedUrlError) throw new UnrecoverableError(error.message);
    if (error instanceof FetchFailedError && /^HTTP 4\d\d$/.test(error.message) && error.message !== "HTTP 429") throw new UnrecoverableError(error.message);
    throw error;
  }
}

export async function processPreview(data: unknown, deps: RecipeJobDeps = defaultDeps): Promise<PreviewResult> {
  const { url } = checkData(data);
  const platform = detectPlatform(url);
  return permanent(async () => {
    if (platform !== "web") {
      const info = await deps.videoInfo(url);
      return { platform, title: info.title, author: info.author, durationSec: info.durationSec };
    }
    const page = await deps.fetchPage(url);
    return { platform, title: extractJsonLdRecipe(page.body)?.name ?? pageTitle(page.body), author: null, durationSec: null };
  });
}

export async function processExtract(data: unknown, deps: RecipeJobDeps = defaultDeps): Promise<ExtractResult> {
  const { url } = checkData(data);
  const platform = detectPlatform(url);
  return permanent(async () => {
    if (platform !== "web") {
      const info = await deps.videoInfo(url);
      let subtitles = "";
      if (info.subtitle) {
        // Subtitles are best effort: the description alone often holds the recipe.
        subtitles = await deps.fetchPage(info.subtitle.url).then((p) => vttToText(p.body), () => "");
      }
      const text = [info.title, info.description, subtitles ? `Gesprochener Text:\n${subtitles}` : null].filter(Boolean).join("\n\n").slice(0, MAX_TEXT_CHARS);
      return { platform, title: info.title, jsonLd: null, text };
    }
    const page = await deps.fetchPage(url);
    const jsonLd = extractJsonLdRecipe(page.body);
    return { platform, title: jsonLd?.name ?? pageTitle(page.body), jsonLd, text: pageText(page.body) };
  });
}
