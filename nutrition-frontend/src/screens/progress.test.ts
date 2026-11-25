import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { weekBalance } from "./Progress";

describe("week balance against the Fitnesstracker target", () => {
  it("sums eaten minus target over the logged days only", () => {
    const days = [
      { count: 3, kcal: 2100 },
      { count: 0, kcal: null },
      { count: 2, kcal: 2600 },
    ];
    expect(weekBalance(days, 2300)).toBe(100);
  });

  it("has no balance without a target or without logged days", () => {
    expect(weekBalance([{ count: 2, kcal: 1800 }], null)).toBeNull();
    expect(weekBalance([{ count: 0, kcal: null }], 2300)).toBeNull();
  });
});
