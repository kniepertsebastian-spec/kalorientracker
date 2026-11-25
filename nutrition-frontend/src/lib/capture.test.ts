import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { candidateToFood, captureShare, checkPlausibility, createDeduper, expectedKcal, saveLearnedFood, extractUrl, importNote, isPending, pickUnit, recorderMimeType, takeShare, type FoodCandidate } from "./capture";
import { snapshotFromFood } from "./day";
import { emptyNutrients, type Nutrients } from "./nutrients";

const n = (over: Partial<Nutrients>): Nutrients => ({ ...emptyNutrients(), ...over });

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe("plausibility (4P + 4KH + 9F + 2 Ballaststoffe)", () => {
  it("computes the expected energy only when all three macros are known", () => {
    expect(expectedKcal(n({ proteinG: 10, carbsG: 20, fatG: 5 }))).toBe(165);
    expect(expectedKcal(n({ proteinG: 10, carbsG: 20, fatG: 5, fiberG: 3 }))).toBe(171);
    expect(expectedKcal(n({ proteinG: 10, carbsG: null, fatG: 5 }))).toBeNull();
  });

  it("accepts a real label (Magerquark: 67 kcal, 12 P, 4 KH, 0,2 F)", () => {
    const r = checkPlausibility(n({ kcal: 67, proteinG: 12, carbsG: 4, fatG: 0.2 }));
    expect(r.ok).toBe(true);
    expect(r.energyChecked).toBe(true);
    expect(r.suspiciousFields).toEqual([]);
  });

  it("flags kcal and macros when they disagree beyond max(15 kcal, 12 %)", () => {
    // 4*20 + 4*50 + 9*10 = 370, stated 250: off by 120
    const r = checkPlausibility(n({ kcal: 250, proteinG: 20, carbsG: 50, fatG: 10 }));
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("kcal_mismatch");
    expect(r.suspiciousFields).toEqual(expect.arrayContaining(["kcal", "proteinG", "carbsG", "fatG"]));
    expect(r.deviationKcal).toBe(-120);
  });

  it("tolerates small rounding differences on low-energy foods (15 kcal floor)", () => {
    // expected 4*1 + 4*3 + 9*0.1 = 16.9, stated 28: within 15 kcal
    expect(checkPlausibility(n({ kcal: 28, proteinG: 1, carbsG: 3, fatG: 0.1 })).ok).toBe(true);
  });

  it("does not check energy when a macro is unknown, and invents nothing", () => {
    const r = checkPlausibility(n({ kcal: 300, proteinG: 10, carbsG: null, fatG: 5 }));
    expect(r.energyChecked).toBe(false);
    expect(r.expectedKcal).toBeNull();
    expect(r.ok).toBe(true);
  });

  it("flags sugar above carbs, saturated above fat, mass above 100 g and kcal above 900", () => {
    const codes = (x: Partial<Nutrients>) => checkPlausibility(n(x)).issues.map((i) => i.code);
    expect(codes({ carbsG: 10, sugarG: 12 })).toContain("sugar_above_carbs");
    expect(codes({ fatG: 5, saturatedFatG: 7 })).toContain("saturated_above_fat");
    expect(codes({ proteinG: 40, carbsG: 50, fatG: 20 })).toContain("mass_above_100");
    expect(codes({ kcal: 950 })).toContain("kcal_above_max");
  });

  it("skips the 100 g mass check for drinks (per 100 ml)", () => {
    expect(checkPlausibility(n({ proteinG: 40, carbsG: 50, fatG: 20 }), "PER_100ML").issues.map((i) => i.code)).not.toContain("mass_above_100");
  });
});

describe("candidates", () => {
  const cand: FoodCandidate = {
    id: "f-skyr",
    name: "Skyr natur",
    brand: null,
    source: "BLS",
    own: false,
    basis: "PER_100G",
    densityGPerMl: null,
    per100: n({ kcal: 63, proteinG: 11, carbsG: 4, fatG: 0.2 }),
    estimatedFields: [],
    units: [{ label: "Becher", baseAmount: 450 }],
  };

  it("turns a candidate into a loggable food with stable local unit ids", () => {
    const food = candidateToFood(cand);
    expect(food.units).toEqual([{ id: "f-skyr:Becher", label: "Becher", baseAmount: 450 }]);
    expect(food.barcode).toBeNull();
    expect(snapshotFromFood(food, 200, "g").kcal).toBeCloseTo(126, 5);
    expect(snapshotFromFood(food, 1, "Becher").proteinG).toBeCloseTo(49.5, 5);
  });

  it("takes the spoken unit only when the food knows it", () => {
    expect(pickUnit(["g", "Becher"], "becher")).toEqual({ unit: "Becher", matched: true });
    expect(pickUnit(["g", "Becher"], "EL")).toEqual({ unit: "g", matched: false });
    expect(pickUnit(["g"], null)).toEqual({ unit: "g", matched: false });
    expect(pickUnit([], "g")).toEqual({ unit: "g", matched: false });
  });
});

describe("voice recording format", () => {
  it("prefers webm/opus and falls back to mp4 (Safari)", () => {
    expect(recorderMimeType(() => true)).toBe("audio/webm;codecs=opus");
    expect(recorderMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(recorderMimeType(() => false)).toBeUndefined();
  });
});

describe("share target", () => {
  it("finds the link in the url field or inside the shared text", () => {
    expect(extractUrl(null, "Schau mal: https://www.tiktok.com/@koch/video/123?x=1 lecker!")).toBe("https://www.tiktok.com/@koch/video/123?x=1");
    expect(extractUrl("https://example.org/rezept.", null)).toBe("https://example.org/rezept");
    expect(extractUrl("(https://example.org/a)")).toBe("https://example.org/a");
    expect(extractUrl("kein Link", undefined)).toBeNull();
  });

  it("keeps a share until the import screen takes it, once", () => {
    const storage = new MemoryStorage();
    expect(captureShare({ pathname: "/", search: "" }, storage)).toBe(false);
    expect(captureShare({ pathname: "/share-target", search: "?title=Pasta&text=" + encodeURIComponent("Rezept https://youtu.be/abc") }, storage)).toBe(true);
    expect(takeShare(storage)).toEqual({ url: "https://youtu.be/abc", text: "Rezept https://youtu.be/abc", title: "Pasta" });
    expect(takeShare(storage)).toBeNull();
  });

  it("survives a broken stored value", () => {
    const storage = new MemoryStorage();
    storage.setItem("kcal.pendingShare", "{nope");
    expect(takeShare(storage)).toBeNull();
  });
});

describe("scanner dedupe", () => {
  it("ignores the same code while it stays in front of the camera", () => {
    let t = 0;
    const fresh = createDeduper(2500, () => t);
    expect(fresh("4000417025005")).toBe(true);
    t = 1000;
    expect(fresh("4000417025005")).toBe(false);
    expect(fresh("4008400401621")).toBe(true);
    t = 5000;
    expect(fresh("4000417025005")).toBe(true);
  });
});

describe("recipe import", () => {
  it("knows which states are still running", () => {
    expect(isPending("EXTRACTING")).toBe(true);
    expect(isPending("PREVIEW_READY")).toBe(false);
    expect(isPending("FAILED")).toBe(false);
  });

  it("keeps source and steps as the recipe note, within 2000 characters", () => {
    const draft = { method: "json-ld" as const, title: "X", servings: { value: 2, status: "verified" as const }, ingredients: [], steps: ["Kochen", "Essen"], openQuestions: [] };
    expect(importNote({ url: "https://example.org/r", draft })).toBe("Quelle: https://example.org/r\n\n1. Kochen\n2. Essen");
    expect(importNote({ url: null, draft: { ...draft, steps: [] } })).toBeNull();
    expect(importNote({ url: null, draft: { ...draft, steps: ["x".repeat(3000)] } })!.length).toBe(2000);
  });
});

describe("saveLearnedFood", () => {
  it("unwraps the { status, food } answer so the food can be cached by id", async () => {
    const food = { id: "f1", name: "Skyr", brand: null, barcode: "4001", basis: "PER_100G" as const, densityGPerMl: null, per100: n({ kcal: 83 }), estimatedFields: [], units: [] };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "applied", food }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const saved = await saveLearnedFood({ name: " Skyr ", brand: null, barcode: "4001", basis: "PER_100G", per100: n({ kcal: 83 }), estimatedFields: [], units: [] }, fetchImpl);
    expect(saved.id).toBe("f1");
    expect(saved.name).toBe("Skyr");
  });
});
