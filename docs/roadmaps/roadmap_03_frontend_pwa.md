# Teil-Roadmap 03: Kalorien-PWA Frontend, Design & Offline-Sync

Status: ABGESCHLOSSEN (2026-11-25 16:57)

- **Welle:** 2
- **Abhängigkeiten:** API-Verträge aus Teil-Roadmap 02
- **Ziel:** Extrem schnelle, offline-fähige Mobile-PWA im persönlichen Design *„Serious Data, Playful Soul“*.
- **Relevante Dateien:** `nutrition-frontend/*`
- **Empfohlene Claude-Skills:** `design-system-review`, `pwa-e2e-inspector`

---

## Arbeitspakete

### [P0] PWA-Grundgerüst & Offline-Sync
- [x] Eigenständige React + TypeScript + Vite PWA mit `vite-plugin-pwa`, Manifest und Service Worker aufsetzen. (erledigt: 2026-11-25 16:57) – Hülle aus ROADMAP-01; Workbox precacht App und Schrift, `/api` bleibt ausgenommen; Offline-Reload per E2E belegt.
- [x] Lokalen Offline-Speicher via **Dexie.js (IndexedDB)** aufbauen (vollständig getrennt vom Speicher des Fitnesstrackers). (erledigt: 2026-11-25 16:57) – Dexie-DB `kalorientracker` (`src/lib/db.ts`): Snapshots, Lebensmittel-Cache, Rezepte, Bewertungen, Outbox, Fehlerliste, Präferenzen; wird bei Kontowechsel und Logout geleert.
- [x] Delta-Sync-Engine inkl. `SyncStatusIndicator` („Synchronisiert“ / „Offline“) analog zum Fitnesstracker integrieren. (erledigt: 2026-11-25 16:57) – `src/lib/sync.ts` (Outbox mit Client-UUIDs, Batch-Push mit Einzel-Fallback, Pull ab `serverTime`, abgelehnte Ops in „fehlgeschlagen“ mit Erneut/Verwerfen), `src/ui/SyncStatusIndicator.tsx`.
- [x] Bottom-Tab-Bar (`Heute`, `Rezepte`, `Fortschritt`, `Export`, `Mehr`) umsetzen. (erledigt: 2026-11-25 16:57) – Hash-Routen in `src/App.tsx`.

### [P0] Design-System („Serious Data, Playful Soul“)
- [x] Deep-Dark-Purple-Theme als Design-Tokens anlegen (`#0B0914` Hintergrund, `#161226` Cards, `#8B5CF6` Primärakzent, feine 1px-Rahmen). (erledigt: 2026-11-25 16:57) – Tokens in `src/styles.css`.
- [x] **Dynamischer Phasen-Glow** am oberen Bildschirmrand: (erledigt: 2026-11-25 16:57) – `body[data-phase]` aus `nutritionPhase` der Fitnesstracker-Ziele; Glow, Hero und Fortschrittsbalken.
  - Aufbau-Phase (Bulk): Royal-Lila + warmes Amber/Gold (`#F59E0B`).
  - Cut-Phase (Definition): Neon-Violett + Eis-Cyan/Mint (`#06B6D4`).
- [x] Typografie: Geometrische Überschriften (z. B. *Space Grotesk* / *Outfit*) und strikt `tabular-nums` für alle Kalorien-, Gramm- und Delta-Werte. (erledigt: 2026-11-25 16:57) – Space Grotesk (selbst gehostet über `@fontsource-variable`), `tabular-nums` auf allen Zahlen, E2E prüft es auf allen Tabs.
- [x] Kleines lila Header-Maskottchen mit reaktiven Zuständen (Standard, Sonnenbrille bei $100\,\%$ Protein, Flamme bei Streak). (erledigt: 2026-11-25 16:57) – `src/ui/Mascot.tsx` (SVG), Sonnenbrille bei erreichtem Protein, Flamme ab 3 Tagen Streak.
- [x] Globalen Einstellungs-Toggle **„Humor-Modus (An/Aus)“** einbauen, der alle witzigen Sprüche sauber auf sachliche Standardtexte umschaltet. (erledigt: 2026-11-25 16:57) – Tab „Mehr“; alle Sprüche über `src/lib/copy.ts`.

### [P0] Startbildschirm („Heute“) & Makro-Abgleich
- [x] **Hero-Card:** Großes Restbudget (`X kcal offen`), exakte Gramm-Deltas (`noch 42 g Protein`, `noch 65 g KH`, `noch 18 g Fett`), Status-Badge (`Kapitel 2`) und primärer CTA-Button. (erledigt: 2026-11-25 16:57) – Ohne Profil im Fitnesstracker zeigt die Karte nur die Tagessumme und schätzt nichts; Badge-Text unter „Mehr“ änderbar.
- [x] **4 Schnellaktionen:** Griffige Kacheln direkt unter der Hero-Card für **Barcode**, **Foto**, **Suche** und **Sprache**. (erledigt: 2026-11-25 16:57) – Barcode per Zifferneingabe (Kamera und Foto/Sprache folgen in ROADMAP-04; die Kacheln melden das bis dahin).
- [x] Lebensmittelsuche (inkl. Favoriten und zuletzt verwendete Lebensmittel) mit schneller Mengenanpassung. (erledigt: 2026-11-25 16:57) – `src/screens/FoodSheet.tsx`: lokale Treffer sofort, Server-Suche entprellt; Favoriten, Zuletzt verwendet, Rezepte.
- [x] **1–10 Tagesbewertung:** Kompakte 1-Tap-Leiste direkt auf dem Startbildschirm mit humorvollen Labels (`1–2` *Überlebt* bis `10` *Endboss-Tag*) und optionaler Kurznotiz. (erledigt: 2026-11-25 16:57) – Zwei Reihen à fünf (44-px-Ziele), Labels folgen dem Humor-Modus.

### [P1] Reibungsarmes Logging (UX-Turbo)
- [x] **Smart Defaults:** Zuletzt genutzte Menge pro Lebensmittel automatisch vorausfüllen. (erledigt: 2026-11-25 16:57) – lokal in `foodPrefs`.
- [x] **Ein-Tipp-Brüche:** Schnelltasten wie `1/4`, `1/2`, `1 Packung` bei verpackten Produkten. (erledigt: 2026-11-25 16:57) – bei Packungs-Einheiten.
- [x] **Live-Restbudget:** Beim Anpassen der Grammzahl live anzeigen, wie sich Rest-kcal und Rest-Protein verändern. (erledigt: 2026-11-25 16:57)
- [x] **Quick-Add („Auswärts / Pi-mal-Daumen“):** Schnelleingabe (nur kcal, optional Protein & Notiz) ohne Datenbank-Zwang. (erledigt: 2026-11-25 16:57) – als geschätzt markiert, Protein bleibt ohne Eingabe „unbekannt“.
- [x] **Uhrzeitabhängige 1-Tap-Chips:** Typische Frühstücks-/Mittags-/Abend-Einträge passend zur Tageszeit direkt auf dem Startbildschirm. (erledigt: 2026-11-25 16:57) – häufigste Einträge der Tageszeit aus den letzten 14 Tagen.
- [x] *„Wie gestern übernehmen“*-Button und **Swipe-to-Delete mit Undo-Toast** statt Bestätigungs-Dialogen. (erledigt: 2026-11-25 16:57) – Undo-Fenster 5 s, Löschen geht erst danach raus.

### [P1] Rezept- & Meal-Prep-UI
- [x] Rezept-Editor mit getrennter Eingabe für Rohzutaten und tatsächliches Endgewicht nach dem Kochen. (erledigt: 2026-11-25 16:57) – Live-Rechnung nach derselben Formel wie das Backend (`src/lib/nutrients.ts`), Server-Snapshot bleibt maßgeblich.
- [x] **Meal-Prep-Aufteilung:** Ein gekochtes Gericht direkt beim Speichern auf mehrere Tage (z. B. Heute, Morgen, Übermorgen) aufteilen. (erledigt: 2026-11-25 16:57) – aus der Rezeptliste: Tage und Gramm pro Tag wählen.

### [P2] Export- & Fortschritts-Ansicht
- [x] Export-Screen mit 1-Tipp-Auswahl für **7, 14, 31 und 90 Tage** (PDF, CSV, Markdown/JSON). (erledigt: 2026-11-25 16:57) – lädt den Server-Export; offline gesperrt.
- [x] 7-Tage-Übersicht für Makro-Bilanz und 1–10 Tagesbewertung. (erledigt: 2026-11-25 16:57) – `src/screens/Progress.tsx` aus lokalen Daten.

---

## Abnahme-Kriterium (Done)
- Ein kompletter Ernährungstag inkl. 1–10-Bewertung lässt sich komplett offline im Mobile-Viewport erfassen und beim Reconnect konfliktfrei synchronisieren.
- Alle Zahlen nutzen `tabular-nums`, alle Touch-Targets sind mindestens $44 \times 44\text{ px}$ groß.