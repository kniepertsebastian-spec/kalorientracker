import { describe, expect, it } from "vitest";
import { calculateDraft } from "./actions";
import { resolveAmount, UnitConversionError } from "./nutrients";
import { food, oliveOil, pasta } from "../test/fixtures";

describe("nutrients (client port of the backend math)", () => {
  it("converts 10 ml olive oil to 9.1 g through the density", () => {
    const r = resolveAmount(oliveOil(), 10, "ml");
    expect(r.baseAmount).toBe(10);
    expect(r.grams).toBeCloseTo(9.1, 5);
    expect(resolveAmount(oliveOil(), 1, "EL").grams).toBeCloseTo(9.1, 5);
  });

  it("refuses ml for a per-100-g food without density", () => {
    expect(() => resolveAmount(food(), 10, "ml")).toThrow(UnitConversionError);
  });

  it("protein pasta: totals from raw ingredients, spread over the weighed final weight", () => {
    // 250 g raw pasta + 10 ml oil = 259.1 g raw; cooked and drained 600 g (water uptake).
    const calc = calculateDraft({
      ingredients: [
        { food: pasta(), quantity: 1, unitLabel: "Packung" },
        { food: oliveOil(), quantity: 10, unitLabel: "ml" },
      ],
      finalWeightG: 600,
      servings: 3,
    });
    expect(calc.totals.values.kcal).toBeCloseTo(875 + 81.9, 5);
    expect(calc.totalRawWeightG).toBeCloseTo(259.1, 5);
    expect(calc.weightSource).toBe("final");
    expect(calc.effectiveWeightG).toBe(600);
    expect(calc.per100g!.values.kcal).toBeCloseTo((956.9 / 600) * 100, 5);
    expect(calc.perServing!.values.proteinG).toBeCloseTo(62.5 / 3, 5);
    expect(calc.servingWeightG).toBe(200);
  });

  it("falls back to the raw weight without a final weight", () => {
    const calc = calculateDraft({ ingredients: [{ food: pasta(), quantity: 100, unitLabel: "g" }], finalWeightG: null, servings: null });
    expect(calc.weightSource).toBe("raw");
    expect(calc.effectiveWeightG).toBe(100);
    expect(calc.perServing).toBeNull();
  });
});
