import { describe, expect, it } from "vitest";
import { greeting, loadHumor } from "./copy.js";

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
