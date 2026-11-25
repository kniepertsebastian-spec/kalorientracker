// App shortcuts (long press on the Android icon, or an iOS Kurzbefehl that opens the link):
// kcal.pwa-tree.de/#sprache opens voice capture, /#snack the same sheet with the text field
// focused and the meal set to Snack. The hash is replaced by #heute once handled, so a reload
// or the back button does not open the sheet again.
export type Shortcut = "voice" | "snack";

const SHORTCUTS = new Map<string, Shortcut>([
  ["sprache", "voice"],
  ["snack", "snack"],
]);

export function shortcutFromHash(hash: string): Shortcut | null {
  return SHORTCUTS.get(hash.replace(/^#\/?/, "").toLowerCase()) ?? null;
}
