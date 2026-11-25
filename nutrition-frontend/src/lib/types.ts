// Shapes of the shared backend's /api/nutrition/* answers (Roadmap 02) and request bodies.
import type { NutrientBasis, NutrientKey, Nutrients } from "./nutrients";

export type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
export const MEAL_TYPES: MealType[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
export type NutritionPhase = "CUT" | "MAINTAIN" | "BULK";

export interface FoodUnitDto {
  id: string;
  label: string;
  baseAmount: number;
  own?: boolean;
  updatedAt?: string;
}

export interface FoodDto {
  id: string;
  source: "USER" | "BLS" | "OFF";
  sourceRef?: string | null;
  own?: boolean;
  name: string;
  brand: string | null;
  barcode: string | null;
  basis: NutrientBasis;
  densityGPerMl: number | null;
  per100: Nutrients;
  estimatedFields: NutrientKey[];
  units: FoodUnitDto[];
  attribution?: string | null;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface MealLogDto {
  id: string;
  date: string;
  mealType: MealType;
  eatenAt: string | null;
  note: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MealEntryDto {
  id: string;
  mealLogId: string;
  foodId: string | null;
  recipeId: string | null;
  name: string;
  brand: string | null;
  quantity: number;
  unitLabel: string;
  grams: number | null;
  nutrients: Nutrients;
  estimatedFields: NutrientKey[];
  createdAt?: string;
  updatedAt?: string;
}

export interface RatingDto {
  id: string;
  date: string;
  score: number;
  note: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecipeIngredientDto {
  id?: string;
  foodId: string | null;
  name: string;
  quantity: number;
  unitLabel: string;
  rawWeightG: number;
  weightEstimated: boolean;
}

export interface RecipeDto {
  id: string;
  name: string;
  note: string | null;
  servings: number | null;
  finalWeightG: number | null;
  totalRawWeightG: number;
  effectiveWeightG: number;
  weightSource: "final" | "raw";
  totalWeightEstimated: boolean;
  totals: Nutrients;
  estimatedFields: NutrientKey[];
  per100g: Nutrients | null;
  perServing: Nutrients | null;
  servingWeightG: number | null;
  ingredients: RecipeIngredientDto[];
  clientUpdatedAt: string;
  updatedAt?: string;
}

export interface MacroSplit {
  proteinG: number;
  fatG: number;
  carbsG: number;
  proteinExceedsTarget: boolean;
}

export interface TodayTargets {
  date: string;
  timeZone: string;
  profileComplete: boolean;
  /** Grundumsatz and Gesamtumsatz as the Fitnesstracker calculates them (never recalculated here). */
  bmr?: number | null;
  tdee?: number | null;
  targetCalories: number | null;
  targetProteinG: number | null;
  macros: MacroSplit | null;
  nutritionPhase: NutritionPhase | null;
  trainingPhase: string | null;
  trainingPaused?: boolean | null;
}

export interface BodyTrendPoint {
  date: string;
  weightKg: number;
  bodyWaterPercent: number | null;
  bodyFatPercent: number | null;
}

/** Weight and body water from the Fitnesstracker's measurements (GET /nutrition/body-trend). */
export interface BodyTrend {
  date: string;
  days: number;
  points: BodyTrendPoint[];
  latest: BodyTrendPoint | null;
  avg7Kg: number | null;
  avgPrev7Kg: number | null;
  weeklyChangeKg: number | null;
  water: { date: string; previousDate: string; weightChangeKg: number; waterChangePercentPoints: number } | null;
}

// ─── Request bodies ─────────────────────────────────────────────────────────────────────────────

export interface EntrySnapshot extends Nutrients {
  grams: number | null;
  estimatedFields: NutrientKey[];
}

export interface MealEntryInput {
  id: string;
  foodId?: string | null;
  recipeId?: string | null;
  name?: string;
  brand?: string | null;
  quantity: number;
  unitLabel: string;
  snapshot?: EntrySnapshot;
}

export interface MealLogInput {
  id: string;
  date: string;
  mealType: MealType;
  eatenAt?: string | null;
  note?: string | null;
  entries: MealEntryInput[];
}

export interface RecipeInput {
  id: string;
  name: string;
  note?: string | null;
  servings?: number | null;
  finalWeightG?: number | null;
  ingredients: { foodId: string; quantity: number; unitLabel: string }[];
  clientUpdatedAt: string;
}

export interface RatingInput {
  id: string;
  date: string;
  score: number;
  note?: string | null;
}

export type DeletionKind = "recipes" | "mealLogs" | "mealEntries" | "ratings";

export interface SyncPull {
  foods: FoodDto[];
  foodUnits: (FoodUnitDto & { foodId: string })[];
  recipes: RecipeDto[];
  mealLogs: MealLogDto[];
  mealEntries: MealEntryDto[];
  ratings: RatingDto[];
  deleted: Record<"foods" | "foodUnits" | DeletionKind, string[]>;
  settings: { fatPercentOfRemaining: number } | null;
  serverTime: string;
}

export interface SyncOpResult {
  kind: string;
  id: string;
  status: "applied" | "stale" | "rejected";
  message?: string;
}
