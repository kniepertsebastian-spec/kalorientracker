import Dexie, { type Table } from "dexie";
import type { FoodDto, MealEntryDto, MealEntryInput, MealLogDto, MealLogInput, RatingDto, RatingInput, RecipeDto, RecipeInput, DeletionKind } from "./types";

// The Kalorientracker's own IndexedDB ("kalorientracker", on kcal.pwa-tree.de). It never touches
// the Fitnesstracker's storage: separate origin, separate database. All ids are generated here,
// so a row written offline is complete and usable before the server has seen it.

/** A change waiting for POST /api/nutrition/sync. Applied by the server in a fixed order. */
export type OutboxOp =
  | { kind: "mealLog"; id: string; payload: MealLogInput }
  | { kind: "mealEntry"; id: string; mealLogId: string; payload: MealEntryInput }
  | { kind: "rating"; id: string; payload: RatingInput }
  | { kind: "recipe"; id: string; payload: RecipeInput }
  | { kind: "delete"; id: string; target: DeletionKind };

export type OutboxRow = OutboxOp & { seq?: number; label: string; queuedAt: string };

/** An op the server rejected (validation, deleted elsewhere …): kept so nothing disappears silently. */
export type FailedRow = OutboxOp & { seq?: number; label: string; reason: string; failedAt: string };

/** Per food: what was used last (smart defaults), how often, and whether it is a favorite. */
export interface FoodPref {
  foodId: string;
  lastQuantity: number;
  lastUnit: string;
  lastUsedAt: string;
  useCount: number;
  favorite: 0 | 1;
}

/** A cached food (own, BLS or OFF) the user has used: lets search and logging work offline. */
export type CachedFood = FoodDto & { cachedAt: string; searchName: string };

export interface MetaRow {
  key: string;
  value: unknown;
}

class KcalDb extends Dexie {
  foods!: Table<CachedFood, string>;
  foodPrefs!: Table<FoodPref, string>;
  mealLogs!: Table<MealLogDto, string>;
  mealEntries!: Table<MealEntryDto & { date: string }, string>;
  ratings!: Table<RatingDto, string>;
  recipes!: Table<RecipeDto, string>;
  outbox!: Table<OutboxRow, number>;
  failed!: Table<FailedRow, number>;
  meta!: Table<MetaRow, string>;

  constructor(name = "kalorientracker") {
    super(name);
    this.version(1).stores({
      foods: "id, searchName, cachedAt",
      foodPrefs: "foodId, lastUsedAt, favorite",
      mealLogs: "id, date, [date+mealType]",
      mealEntries: "id, mealLogId, date, foodId, recipeId",
      ratings: "id, date",
      recipes: "id, name",
      outbox: "++seq, kind, id",
      failed: "++seq, kind, id",
      meta: "key",
    });
  }
}

export const db = new KcalDb();
export type { KcalDb };

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Everything of the previous account goes when another one signs in on this device. */
export async function clearLocalData(): Promise<void> {
  await db.transaction("rw", [db.foods, db.foodPrefs, db.mealLogs, db.mealEntries, db.ratings, db.recipes, db.outbox, db.failed, db.meta], async () => {
    await Promise.all([db.foods, db.foodPrefs, db.mealLogs, db.mealEntries, db.ratings, db.recipes, db.outbox, db.failed, db.meta].map((t) => t.clear()));
  });
}

export function searchKey(name: string, brand?: string | null): string {
  return `${name} ${brand ?? ""}`.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();
}

export async function cacheFood(food: FoodDto): Promise<void> {
  await db.foods.put({ ...food, cachedAt: new Date().toISOString(), searchName: searchKey(food.name, food.brand) });
}
