// Pure day logic: snapshots of what was eaten, the day's totals against the targets from the
// Fitnesstracker, meal slots by time of day and the logging streak. No storage, no network.
import {
  NUTRIENT_KEYS,
  emptyNutrients,
  multiplyNutrients,
  resolveAmount,
  roundNutrients,
  roundTo,
  scaleNutrients,
  sumNutrients,
  type NutrientValues,
  type Nutrients,
} from "./nutrients";
import type { EntrySnapshot, FoodDto, MealEntryDto, MealType, RecipeDto, TodayTargets } from "./types";

export function toSnapshot(n: NutrientValues, grams: number | null): EntrySnapshot {
  const r = roundNutrients(n);
  return { ...r.values, grams: grams === null ? null : roundTo(grams, 1), estimatedFields: r.estimated.filter((k) => r.values[k] !== null) };
}

/** Snapshot of an amount of a food, as the server would take it. Throws UnitConversionError. */
export function snapshotFromFood(food: FoodDto, quantity: number, unitLabel: string): EntrySnapshot {
  const { baseAmount, grams } = resolveAmount(food, quantity, unitLabel);
  return toSnapshot(scaleNutrients({ values: food.per100, estimated: food.estimatedFields }, baseAmount), grams);
}

export class RecipeAmountError extends Error {}

/** Snapshot of grams or portions of a recipe: totals spread over the weighed final weight. */
export function snapshotFromRecipe(recipe: RecipeDto, quantity: number, unitLabel: string): EntrySnapshot {
  const totals: NutrientValues = { values: recipe.totals, estimated: recipe.estimatedFields };
  const label = unitLabel.trim().toLowerCase();
  if (label === "portion" || label === "portionen") {
    if (!recipe.servings || recipe.servings <= 0) throw new RecipeAmountError("Das Rezept hat keine Portionenzahl, bitte in Gramm angeben");
    return toSnapshot(multiplyNutrients(totals, quantity / recipe.servings), (recipe.effectiveWeightG * quantity) / recipe.servings);
  }
  if (label !== "g") throw new RecipeAmountError("Rezepte lassen sich nur in g oder Portionen eintragen");
  if (!(recipe.effectiveWeightG > 0)) throw new RecipeAmountError("Das Rezept hat kein Gewicht, bitte in Portionen angeben");
  let n = multiplyNutrients(totals, quantity / recipe.effectiveWeightG);
  // Grams of a recipe whose own weight is only an estimate: every value is an estimate.
  if (recipe.totalWeightEstimated) n = { ...n, estimated: NUTRIENT_KEYS.filter((k) => n.values[k] !== null) };
  return toSnapshot(n, quantity);
}

/** Quick-Add ("Pi-mal-Daumen"): only what the user typed; all of it marked as an estimate. */
export function quickSnapshot(kcal: number, proteinG: number | null): EntrySnapshot {
  const values: Nutrients = { ...emptyNutrients(), kcal, proteinG };
  return toSnapshot({ values, estimated: proteinG === null ? ["kcal"] : ["kcal", "proteinG"] }, null);
}

export function entryValues(e: Pick<MealEntryDto, "nutrients" | "estimatedFields">): NutrientValues {
  return { values: e.nutrients, estimated: e.estimatedFields };
}

export function dayTotals(entries: readonly Pick<MealEntryDto, "nutrients" | "estimatedFields">[]): NutrientValues {
  if (entries.length === 0) return { values: { ...emptyNutrients(), kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }, estimated: [] };
  const sum = sumNutrients(entries.map(entryValues));
  return roundNutrients(sum);
}

export interface Budget {
  targetKcal: number;
  remainingKcal: number;
  remainingProteinG: number | null;
  remainingCarbsG: number | null;
  remainingFatG: number | null;
  proteinReached: boolean;
  progress: number;
}

/** Targets come from the Fitnesstracker only; nothing is recomputed or added here. */
export function budget(targets: Pick<TodayTargets, "targetCalories" | "targetProteinG" | "macros"> | null, consumed: Nutrients): Budget | null {
  if (!targets || targets.targetCalories === null) return null;
  const left = (target: number | null | undefined, eaten: number | null) => (target === null || target === undefined ? null : roundTo(target - (eaten ?? 0), 1));
  const remainingProteinG = left(targets.targetProteinG ?? targets.macros?.proteinG, consumed.proteinG);
  return {
    targetKcal: targets.targetCalories,
    remainingKcal: roundTo(targets.targetCalories - (consumed.kcal ?? 0), 0),
    remainingProteinG,
    remainingCarbsG: left(targets.macros?.carbsG, consumed.carbsG),
    remainingFatG: left(targets.macros?.fatG, consumed.fatG),
    proteinReached: remainingProteinG !== null && remainingProteinG <= 0,
    progress: targets.targetCalories > 0 ? Math.max(0, (consumed.kcal ?? 0) / targets.targetCalories) : 0,
  };
}

export function mealTypeForHour(hour: number): MealType {
  if (hour >= 5 && hour < 11) return "BREAKFAST";
  if (hour >= 11 && hour < 15) return "LUNCH";
  if (hour >= 17 && hour < 22) return "DINNER";
  return "SNACK";
}

/** YYYY-MM-DD of a moment in a time zone (the user's, from the backend profile). */
export function localDayKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }
}

export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Consecutive days with at least one entry, ending today (or yesterday, if today is still empty). */
export function streak(daysWithEntries: ReadonlySet<string>, today: string): number {
  let day = daysWithEntries.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (daysWithEntries.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export interface ChipCandidate {
  key: string;
  name: string;
  foodId: string | null;
  recipeId: string | null;
  quantity: number;
  unitLabel: string;
  count: number;
  entry: MealEntryDto;
}

/** The most frequent entries of one meal slot in the recent past: the time-of-day 1-tap chips. */
export function frequentEntries(entries: readonly (MealEntryDto & { mealType?: MealType })[], slot: MealType, limit = 3): ChipCandidate[] {
  const byKey = new Map<string, ChipCandidate>();
  for (const e of entries) {
    if (e.mealType !== slot) continue;
    const key = `${e.foodId ?? e.recipeId ?? e.name}|${e.quantity}|${e.unitLabel}`;
    const hit = byKey.get(key);
    if (hit) {
      hit.count++;
      if ((e.createdAt ?? "") > (hit.entry.createdAt ?? "")) hit.entry = e;
    } else {
      byKey.set(key, { key, name: e.name, foodId: e.foodId, recipeId: e.recipeId, quantity: e.quantity, unitLabel: e.unitLabel, count: 1, entry: e });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || (b.entry.createdAt ?? "").localeCompare(a.entry.createdAt ?? "")).slice(0, limit);
}

/** Quick amounts for a food: fractions of its package, if it has one. */
export function fractionButtons(food: Pick<FoodDto, "units">): { label: string; quantity: number; unitLabel: string }[] {
  const pack = food.units.find((u) => u.label.trim().toLowerCase() === "packung");
  if (!pack) return [];
  return [
    { label: "1/4", quantity: 0.25, unitLabel: pack.label },
    { label: "1/2", quantity: 0.5, unitLabel: pack.label },
    { label: "1 Packung", quantity: 1, unitLabel: pack.label },
  ];
}

export function formatNumber(value: number | null, decimals = 0): string {
  if (value === null || !Number.isFinite(value)) return "–";
  return value.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
