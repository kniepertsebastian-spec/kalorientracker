/** Status copy: plain when the humor mode is off, dry when it is on (CLAUDE.md, "Copy"). */
export function greeting(name: string | null, hour: number, humor: boolean): string {
  const who = name ? `, ${name}` : "";
  if (!humor) {
    if (hour < 11) return `Guten Morgen${who}.`;
    if (hour < 18) return `Hallo${who}.`;
    return `Guten Abend${who}.`;
  }
  if (hour < 5) return `Noch wach${who}? Der Kühlschrank zählt mit.`;
  if (hour < 11) return `Guten Morgen${who}. Frühstück ist auch nur eine Zahl.`;
  if (hour < 18) return `Hallo${who}. Die Waage hat heute frei, wir nicht.`;
  return `Guten Abend${who}. Snacks werden hier nicht verurteilt – nur gezählt.`;
}

const HUMOR_KEY = "kcal.humor";

export function loadHumor(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  return storage.getItem(HUMOR_KEY) !== "off";
}

export function saveHumor(on: boolean, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(HUMOR_KEY, on ? "on" : "off");
}
