import { describe, expect, it } from "vitest";
import { addDays, budget, dayTotals, fractionButtons, frequentEntries, localDayKey, mealTypeForHour, quickSnapshot, snapshotFromFood, snapshotFromRecipe, streak } from "./day";
import { emptyNutrients } from "./nutrients";
import type { MealEntryDto, RecipeDto } from "./types";
import { food, pasta } from "../test/fixtures";

const entry = (over: Partial<MealEntryDto> = {}): MealEntryDto => ({
  id: crypto.randomUUID(),
  mealLogId: "l1",
  foodId: "f-quark",
  recipeId: null,
  name: "Magerquark",
  brand: null,
  quantity: 250,
  unitLabel: "g",
  grams: 250,
  nutrients: { ...emptyNutrients(), kcal: 167.5, proteinG: 30, carbsG: 10, fatG: 0.5 },
  estimatedFields: [],
  createdAt: "2026-11-20T07:00:00Z",
  ...over,
});

describe("day logic", () => {
  it("takes a food snapshot like the server", () => {
    const s = snapshotFromFood(food(), 250, "g");
    expect(s).toMatchObject({ kcal: 167.5, proteinG: 30, grams: 250, saltG: null, estimatedFields: [] });
  });

  it("marks a recipe snapshot as estimated when the recipe weight is", () => {
    const recipe = { totals: { ...emptyNutrients(), kcal: 1000, proteinG: 50 }, estimatedFields: [], effectiveWeightG: 500, totalWeightEstimated: true, servings: 2 } as unknown as RecipeDto;
    expect(snapshotFromRecipe(recipe, 100, "g")).toMatchObject({ kcal: 200, grams: 100, estimatedFields: ["kcal", "proteinG"] });
    expect(snapshotFromRecipe(recipe, 1, "Portion")).toMatchObject({ kcal: 500, grams: 250 });
  });

  it("quick add keeps unknown values unknown", () => {
    const s = quickSnapshot(650, null);
    expect(s.kcal).toBe(650);
    expect(s.proteinG).toBeNull();
    expect(s.carbsG).toBeNull();
    expect(s.estimatedFields).toEqual(["kcal"]);
  });

  it("budget only uses the Fitnesstracker targets", () => {
    const consumed = dayTotals([entry(), entry()]).values;
    const b = budget({ targetCalories: 2500, targetProteinG: 180, macros: { proteinG: 180, carbsG: 250, fatG: 70, proteinExceedsTarget: false } }, consumed)!;
    expect(b.remainingKcal).toBe(2165);
    expect(b.remainingProteinG).toBe(120);
    expect(b.remainingCarbsG).toBe(230);
    expect(b.proteinReached).toBe(false);
    expect(budget({ targetCalories: null, targetProteinG: null, macros: null }, consumed)).toBeNull();
    expect(budget(null, consumed)).toBeNull();
  });

  it("an empty day counts as zero, not unknown", () => {
    expect(dayTotals([]).values).toMatchObject({ kcal: 0, proteinG: 0 });
  });

  it("an unknown value in one entry makes the total an estimate", () => {
    const t = dayTotals([entry(), entry({ nutrients: { ...emptyNutrients(), kcal: 500 } })]);
    expect(t.values.kcal).toBe(667.5);
    expect(t.estimated).toContain("proteinG");
  });

  it("meal slot by hour", () => {
    expect(mealTypeForHour(7)).toBe("BREAKFAST");
    expect(mealTypeForHour(12)).toBe("LUNCH");
    expect(mealTypeForHour(16)).toBe("SNACK");
    expect(mealTypeForHour(19)).toBe("DINNER");
    expect(mealTypeForHour(23)).toBe("SNACK");
  });

  it("day keys in the user's time zone", () => {
    expect(localDayKey(new Date("2026-11-24T23:30:00Z"), "Europe/Berlin")).toBe("2026-11-25");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });

  it("streak counts back from today, or from yesterday while today is empty", () => {
    const days = new Set(["2026-11-22", "2026-11-23", "2026-11-24"]);
    expect(streak(days, "2026-11-24")).toBe(3);
    expect(streak(days, "2026-11-25")).toBe(3);
    expect(streak(days, "2026-11-26")).toBe(0);
  });

  it("time-of-day chips: most frequent entries of the slot", () => {
    const list = [
      { ...entry(), mealType: "BREAKFAST" as const },
      { ...entry(), mealType: "BREAKFAST" as const },
      { ...entry({ foodId: "f-oats", name: "Haferflocken", quantity: 60 }), mealType: "BREAKFAST" as const },
      { ...entry({ foodId: "f-x", name: "Pizza" }), mealType: "DINNER" as const },
    ];
    const chips = frequentEntries(list, "BREAKFAST");
    expect(chips.map((c) => [c.name, c.count])).toEqual([
      ["Magerquark", 2],
      ["Haferflocken", 1],
    ]);
  });

  it("fraction buttons need a package unit", () => {
    expect(fractionButtons(food())).toEqual([]);
    expect(fractionButtons(pasta()).map((f) => f.quantity)).toEqual([0.25, 0.5, 1]);
  });
});
