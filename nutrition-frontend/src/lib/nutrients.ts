// Client copy of the backend's nutrient arithmetic (Fitnesstracker backend
// src/modules/nutrition/nutrients.ts), so an entry logged offline gets the same snapshot the server
// would compute. Same rules: unknown is null, never 0; a sum with unknown parts is a lower bound and
// marked estimated; nothing is invented to fill a gap.

export const NUTRIENT_KEYS = ["kcal", "proteinG", "carbsG", "fatG", "fiberG", "sugarG", "saturatedFatG", "saltG"] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type Nutrients = Record<NutrientKey, number | null>;

export interface NutrientValues {
  values: Nutrients;
  estimated: NutrientKey[];
}

export type NutrientBasis = "PER_100G" | "PER_100ML";

export interface FoodUnitLike {
  label: string;
  baseAmount: number;
}

export interface FoodForAmount {
  basis: NutrientBasis;
  densityGPerMl: number | null;
  units: FoodUnitLike[];
}

export class UnitConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitConversionError";
  }
}

export function emptyNutrients(): Nutrients {
  return { kcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null, sugarG: null, saturatedFatG: null, saltG: null };
}

export function onlyNutrientKeys(keys: readonly string[]): NutrientKey[] {
  return NUTRIENT_KEYS.filter((key) => keys.includes(key));
}

const normalizeLabel = (label: string) => label.trim().toLowerCase();

/** "3 EL", "10 ml" or "0.5 Packung" -> amount in the food's basis unit and, where known, grams. */
export function resolveAmount(food: FoodForAmount, quantity: number, unitLabel: string): { baseAmount: number; grams: number | null } {
  if (!Number.isFinite(quantity) || quantity < 0) throw new UnitConversionError("Menge muss eine Zahl >= 0 sein");
  const label = normalizeLabel(unitLabel);
  const density = food.densityGPerMl && food.densityGPerMl > 0 ? food.densityGPerMl : null;
  const toGrams = (baseAmount: number) => (food.basis === "PER_100G" ? baseAmount : density ? baseAmount * density : null);

  const unit = food.units.find((u) => normalizeLabel(u.label) === label);
  if (unit) {
    const baseAmount = quantity * unit.baseAmount;
    return { baseAmount, grams: toGrams(baseAmount) };
  }
  if (label === "g") {
    if (food.basis === "PER_100G") return { baseAmount: quantity, grams: quantity };
    if (!density) throw new UnitConversionError("Gramm lassen sich ohne Dichte nicht in ml umrechnen");
    return { baseAmount: quantity / density, grams: quantity };
  }
  if (label === "ml") {
    if (food.basis === "PER_100ML") return { baseAmount: quantity, grams: toGrams(quantity) };
    if (!density) throw new UnitConversionError("ml lassen sich ohne Dichte nicht in Gramm umrechnen");
    return { baseAmount: quantity * density, grams: quantity * density };
  }
  throw new UnitConversionError(`Unbekannte Einheit „${unitLabel}“ für dieses Lebensmittel`);
}

export function scaleNutrients(per100: NutrientValues, baseAmount: number): NutrientValues {
  const values = emptyNutrients();
  for (const key of NUTRIENT_KEYS) {
    const v = per100.values[key];
    values[key] = v === null ? null : (v * baseAmount) / 100;
  }
  return { values, estimated: onlyNutrientKeys(per100.estimated) };
}

export function sumNutrients(parts: readonly NutrientValues[]): NutrientValues {
  const values = emptyNutrients();
  const estimated = new Set<NutrientKey>();
  for (const key of NUTRIENT_KEYS) {
    let sum: number | null = null;
    let missing = false;
    for (const part of parts) {
      const v = part.values[key];
      if (v === null) {
        missing = true;
        continue;
      }
      sum = (sum ?? 0) + v;
      if (part.estimated.includes(key)) estimated.add(key);
    }
    values[key] = sum;
    if (missing && sum !== null) estimated.add(key);
  }
  return { values, estimated: NUTRIENT_KEYS.filter((k) => estimated.has(k)) };
}

export function multiplyNutrients(n: NutrientValues, factor: number): NutrientValues {
  const values = emptyNutrients();
  for (const key of NUTRIENT_KEYS) {
    const v = n.values[key];
    values[key] = v === null ? null : v * factor;
  }
  return { values, estimated: [...n.estimated] };
}

const DECIMALS: Record<NutrientKey, number> = { kcal: 1, proteinG: 2, carbsG: 2, fatG: 2, fiberG: 2, sugarG: 2, saturatedFatG: 2, saltG: 3 };

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function roundNutrients(n: NutrientValues): NutrientValues {
  const values = emptyNutrients();
  for (const key of NUTRIENT_KEYS) {
    const v = n.values[key];
    values[key] = v === null ? null : roundTo(v, DECIMALS[key]);
  }
  return { values, estimated: [...n.estimated] };
}

// ─── Recipes: raw ingredients first, then spread over the weighed final weight ──────────────────

export interface IngredientInput {
  name: string;
  quantity: number;
  unitLabel: string;
  food: FoodForAmount & { per100: NutrientValues };
}

export interface IngredientResult {
  name: string;
  quantity: number;
  unitLabel: string;
  baseAmount: number;
  rawWeightG: number;
  weightEstimated: boolean;
  nutrients: NutrientValues;
}

export function calculateIngredient(input: IngredientInput): IngredientResult {
  const { baseAmount, grams } = resolveAmount(input.food, input.quantity, input.unitLabel);
  return {
    name: input.name,
    quantity: input.quantity,
    unitLabel: input.unitLabel,
    baseAmount,
    rawWeightG: grams ?? baseAmount,
    weightEstimated: grams === null,
    nutrients: scaleNutrients(input.food.per100, baseAmount),
  };
}

export interface RecipeResult {
  ingredients: IngredientResult[];
  totals: NutrientValues;
  totalRawWeightG: number;
  effectiveWeightG: number;
  weightSource: "final" | "raw";
  totalWeightEstimated: boolean;
  cookingChangePercent: number | null;
  per100g: NutrientValues | null;
  perServing: NutrientValues | null;
  servingWeightG: number | null;
}

export function calculateRecipe(ingredients: readonly IngredientInput[], options: { finalWeightG?: number | null; servings?: number | null } = {}): RecipeResult {
  const results = ingredients.map(calculateIngredient);
  const totals = sumNutrients(results.map((r) => r.nutrients));
  const totalRawWeightG = results.reduce((sum, r) => sum + r.rawWeightG, 0);
  const finalWeightG = options.finalWeightG ?? null;
  const useFinal = finalWeightG !== null && Number.isFinite(finalWeightG) && finalWeightG > 0;
  const effectiveWeightG = useFinal ? finalWeightG : totalRawWeightG;
  const servings = options.servings && options.servings > 0 ? options.servings : null;
  return {
    ingredients: results,
    totals,
    totalRawWeightG,
    effectiveWeightG,
    weightSource: useFinal ? "final" : "raw",
    totalWeightEstimated: results.some((r) => r.weightEstimated),
    cookingChangePercent: useFinal && totalRawWeightG > 0 ? ((finalWeightG - totalRawWeightG) / totalRawWeightG) * 100 : null,
    per100g: effectiveWeightG > 0 ? multiplyNutrients(totals, 100 / effectiveWeightG) : null,
    perServing: servings ? multiplyNutrients(totals, 1 / servings) : null,
    servingWeightG: servings && effectiveWeightG > 0 ? effectiveWeightG / servings : null,
  };
}
