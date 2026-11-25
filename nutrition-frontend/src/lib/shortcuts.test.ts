import { describe, expect, it } from "vitest";
import { shortcutFromHash } from "./shortcuts";

describe("app shortcuts", () => {
  it("maps the shortcut links to a capture sheet", () => {
    expect(shortcutFromHash("#sprache")).toBe("voice");
    expect(shortcutFromHash("#/snack")).toBe("snack");
    expect(shortcutFromHash("#Snack")).toBe("snack");
  });

  it("leaves tabs and unknown hashes alone", () => {
    for (const h of ["", "#", "#heute", "#fortschritt", "#snacks", "#constructor"]) expect(shortcutFromHash(h)).toBeNull();
  });
});
