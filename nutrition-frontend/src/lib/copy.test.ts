import { describe, expect, it } from "vitest";
import { greeting, loadHumor } from "./copy";

describe("greeting", () => {
  it("is plain with the humor mode off", () => {
    expect(greeting("Basti", 8, false)).toBe("Guten Morgen, Basti.");
    expect(greeting(null, 20, false)).toBe("Guten Abend.");
  });

  it("gets a dry twist with the humor mode on", () => {
    expect(greeting("Basti", 8, true)).toMatch(/^Guten Morgen, Basti\. /);
  });

  it("defaults the humor mode to on", () => {
    expect(loadHumor({ getItem: () => null })).toBe(true);
    expect(loadHumor({ getItem: () => "off" })).toBe(false);
  });
});

import { budgetLine, phaseLine, ratingLabel } from "./copy";

describe("micro-copy", () => {
  it("switches every status line between plain and dry", () => {
    expect(phaseLine("BULK", false)).toBe("Phase Aufbau");
    expect(phaseLine("CUT", true)).toBe("Phase Cut · Formschliff läuft.");
    expect(budgetLine({ remainingKcal: -120, remainingProteinG: 0, proteinReached: true }, false)).toBe("+120 kcal über Tagesziel");
    expect(budgetLine({ remainingKcal: -120, remainingProteinG: 0, proteinReached: true }, true)).toMatch(/Bonus-Treibstoff/);
    expect(budgetLine({ remainingKcal: 300, remainingProteinG: 30, proteinReached: false }, false)).toBe("Noch 30 g Protein bei 300 kcal");
    expect(budgetLine({ remainingKcal: 900, remainingProteinG: 0, proteinReached: true }, false)).toBe("Proteinziel 100 % erreicht");
  });

  it("names the rating levels", () => {
    expect([1, 2, 3, 5, 7, 9, 10].map((s) => ratingLabel(s, true))).toEqual([
      "Überlebt", "Überlebt", "War ein Kampf", "Solide Pflicht", "Stabile Maschine", "Fast perfekt", "Endboss-Tag",
    ]);
    expect(ratingLabel(1, false)).toBe("Schlecht");
    expect(ratingLabel(10, false)).toBe("Sehr gut");
    expect(ratingLabel(6, false)).toBe("6 von 10");
  });
});

import { trainingLine, waterContext } from "./copy";

describe("phase-driven copy (Fitnesstracker)", () => {
  it("colours the humorous greeting by phase, and leaves the plain one alone", () => {
    expect(greeting("Basti", 9, true, "CUT")).toMatch(/Defizit/);
    expect(greeting("Basti", 14, true, "BULK")).toMatch(/Aufbau/);
    expect(greeting("Basti", 9, false, "CUT")).toBe("Guten Morgen, Basti.");
    expect(greeting(null, 3, true, "CUT")).toMatch(/^Noch wach\?/);
  });

  it("names the training block, paused or custom", () => {
    expect(trainingLine("MUSKELAUSDAUER", false)).toBe("Training: Muskelausdauer");
    expect(trainingLine("CUSTOM_2", false)).toBe("Training: eigener Block");
    expect(trainingLine("AUFBAU", true)).toBe("Training pausiert");
    expect(trainingLine(null, null)).toBeNull();
  });

  it("calls a weight change water only when the water share moved the same way", () => {
    expect(waterContext(1.1, 1.2, false)).toMatch(/vermutlich vor allem Wasser/);
    expect(waterContext(-0.8, -0.7, false)).toMatch(/Wasser/);
    expect(waterContext(1.1, -0.6, false)).toMatch(/Wochenschnitt/);
    expect(waterContext(0.1, 1.5, false)).toMatch(/Wochenschnitt/);
  });
});
