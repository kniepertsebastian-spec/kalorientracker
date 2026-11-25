import type { FoodDto } from "../lib/types";
import { emptyNutrients } from "../lib/nutrients";

export const food = (over: Partial<FoodDto> = {}): FoodDto => ({
  id: "f-quark",
  source: "BLS",
  name: "Magerquark",
  brand: null,
  barcode: null,
  basis: "PER_100G",
  densityGPerMl: null,
  per100: { ...emptyNutrients(), kcal: 67, proteinG: 12, carbsG: 4, fatG: 0.2 },
  estimatedFields: [],
  units: [],
  ...over,
});

/** Olive oil per 100 ml as in the BLS: 900 kcal/100 g, density 0.91 g/ml. */
export const oliveOil = (): FoodDto =>
  food({
    id: "f-oil",
    name: "Olivenöl",
    basis: "PER_100ML",
    densityGPerMl: 0.91,
    per100: { ...emptyNutrients(), kcal: 819, proteinG: 0, carbsG: 0, fatG: 91 },
    units: [{ id: "u-el", label: "EL", baseAmount: 10 }],
  });

export const pasta = (): FoodDto =>
  food({ id: "f-pasta", name: "Proteinnudeln (roh)", per100: { ...emptyNutrients(), kcal: 350, proteinG: 25, carbsG: 50, fatG: 4 }, units: [{ id: "u-pack", label: "Packung", baseAmount: 250 }] });
