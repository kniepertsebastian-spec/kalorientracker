// Pulls a recipe out of a fetched page without any AI: the schema.org Recipe that most recipe
// sites embed as JSON-LD (the author's own ingredient lines), plus the readable page text as the
// input for the backend's AI fallback when there is no JSON-LD.

export interface JsonLdRecipe {
  name: string | null;
  ingredients: string[];
  yield: string | null;
  instructions: string[];
}

export const MAX_TEXT_CHARS = 15_000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", frac12: "½", frac14: "¼", frac34: "¾", eacute: "é", egrave: "è", ndash: "–", mdash: "—", hellip: "…", deg: "°" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code] ?? match;
  });
}

const clean = (text: string) => decodeEntities(text.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

function asStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(asStrings);
  return [];
}

function instructionsOf(value: unknown): string[] {
  if (typeof value === "string") return value.split(/\n+/).map(clean).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(instructionsOf);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (o.itemListElement) return instructionsOf(o.itemListElement); // HowToSection
    if (typeof o.text === "string") return [clean(o.text)].filter(Boolean); // HowToStep
    if (typeof o.name === "string") return [clean(o.name)].filter(Boolean);
  }
  return [];
}

const isRecipe = (node: Record<string, unknown>) => asStrings(node["@type"]).some((t) => t.toLowerCase() === "recipe" || t.toLowerCase().endsWith("/recipe"));

function findRecipe(node: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || !node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipe(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  if (isRecipe(o)) return o;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item"]) {
    const found = findRecipe(o[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/** The first schema.org Recipe in the page's JSON-LD blocks, or null. */
export function extractJsonLdRecipe(html: string): JsonLdRecipe | null {
  const blocks = html.matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, raw] of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(raw!.trim().replace(/^<!--|-->$/g, ""));
    } catch {
      continue;
    }
    const recipe = findRecipe(data);
    if (!recipe) continue;
    const ingredients = asStrings(recipe.recipeIngredient ?? recipe.ingredients).map(clean).filter(Boolean);
    const yields = asStrings(recipe.recipeYield).map(clean).filter(Boolean);
    // "4" and "4 Portionen" both appear; the longer one says more.
    const yieldText = yields.sort((a, b) => b.length - a.length)[0] ?? null;
    return {
      name: typeof recipe.name === "string" ? clean(recipe.name) || null : null,
      ingredients,
      yield: yieldText,
      instructions: instructionsOf(recipe.recipeInstructions),
    };
  }
  return null;
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${property}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  const content = tag ? /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag) : null;
  const value = content ? clean(content[1] ?? content[2] ?? "") : "";
  return value || null;
}

export function pageTitle(html: string): string | null {
  const title = metaContent(html, "og:title") ?? clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  return title ? title.slice(0, 200) : null;
}

/** The readable text of the page: title, description and body without scripts, styles and navigation. */
export function pageText(html: string, maxChars = MAX_TEXT_CHARS): string {
  const description = metaContent(html, "og:description") ?? metaContent(html, "description");
  const body = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html)
    .replace(/<(script|style|noscript|svg|template|iframe|nav|footer|header|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr)\b[^>]*>/gi, "\n");
  const lines = decodeEntities(body.replace(/<[^>]*>/g, " "))
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v ]+/g, " ").trim())
    .filter(Boolean);
  return [pageTitle(html), description, ...lines].filter(Boolean).join("\n").slice(0, maxChars);
}

/** Plain text from WebVTT subtitles, without timings and repeated caption lines. */
export function vttToText(vtt: string, maxChars = MAX_TEXT_CHARS): string {
  const out: string[] = [];
  for (const raw of vtt.split(/\r?\n/)) {
    const line = clean(raw.replace(/<\d{2}:\d{2}[^>]*>/g, ""));
    if (!line || line === "WEBVTT" || /^(Kind|Language|NOTE|STYLE|REGION)\b/.test(line) || /-->/.test(line) || /^\d+$/.test(line)) continue;
    if (out[out.length - 1] !== line) out.push(line);
  }
  return out.join(" ").slice(0, maxChars);
}
