---
name: design-system-review
description: Prüft UI-Komponenten der Kalorientracker-PWA gegen das Design-System „Serious Data, Playful Soul“ (Dark Purple, Phasen-Glow, tabular-nums, Humor-Toggle, Mobile-First). Verwenden bei neuen Screens oder Komponenten.
---

# Design System Review („Serious Data, Playful Soul“)

## Ziel
Halte die Kalorientracker-PWA optisch konsistent zum Fitnesstracker und bewahre gleichzeitig ihren persönlichen, schnellen und verspielt-professionellen Charakter.

## Design-Checkliste
1. **Farb- & Flächensystem**
   - Deep Dark Purple Basis (`#0B0914`), abgesetzte Cards (`#161226`), dezente 1px-Rahmen (`rgba(168, 85, 247, 0.18)`), Royal-Lila Primärakzent (`#8B5CF6`).
   - **Dynamischer Phasen-Glow:** Reagiert der Header-/Hero-Bereich auf die aktive Phase aus dem Fitnesstracker?
     - Aufbau (Bulk): Royal-Lila + warmes Amber/Gold (`#F59E0B`).
     - Cut (Definition): Neon-Violett + Eis-Cyan/Mint (`#06B6D4`).
2. **Serious Data (Daten-Klarheit)**
   - Alle Kalorien-, Gramm- und Delta-Zahlen verwenden `font-variant-numeric: tabular-nums`.
   - Exakte Rest-Deltas („noch 42 g Protein“) statt rein abstrakter Prozentbalken.
   - Kern-Navigation und Aktionen bleiben eindeutig benannt (`Barcode`, `Foto`, `Suche`, `Sprache`, `Rezepte`, `Export`).
3. **Playful Soul (Persönlichkeit & Humor-Toggle)**
   - Begrüßungs-Untertitel, Status-Badges, Empty States, KI-Ladetexte und die 1–10-Tagesbewertung nutzen den trockenen, freundschaftlichen Tonfall.
   - **Pflicht:** Jede humorvolle Copy muss über den globalen „Humor-Modus (An/Aus)“-Schalter sauber auf sachliche Standardtexte umschalten können.
4. **Geschwindigkeit & Mobile-UX**
   - Minimaler Tippaufwand: Smart Defaults (letzte Menge), Brüche (`¼`, `½`, `1 Packung`), Swipe-to-Delete mit Undo-Toast statt Bestätigungs-Modals.
   - Alle interaktiven Elemente sind gut mit dem Daumen erreichbar (`>= 44x44px`).

## Ausgabeformat
Liste konkreter Abweichungen mit Datei- und Zeilenangabe sowie kurzem Fix-Vorschlag.
