// Capture (Roadmap 04): Scan & Learn, voice, recipe import and weekly drops. Shapes of the backend's
// answers, the calls themselves and the small pure helpers the screens share. Every AI value
// carries a status; a value the AI could not read stays null ("unknown") and is never filled here.
import { apiFetch, apiJson } from "./api";
import { newId } from "./actions";
import { NUTRIENT_KEYS, type NutrientBasis, type NutrientKey, type Nutrients } from "./nutrients";
import type { FoodDto } from "./types";

export type CaptureStatus = "verified" | "estimated" | "unknown";

// ─── Scan & Learn ───────────────────────────────────────────────────────────────────────────────

export interface PlausibilityIssue {
  code: string;
  message: string;
  fields: NutrientKey[];
}

export interface PlausibilityResult {
  energyChecked: boolean;
  statedKcal: number | null;
  expectedKcal: number | null;
  deviationKcal: number | null;
  deviationPercent: number | null;
  ok: boolean;
  issues: PlausibilityIssue[];
  suspiciousFields: NutrientKey[];
}

export interface SuggestedUnit {
  label: string;
  baseAmount: number;
  status: CaptureStatus;
}

export interface LabelScanDraft {
  name: string | null;
  nameStatus: CaptureStatus;
  brand: string | null;
  barcode: string | null;
  basis: NutrientBasis;
  basisStatus: CaptureStatus;
  per100: Nutrients;
  status: Record<NutrientKey, CaptureStatus>;
  estimatedFields: NutrientKey[];
  suggestedUnits: SuggestedUnit[];
  plausibility: PlausibilityResult;
  notes: string[];
}

// Client copy of the backend's plausibility check (nutritionCapture/plausibility.ts), so a value
// the user corrects is checked again at once. It never changes a value, it only marks fields.
export const KCAL_TOLERANCE_ABS = 15;
export const KCAL_TOLERANCE_REL = 0.12;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function expectedKcal(n: Pick<Nutrients, "proteinG" | "carbsG" | "fatG" | "fiberG">): number | null {
  if (n.proteinG === null || n.carbsG === null || n.fatG === null) return null;
  return 4 * n.proteinG + 4 * n.carbsG + 9 * n.fatG + 2 * (n.fiberG ?? 0);
}

export function checkPlausibility(n: Nutrients, basis: NutrientBasis = "PER_100G"): PlausibilityResult {
  const issues: PlausibilityIssue[] = [];
  const expected = expectedKcal(n);
  const stated = n.kcal;
  let deviationKcal: number | null = null;
  let deviationPercent: number | null = null;
  if (expected !== null && stated !== null) {
    deviationKcal = round1(stated - expected);
    deviationPercent = stated > 0 ? round1((Math.abs(stated - expected) / stated) * 100) : null;
    if (Math.abs(stated - expected) > Math.max(KCAL_TOLERANCE_ABS, KCAL_TOLERANCE_REL * stated)) {
      issues.push({ code: "kcal_mismatch", message: `Die Makros ergeben ${Math.round(expected)} kcal, angegeben sind ${Math.round(stated)} kcal.`, fields: ["kcal", "proteinG", "carbsG", "fatG"] });
    }
  }
  if (n.sugarG !== null && n.carbsG !== null && n.sugarG > n.carbsG + 0.5) {
    issues.push({ code: "sugar_above_carbs", message: "Mehr Zucker als Kohlenhydrate ist nicht möglich.", fields: ["sugarG", "carbsG"] });
  }
  if (n.saturatedFatG !== null && n.fatG !== null && n.saturatedFatG > n.fatG + 0.5) {
    issues.push({ code: "saturated_above_fat", message: "Mehr gesättigte Fettsäuren als Fett ist nicht möglich.", fields: ["saturatedFatG", "fatG"] });
  }
  if (basis === "PER_100G") {
    const mass = (n.proteinG ?? 0) + (n.carbsG ?? 0) + (n.fatG ?? 0) + (n.fiberG ?? 0) + (n.saltG ?? 0);
    if (mass > 101) {
      const fields = (["proteinG", "carbsG", "fatG", "fiberG", "saltG"] as const).filter((k) => n[k] !== null);
      issues.push({ code: "mass_above_100", message: `Die Nährstoffe wiegen zusammen ${round1(mass)} g pro 100 g.`, fields: [...fields] });
    }
  }
  if (stated !== null && stated > 900) issues.push({ code: "kcal_above_max", message: "Mehr als 900 kcal pro 100 g gibt es nicht.", fields: ["kcal"] });
  const suspicious = new Set<NutrientKey>(issues.flatMap((i) => i.fields));
  return {
    energyChecked: expected !== null && stated !== null,
    statedKcal: stated,
    expectedKcal: expected === null ? null : round1(expected),
    deviationKcal,
    deviationPercent,
    ok: issues.length === 0,
    issues,
    suspiciousFields: NUTRIENT_KEYS.filter((k) => suspicious.has(k)),
  };
}

/** A multipart upload through the authenticated client (no JSON Content-Type: the browser sets the boundary). */
async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await apiFetch(path, { method: "POST", body: form });
  return (await res.json()) as T;
}

export function scanLabel(input: { label: Blob; front?: Blob | null; productName?: string; barcode?: string | null }): Promise<LabelScanDraft> {
  const form = new FormData();
  form.append("label", input.label, fileName(input.label, "label"));
  if (input.front) form.append("front", input.front, fileName(input.front, "front"));
  if (input.productName?.trim()) form.append("productName", input.productName.trim().slice(0, 200));
  if (input.barcode) form.append("barcode", input.barcode);
  return upload("/nutrition/scan/label", form);
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
function fileName(blob: Blob, base: string): string {
  if (blob instanceof File && blob.name) return blob.name;
  return `${base}.${EXT[blob.type.split(";")[0]!] ?? "bin"}`;
}

/** What the user saves from a scan: the edited values; a status "estimated" is kept as such. */
export interface LearnedFoodInput {
  name: string;
  brand: string | null;
  barcode: string | null;
  basis: NutrientBasis;
  per100: Nutrients;
  estimatedFields: NutrientKey[];
  units: { label: string; baseAmount: number }[];
}

/** Layer 1: the product is saved as the user's own food, with its barcode, so the next scan finds it. */
export async function saveLearnedFood(input: LearnedFoodInput): Promise<FoodDto> {
  const id = newId();
  return apiJson<FoodDto>(`/nutrition/foods/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: input.name.trim().slice(0, 200),
      brand: input.brand?.trim() || null,
      barcode: input.barcode,
      basis: input.basis,
      ...input.per100,
      estimatedFields: input.estimatedFields,
      units: input.units.map((u) => ({ id: newId(), label: u.label.trim().slice(0, 40), baseAmount: u.baseAmount })),
      clientUpdatedAt: new Date().toISOString(),
    }),
  });
}

// ─── Food candidates (voice, recipe import) ─────────────────────────────────────────────────────

export interface FoodCandidate {
  id: string;
  name: string;
  brand: string | null;
  source: FoodDto["source"];
  own: boolean;
  basis: NutrientBasis;
  densityGPerMl: number | null;
  per100: Nutrients;
  estimatedFields: NutrientKey[];
  units: { label: string; baseAmount: number }[];
}

/** A candidate as a food for logging and recipes (unit ids are local only: units go by label). */
export function candidateToFood(c: FoodCandidate): FoodDto {
  return {
    id: c.id,
    source: c.source,
    own: c.own,
    name: c.name,
    brand: c.brand,
    barcode: null,
    basis: c.basis,
    densityGPerMl: c.densityGPerMl,
    per100: c.per100,
    estimatedFields: c.estimatedFields,
    units: c.units.map((u) => ({ id: `${c.id}:${u.label}`, label: u.label, baseAmount: u.baseAmount })),
  };
}

/** The unit to start with: the spoken or written one if the food knows it, else g/ml (amount then needs a look). */
export function pickUnit(units: readonly string[], wanted: string | null): { unit: string; matched: boolean } {
  if (wanted) {
    const w = wanted.trim().toLowerCase();
    const hit = units.find((u) => u.toLowerCase() === w);
    if (hit) return { unit: hit, matched: true };
  }
  return { unit: units[0] ?? "g", matched: false };
}

// ─── Voice ──────────────────────────────────────────────────────────────────────────────────────

export interface VoiceItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  quantityStatus: CaptureStatus;
  candidates: FoodCandidate[];
}

export interface VoicePreview {
  transcript: string;
  items: VoiceItem[];
}

export function voiceFromAudio(audio: Blob): Promise<VoicePreview> {
  const form = new FormData();
  form.append("audio", audio, fileName(audio, "aufnahme"));
  return upload("/nutrition/voice", form);
}

export function voiceFromText(text: string): Promise<VoicePreview> {
  return apiJson("/nutrition/voice", { method: "POST", body: JSON.stringify({ text }) });
}

/** A recorder format both the browser and the backend take (Safari records mp4, Chrome webm). */
export function recorderMimeType(isSupported: (t: string) => boolean): string | undefined {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => isSupported(t));
}

// ─── Recipe import ──────────────────────────────────────────────────────────────────────────────

export type ImportStatus = "PREVIEW_PENDING" | "PREVIEW_READY" | "EXTRACT_PENDING" | "EXTRACTING" | "READY" | "FAILED";

export interface ImportIngredient {
  name: string;
  raw: string | null;
  quantity: number | null;
  unit: string | null;
  status: CaptureStatus;
  note: string | null;
  candidates: FoodCandidate[];
}

export interface ImportDraft {
  method: "json-ld" | "ai";
  title: string | null;
  servings: { value: number | null; status: CaptureStatus };
  ingredients: ImportIngredient[];
  steps: string[];
  openQuestions: string[];
}

export interface RecipeImportDto {
  id: string;
  source: "URL" | "TEXT" | "PHOTO" | "VIDEO";
  status: ImportStatus;
  url: string | null;
  platform: string | null;
  title: string | null;
  draft: ImportDraft | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export const isPending = (s: ImportStatus) => s === "PREVIEW_PENDING" || s === "EXTRACT_PENDING" || s === "EXTRACTING";

export const importApi = {
  list: () => apiJson<{ items: RecipeImportDto[] }>("/nutrition/recipe-imports"),
  get: (id: string) => apiJson<RecipeImportDto>(`/nutrition/recipe-imports/${id}`),
  fromUrl: (url: string) => apiJson<RecipeImportDto>("/nutrition/recipe-imports/url", { method: "POST", body: JSON.stringify({ url }) }),
  fromText: (text: string, title?: string) => apiJson<RecipeImportDto>("/nutrition/recipe-imports/text", { method: "POST", body: JSON.stringify({ text, ...(title?.trim() ? { title: title.trim() } : {}) }) }),
  confirm: (id: string) => apiJson<RecipeImportDto>(`/nutrition/recipe-imports/${id}/confirm`, { method: "POST" }),
  remove: (id: string) => apiJson<void>(`/nutrition/recipe-imports/${id}`, { method: "DELETE" }),
  fromPhoto: (photo: Blob, title?: string) => {
    const form = new FormData();
    form.append("photo", photo, fileName(photo, "rezept"));
    if (title?.trim()) form.append("title", title.trim().slice(0, 200));
    return upload<RecipeImportDto>("/nutrition/recipe-imports/photo", form);
  },
  fromVideo: (video: Blob, title?: string) => {
    const form = new FormData();
    form.append("video", video, fileName(video, "video"));
    if (title?.trim()) form.append("title", title.trim().slice(0, 200));
    return upload<RecipeImportDto>("/nutrition/recipe-imports/video", form);
  },
};

export const VIDEO_MAX_BYTES = 18 * 1024 * 1024;

/** The first http(s) link in shared text ("Schau mal: https://… #rezept"), trailing punctuation dropped. */
export function extractUrl(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    const m = t ? /https?:\/\/[^\s<>"']+/i.exec(t) : null;
    if (m) return m[0].replace(/[),.;:!?»”"']+$/, "");
  }
  return null;
}

const SHARE_KEY = "kcal.pendingShare";
export interface PendingShare {
  url: string | null;
  text: string | null;
  title: string | null;
}

/** Web Share Target: the share arrives as GET /share-target?title&text&url; kept until the import screen takes it. */
export function captureShare(location: Pick<Location, "pathname" | "search">, storage: Pick<Storage, "setItem"> = sessionStorage): boolean {
  if (location.pathname !== "/share-target") return false;
  const p = new URLSearchParams(location.search);
  const text = p.get("text")?.slice(0, 30000) ?? null;
  const title = p.get("title")?.slice(0, 200) ?? null;
  const share: PendingShare = { url: extractUrl(p.get("url"), text, title), text, title };
  storage.setItem(SHARE_KEY, JSON.stringify(share));
  return true;
}

export function takeShare(storage: Pick<Storage, "getItem" | "removeItem"> = sessionStorage): PendingShare | null {
  const raw = storage.getItem(SHARE_KEY);
  if (!raw) return null;
  storage.removeItem(SHARE_KEY);
  try {
    return JSON.parse(raw) as PendingShare;
  } catch {
    return null;
  }
}

// ─── Weekly drops ───────────────────────────────────────────────────────────────────────────────

export interface WeeklyDrop {
  id: string;
  weekStart: string;
  position: number;
  catalogKey: string;
  name: string;
  servings: number;
  ingredients: { foodId: string; bls: string; name: string; grams: number }[];
  steps: string[];
  tags: string[];
  kcal: number | null;
  proteinG: number | null;
  perServing: Nutrients;
  estimatedFields: NutrientKey[];
}

export interface WeeklyDropsAnswer {
  weekStart: string;
  nextDropAt: string;
  drops: WeeklyDrop[];
  hiddenCount: number;
}

export function weeklyDrops(maxKcal?: number | null): Promise<WeeklyDropsAnswer> {
  const q = maxKcal && maxKcal > 0 ? `?maxKcal=${Math.floor(maxKcal)}` : "";
  return apiJson(`/nutrition/weekly-drops${q}`);
}

// ─── Feedback ───────────────────────────────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

/** Short beep and a buzz for a recognized barcode (both best effort: muted phones stay quiet). */
export function scanFeedback(ok = true): void {
  try {
    navigator.vibrate?.(ok ? 60 : [40, 60, 40]);
  } catch {
    // no vibration
  }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = ok ? 1320 : 440;
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.13);
  } catch {
    // no audio
  }
}

/** One code is reported once per window: the camera sees the same pack many times a second. */
export function createDeduper(windowMs = 2500, now: () => number = Date.now) {
  const seen = new Map<string, number>();
  return (code: string): boolean => {
    const t = now();
    const last = seen.get(code);
    seen.set(code, t);
    return last === undefined || t - last > windowMs;
  };
}


/** Steps and source as the recipe's note (max 2000 characters, the API's limit). */
export function importNote(dto: Pick<RecipeImportDto, "url" | "draft">): string | null {
  const parts: string[] = [];
  if (dto.url) parts.push(`Quelle: ${dto.url}`);
  const steps = dto.draft?.steps ?? [];
  if (steps.length) parts.push(steps.map((s, i) => `${i + 1}. ${s}`).join("\n"));
  const note = parts.join("\n\n");
  if (!note) return null;
  return note.length > 2000 ? `${note.slice(0, 1999)}…` : note;
}
