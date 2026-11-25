// Every change the UI makes: written to IndexedDB at once (the screen updates through live
// queries, online or not), queued in the outbox, then a sync is requested.
import { cacheFood, db, type OutboxOp, type OutboxRow } from "./db";
import { snapshotFromFood, snapshotFromRecipe, toSnapshot } from "./day";
import { calculateRecipe, roundTo, type IngredientInput } from "./nutrients";
import { isInFlight, requestSync } from "./sync";
import type { DeletionKind, EntrySnapshot, FoodDto, MealEntryDto, MealLogDto, MealType, RatingDto, RecipeDto, RecipeInput } from "./types";

export const newId = (): string => crypto.randomUUID();
const now = () => new Date().toISOString();

async function enqueue(op: OutboxOp, label: string): Promise<void> {
  await db.outbox.add({ ...op, label, queuedAt: now() } as OutboxRow);
}

/** Removes a queued create that never reached the server; false if it is gone or on its way. */
async function cancelQueued(kind: OutboxOp["kind"], id: string): Promise<boolean> {
  const row = await db.outbox.where("id").equals(id).and((r) => r.kind === kind).first();
  if (!row || isInFlight(row.seq)) return false;
  await db.outbox.delete(row.seq!);
  return true;
}

async function deleteRemote(target: DeletionKind, createKind: OutboxOp["kind"], id: string, label: string): Promise<void> {
  if (!(await cancelQueued(createKind, id))) await enqueue({ kind: "delete", id, target }, label);
}

// ─── Meals ──────────────────────────────────────────────────────────────────────────────────────

async function mealLogFor(date: string, mealType: MealType): Promise<MealLogDto> {
  const existing = await db.mealLogs.where("[date+mealType]").equals([date, mealType]).first();
  if (existing) return existing;
  const log: MealLogDto = { id: newId(), date, mealType, eatenAt: null, note: null, createdAt: now() };
  await db.mealLogs.put(log);
  await enqueue({ kind: "mealLog", id: log.id, payload: { id: log.id, date, mealType, eatenAt: now(), entries: [] } }, "Mahlzeit");
  return log;
}

export type EntrySource =
  | { type: "food"; food: FoodDto }
  | { type: "recipe"; recipe: RecipeDto }
  | { type: "free"; name: string; brand?: string | null; snapshot: EntrySnapshot; foodId?: string | null; recipeId?: string | null };

export interface LogInput {
  date: string;
  mealType: MealType;
  source: EntrySource;
  quantity: number;
  unitLabel: string;
}

/** Logs what was eaten with an immutable snapshot taken now (also offline, from the local copy). */
export async function logEntry(input: LogInput): Promise<MealEntryDto> {
  const { source, quantity, unitLabel } = input;
  const snapshot =
    source.type === "food" ? snapshotFromFood(source.food, quantity, unitLabel) : source.type === "recipe" ? snapshotFromRecipe(source.recipe, quantity, unitLabel) : source.snapshot;
  const name = source.type === "food" ? source.food.name : source.type === "recipe" ? source.recipe.name : source.name;
  const brand = source.type === "food" ? source.food.brand : source.type === "free" ? (source.brand ?? null) : null;
  const foodId = source.type === "food" ? source.food.id : source.type === "free" ? (source.foodId ?? null) : null;
  const recipeId = source.type === "recipe" ? source.recipe.id : source.type === "free" && !foodId ? (source.recipeId ?? null) : null;

  const { grams, estimatedFields, ...nutrients } = snapshot;
  let entry!: MealEntryDto & { date: string };
  await db.transaction("rw", [db.mealLogs, db.mealEntries, db.outbox, db.foodPrefs, db.foods], async () => {
    const log = await mealLogFor(input.date, input.mealType);
    entry = { id: newId(), mealLogId: log.id, foodId, recipeId, name, brand, quantity, unitLabel, grams, nutrients, estimatedFields, createdAt: now(), date: input.date };
    await db.mealEntries.put(entry);
    await enqueue({ kind: "mealEntry", id: entry.id, mealLogId: log.id, payload: { id: entry.id, foodId, recipeId, name, brand, quantity, unitLabel, snapshot } }, name);
    if (source.type === "food") {
      await cacheFood(source.food);
      const pref = await db.foodPrefs.get(source.food.id);
      await db.foodPrefs.put({
        foodId: source.food.id,
        lastQuantity: quantity,
        lastUnit: unitLabel,
        lastUsedAt: now(),
        useCount: (pref?.useCount ?? 0) + 1,
        favorite: pref?.favorite ?? 0,
      });
    }
  });
  requestSync();
  return entry;
}

// ─── Duplicate detection ────────────────────────────────────────────────────────────────────────
// A double tap, or the same item logged from two places within a minute or two, is almost always a
// mistake. Nothing is blocked (two portions are real too): the entry is logged and the toast
// offers to take the new one back.

export const DUPLICATE_WINDOW_MS = 2 * 60_000;

type DupFields = Pick<MealEntryDto, "id" | "name" | "foodId" | "recipeId" | "quantity" | "unitLabel" | "createdAt">;

export function isQuickDuplicate(a: DupFields, b: DupFields, windowMs = DUPLICATE_WINDOW_MS): boolean {
  if (a.id === b.id || !a.createdAt || !b.createdAt) return false;
  const sameThing = a.foodId || b.foodId ? a.foodId === b.foodId : a.recipeId || b.recipeId ? a.recipeId === b.recipeId : a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
  return sameThing && a.quantity === b.quantity && a.unitLabel === b.unitLabel && Math.abs(Date.parse(a.createdAt) - Date.parse(b.createdAt)) <= windowMs;
}

/** An entry of the same day that the new one looks like a quick repeat of, or null. */
export async function quickDuplicateOf(entry: MealEntryDto & { date: string }): Promise<MealEntryDto | null> {
  const sameDay = await db.mealEntries.where("date").equals(entry.date).toArray();
  return sameDay.find((e) => isQuickDuplicate(e, entry)) ?? null;
}

/** logEntry, plus whether the same thing was just logged a moment ago. */
export async function logEntryChecked(input: LogInput): Promise<{ entry: MealEntryDto & { date: string }; duplicate: boolean }> {
  const entry = (await logEntry(input)) as MealEntryDto & { date: string };
  return { entry, duplicate: (await quickDuplicateOf(entry)) !== null };
}

/** Logs an earlier entry again: recomputed from the food or recipe if known here, else its snapshot copied. */
export async function relogEntry(entry: MealEntryDto, date: string, mealType: MealType): Promise<MealEntryDto> {
  const food = entry.foodId ? await db.foods.get(entry.foodId) : undefined;
  if (food) {
    try {
      return await logEntry({ date, mealType, source: { type: "food", food }, quantity: entry.quantity, unitLabel: entry.unitLabel });
    } catch {
      // unit no longer known: fall through to the copy
    }
  }
  const recipe = entry.recipeId ? await db.recipes.get(entry.recipeId) : undefined;
  if (recipe) {
    try {
      return await logEntry({ date, mealType, source: { type: "recipe", recipe }, quantity: entry.quantity, unitLabel: entry.unitLabel });
    } catch {
      // fall through
    }
  }
  const snapshot: EntrySnapshot = { ...entry.nutrients, grams: entry.grams, estimatedFields: entry.estimatedFields };
  return logEntry({
    date,
    mealType,
    source: { type: "free", name: entry.name, brand: entry.brand, snapshot, foodId: entry.foodId, recipeId: entry.recipeId },
    quantity: entry.quantity,
    unitLabel: entry.unitLabel,
  });
}

/** "Wie gestern übernehmen": every entry of one day again on another, same meal slots. */
export async function copyDay(fromDate: string, toDate: string): Promise<number> {
  const entries = await db.mealEntries.where("date").equals(fromDate).sortBy("createdAt");
  const logs = new Map((await db.mealLogs.where("date").equals(fromDate).toArray()).map((l) => [l.id, l.mealType]));
  for (const e of entries) await relogEntry(e, toDate, logs.get(e.mealLogId) ?? "SNACK");
  return entries.length;
}

export async function deleteEntry(entry: MealEntryDto): Promise<void> {
  await db.transaction("rw", db.mealEntries, db.outbox, async () => {
    await db.mealEntries.delete(entry.id);
    await deleteRemote("mealEntries", "mealEntry", entry.id, entry.name);
  });
  requestSync(5_000); // leaves room for the undo toast before the delete goes out
}

/** Undo of a swipe: drops the queued delete, or (already sent) logs the same snapshot again. */
export async function undoDeleteEntry(entry: MealEntryDto & { date?: string }): Promise<void> {
  const date = entry.date ?? (await db.mealLogs.get(entry.mealLogId))?.date;
  const queued = await db.outbox.where("id").equals(entry.id).and((r) => r.kind === "delete").first();
  if (queued && !isInFlight(queued.seq) && date) {
    await db.transaction("rw", db.mealEntries, db.outbox, async () => {
      await db.outbox.delete(queued.seq!);
      await db.mealEntries.put({ ...entry, date });
    });
    return;
  }
  const log = await db.mealLogs.get(entry.mealLogId);
  if (!log) return;
  const snapshot: EntrySnapshot = { ...entry.nutrients, grams: entry.grams, estimatedFields: entry.estimatedFields };
  await logEntry({
    date: log.date,
    mealType: log.mealType,
    source: { type: "free", name: entry.name, brand: entry.brand, snapshot, foodId: entry.foodId, recipeId: entry.recipeId },
    quantity: entry.quantity,
    unitLabel: entry.unitLabel,
  });
}

export async function quickAdd(date: string, mealType: MealType, name: string, snapshot: EntrySnapshot): Promise<MealEntryDto> {
  return logEntry({ date, mealType, source: { type: "free", name, snapshot }, quantity: 1, unitLabel: "Portion" });
}

export async function toggleFavorite(food: FoodDto): Promise<void> {
  await cacheFood(food);
  const pref = await db.foodPrefs.get(food.id);
  await db.foodPrefs.put({
    foodId: food.id,
    lastQuantity: pref?.lastQuantity ?? 100,
    lastUnit: pref?.lastUnit ?? (food.basis === "PER_100ML" ? "ml" : "g"),
    lastUsedAt: pref?.lastUsedAt ?? now(),
    useCount: pref?.useCount ?? 0,
    favorite: pref?.favorite ? 0 : 1,
  });
}

// ─── Rating ─────────────────────────────────────────────────────────────────────────────────────

/** A new rating for a day replaces the old one (the server retires it too). */
export async function setRating(date: string, score: number, note: string | null): Promise<RatingDto> {
  const rating: RatingDto = { id: newId(), date, score, note: note?.trim() ? note.trim().slice(0, 280) : null, createdAt: now() };
  await db.transaction("rw", db.ratings, db.outbox, async () => {
    for (const old of await db.ratings.where("date").equals(date).toArray()) {
      await db.ratings.delete(old.id);
      await cancelQueued("rating", old.id);
    }
    await db.ratings.put(rating);
    await enqueue({ kind: "rating", id: rating.id, payload: { id: rating.id, date, score, note: rating.note } }, `Bewertung ${date}`);
  });
  requestSync();
  return rating;
}

export async function clearRating(date: string): Promise<void> {
  await db.transaction("rw", db.ratings, db.outbox, async () => {
    for (const old of await db.ratings.where("date").equals(date).toArray()) {
      await db.ratings.delete(old.id);
      await deleteRemote("ratings", "rating", old.id, `Bewertung ${date}`);
    }
  });
  requestSync();
}

// ─── Recipes ────────────────────────────────────────────────────────────────────────────────────

export interface DraftIngredient {
  food: FoodDto;
  quantity: number;
  unitLabel: string;
}

export interface RecipeDraft {
  id?: string;
  name: string;
  note?: string | null;
  servings: number | null;
  finalWeightG: number | null;
  ingredients: DraftIngredient[];
}

export function calculateDraft(draft: Pick<RecipeDraft, "ingredients" | "servings" | "finalWeightG">) {
  const inputs: IngredientInput[] = draft.ingredients.map((i) => ({
    name: i.food.name,
    quantity: i.quantity,
    unitLabel: i.unitLabel,
    food: { ...i.food, per100: { values: i.food.per100, estimated: i.food.estimatedFields } },
  }));
  return calculateRecipe(inputs, { finalWeightG: draft.finalWeightG, servings: draft.servings });
}

/** Local copy in the server's DTO shape, so the recipe is usable at once; the next pull replaces it. */
export function recipeDtoFromDraft(id: string, draft: RecipeDraft, clientUpdatedAt: string): RecipeDto {
  const calc = calculateDraft(draft);
  const snap = (n: typeof calc.totals | null) => (n ? toSnapshot(n, null) : null);
  const strip = (s: EntrySnapshot | null) => {
    if (!s) return null;
    const { grams: _g, estimatedFields: _e, ...values } = s;
    return values;
  };
  const totals = toSnapshot(calc.totals, null);
  return {
    id,
    name: draft.name.trim(),
    note: draft.note ?? null,
    servings: draft.servings,
    finalWeightG: draft.finalWeightG,
    totalRawWeightG: roundTo(calc.totalRawWeightG, 1),
    effectiveWeightG: roundTo(calc.effectiveWeightG, 1),
    weightSource: calc.weightSource,
    totalWeightEstimated: calc.totalWeightEstimated,
    totals: strip(totals)!,
    estimatedFields: totals.estimatedFields,
    per100g: strip(snap(calc.per100g)),
    perServing: strip(snap(calc.perServing)),
    servingWeightG: calc.servingWeightG === null ? null : roundTo(calc.servingWeightG, 1),
    ingredients: calc.ingredients.map((r, i) => ({
      foodId: draft.ingredients[i]!.food.id,
      name: r.name,
      quantity: r.quantity,
      unitLabel: r.unitLabel,
      rawWeightG: roundTo(r.rawWeightG, 1),
      weightEstimated: r.weightEstimated,
    })),
    clientUpdatedAt,
  };
}

export async function saveRecipe(draft: RecipeDraft): Promise<RecipeDto> {
  const id = draft.id ?? newId();
  const clientUpdatedAt = now();
  const dto = recipeDtoFromDraft(id, draft, clientUpdatedAt);
  const payload: RecipeInput = {
    id,
    name: dto.name,
    note: dto.note,
    servings: draft.servings,
    finalWeightG: draft.finalWeightG,
    ingredients: draft.ingredients.map((i) => ({ foodId: i.food.id, quantity: i.quantity, unitLabel: i.unitLabel })),
    clientUpdatedAt,
  };
  await db.transaction("rw", [db.recipes, db.outbox, db.foods], async () => {
    for (const i of draft.ingredients) await cacheFood(i.food);
    await db.recipes.put(dto);
    await cancelQueued("recipe", id); // an older unsent version of the same recipe is superseded
    await enqueue({ kind: "recipe", id, payload }, dto.name);
  });
  requestSync();
  return dto;
}

export async function deleteRecipe(recipe: RecipeDto): Promise<void> {
  await db.transaction("rw", db.recipes, db.outbox, async () => {
    await db.recipes.delete(recipe.id);
    await deleteRemote("recipes", "recipe", recipe.id, recipe.name);
  });
  requestSync();
}

/** Meal prep: the cooked dish split evenly over several days (grams of the final weight). */
export async function splitRecipeOverDays(recipe: RecipeDto, days: readonly string[], mealType: MealType): Promise<number> {
  if (days.length === 0 || !(recipe.effectiveWeightG > 0)) return 0;
  const grams = roundTo(recipe.effectiveWeightG / days.length, 1);
  for (const date of days) await logEntry({ date, mealType, source: { type: "recipe", recipe }, quantity: grams, unitLabel: "g" });
  return grams;
}
