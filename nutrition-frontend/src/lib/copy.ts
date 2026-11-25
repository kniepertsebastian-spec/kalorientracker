/** Status copy: plain when the humor mode is off, dry when it is on (CLAUDE.md, "Copy"). */
export function greeting(name: string | null, hour: number, humor: boolean, phase: "CUT" | "MAINTAIN" | "BULK" | null = null): string {
  const who = name ? `, ${name}` : "";
  if (!humor) {
    if (hour < 11) return `Guten Morgen${who}.`;
    if (hour < 18) return `Hallo${who}.`;
    return `Guten Abend${who}.`;
  }
  if (hour < 5) return `Noch wach${who}? Der Kühlschrank zählt mit.`;
  // The phase from the Fitnesstracker colours the line (the glow does the same for the page).
  if (phase === "CUT") {
    if (hour < 11) return `Guten Morgen${who}. Das Defizit hat schon Kaffee getrunken.`;
    if (hour < 18) return `Hallo${who}. Cut läuft – der Hunger ist nur ein Gerücht.`;
    return `Guten Abend${who}. Abends wird der Cut gewonnen. Oder verhandelt.`;
  }
  if (phase === "BULK") {
    if (hour < 11) return `Guten Morgen${who}. Die Muskeln fragen nach Frühstück.`;
    if (hour < 18) return `Hallo${who}. Aufbau heißt: Essen ist heute Pflichttermin.`;
    return `Guten Abend${who}. Noch Platz im Überschuss? Gut so.`;
  }
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

// ─── Micro-copy table of docs/DESIGN-NUTRITION.md: [humor off, humor on] ───────────────────────

const pick = (humor: boolean, plain: string, fun: string) => (humor ? fun : plain);

export function phaseLine(phase: "CUT" | "MAINTAIN" | "BULK" | null, humor: boolean): string {
  if (phase === "BULK") return pick(humor, "Phase Aufbau", "Phase Aufbau · Die Muskeln haben Hunger.");
  if (phase === "CUT") return pick(humor, "Phase Cut", "Phase Cut · Formschliff läuft.");
  if (phase === "MAINTAIN") return pick(humor, "Phase Erhalt", "Phase Erhalt · Kurs halten, Kapitän.");
  return pick(humor, "Kein Profil im Fitnesstracker", "Ohne Profil im Fitnesstracker raten wir nicht – versprochen.");
}

const TRAINING_PHASES: Record<string, string> = { AUFBAU: "Aufbau", MUSKELAUSDAUER: "Muskelausdauer", NEGATIV: "Negativ", DAILY: "Daily" };

/** The Fitnesstracker's training block, e.g. "Training: Muskelausdauer"; custom blocks stay generic. */
export function trainingLine(phase: string | null, paused: boolean | null | undefined): string | null {
  if (!phase) return null;
  if (paused) return "Training pausiert";
  return `Training: ${TRAINING_PHASES[phase] ?? "eigener Block"}`;
}

/** How to read a weight change next to body water (Fortschritt). Only says "Wasser" when the
 *  measured water share moved in the same direction as the weight. */
export function waterContext(weightChangeKg: number, waterChangePoints: number, humor: boolean): string {
  const sameWay = Math.abs(weightChangeKg) >= 0.3 && Math.abs(waterChangePoints) >= 0.5 && Math.sign(weightChangeKg) === Math.sign(waterChangePoints);
  if (sameWay) return pick(humor, "Gewicht und Wasseranteil haben sich gleich bewegt – vermutlich vor allem Wasser.", "Gewicht und Wasser im Gleichschritt – das ist eher Pfütze als Plätzchen.");
  return pick(humor, "Einzelne Tage schwanken durch Wasser und Mageninhalt; aussagekräftig ist der Wochenschnitt.", "Die Waage hat Tagesform. Der Wochenschnitt nicht.");
}

export interface BudgetState {
  remainingKcal: number;
  remainingProteinG: number | null;
  proteinReached: boolean;
}

/** The status line under the hero number. */
export function budgetLine(s: BudgetState, humor: boolean): string {
  const kcal = Math.round(Math.abs(s.remainingKcal));
  if (s.remainingKcal < 0) return pick(humor, `+${kcal} kcal über Tagesziel`, `+${kcal} kcal Bonus-Treibstoff. Morgen wieder sauber.`);
  if (s.proteinReached) return pick(humor, "Proteinziel 100 % erreicht", "Protein voll. Bizeps-Polizei nickt.");
  if (s.remainingProteinG !== null && s.remainingProteinG > 0 && s.remainingKcal <= 400) {
    return pick(humor, `Noch ${Math.round(s.remainingProteinG)} g Protein bei ${kcal} kcal`, "Endgegner-Kombi: Zeit für den Magerquark-Move.");
  }
  return pick(humor, "Im Plan", "Läuft. Die Zahlen sind auf deiner Seite.");
}

export const COPY = {
  duplicate: (h: boolean) => pick(h, "Gleicher Eintrag gerade schon gespeichert – doppelt?", "Déjà-vu: Das stand vor einem Moment schon da. Doppelt gemeint?"),
  quickAdd: (h: boolean) => pick(h, "Schnelleingabe ohne Produkt", "Pi-mal-Daumen / Auswärts-Schätzung"),
  emptyRecipes: (h: boolean) => pick(h, "Noch keine Rezepte. Zutaten roh wiegen, fertiges Gericht wiegen, speichern.", "Noch keine Rezepte. Roh wiegen, kochen, nochmal wiegen – die Mathe machen wir."),
  scanUnknown: (h: boolean) => pick(h, "Produkt nicht gefunden", "Kenn ich noch nicht – zeig mal die Rückseite."),
  recipeLoading: (h: boolean) => pick(h, "Rezept wird geladen…", "KI schält virtuell die Zwiebeln…"),
  emptyDay: (h: boolean) => pick(h, "Noch keine Mahlzeiten erfasst", "Noch nichts im Tank. Was gibt's zuerst?"),
  synced: (h: boolean) => pick(h, "Gespeichert", "Notiert. Die Waage weiß von nichts."),
  savedOffline: (h: boolean) => pick(h, "Offline gespeichert – wird synchronisiert", "Offline notiert. Der Server erfährt es später."),
  deleted: (h: boolean) => pick(h, "Eintrag entfernt", "Weg damit. Hat keiner gesehen."),
  scanHint: (h: boolean) => pick(h, "Barcodes nacheinander vor die Kamera halten. Die Kamera bleibt offen.", "Einfach weiterscannen – die Kamera hat Ausdauer."),
  scanLabel: (h: boolean) => pick(h, "Nährwerttabelle wird gelesen…", "Lese das Kleingedruckte. Mit Lupe."),
  labelCheck: (h: boolean) => pick(h, "Gelb markierte Werte bitte prüfen.", "Gelb heißt: Da hat die Mathe gestutzt. Kurz drüberschauen."),
  learned: (h: boolean) => pick(h, "Produkt gespeichert", "Gelernt. Nächstes Mal reicht der Barcode."),
  voiceListening: (h: boolean) => pick(h, "Aufnahme läuft…", "Ich höre zu. Kauen bitte später."),
  voiceThinking: (h: boolean) => pick(h, "Wird ausgewertet…", "Sortiere gerade Skyr von Banane…"),
  importQueued: (h: boolean) => pick(h, "Rezept wird analysiert. Du kannst die App weiter nutzen.", "Läuft im Hintergrund. Die KI schnippelt, du scrollst."),
  importReady: (h: boolean) => pick(h, "Rezeptentwurf bereit", "Entwurf ist fertig. Nährwerte kommen aus der Datenbank, nicht aus der Fantasie."),
  importFailed: (h: boolean) => pick(h, "Das Rezept konnte nicht gelesen werden.", "Das Rezept hat sich gewehrt. Plan B unten."),
  dropsEmpty: (h: boolean) => pick(h, "Diese Woche passt keine Idee mehr ins Restbudget.", "Heute ist der Tank fast voll – die Ideen warten auf morgen."),
  dropsTitle: (h: boolean) => pick(h, "Ideen der Woche", "Weekly Drop · frisch aus der Protein-Küche"),
};

/** An AI or network failure as one readable line (the server's messages are already German). */
export function failureText(e: unknown, humor: boolean): string {
  if (e instanceof Error && e.name === "OfflineError") return pick(humor, "Offline – dafür braucht es eine Verbindung.", "Offline. Die KI wohnt leider im Internet.");
  if (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message)) return e.message;
  return pick(humor, "Das hat nicht geklappt. Bitte erneut versuchen.", "Hat geklemmt. Noch mal?");
}

/** 1–10 rating labels; with the humor mode off only the two ends are named. */
export function ratingLabel(score: number, humor: boolean): string {
  if (!humor) return score <= 1 ? "Schlecht" : score >= 10 ? "Sehr gut" : `${score} von 10`;
  if (score <= 2) return "Überlebt";
  if (score <= 4) return "War ein Kampf";
  if (score <= 6) return "Solide Pflicht";
  if (score <= 8) return "Stabile Maschine";
  if (score === 9) return "Fast perfekt";
  return "Endboss-Tag";
}

export const MEAL_LABELS = { BREAKFAST: "Frühstück", LUNCH: "Mittag", DINNER: "Abend", SNACK: "Snack" } as const;
