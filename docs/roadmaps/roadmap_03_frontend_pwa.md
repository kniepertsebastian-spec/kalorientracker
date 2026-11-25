# Teil-Roadmap 03: Kalorien-PWA Frontend, Design & Offline-Sync

- **Welle:** 2
- **Abhängigkeiten:** API-Verträge aus Teil-Roadmap 02
- **Ziel:** Extrem schnelle, offline-fähige Mobile-PWA im persönlichen Design *„Serious Data, Playful Soul“*.
- **Relevante Dateien:** `nutrition-frontend/*`
- **Empfohlene Claude-Skills:** `design-system-review`, `pwa-e2e-inspector`

---

## Arbeitspakete

### [P0] PWA-Grundgerüst & Offline-Sync
- [ ] Eigenständige React + TypeScript + Vite PWA mit `vite-plugin-pwa`, Manifest und Service Worker aufsetzen.
- [ ] Lokalen Offline-Speicher via **Dexie.js (IndexedDB)** aufbauen (vollständig getrennt vom Speicher des Fitnesstrackers).
- [ ] Delta-Sync-Engine inkl. `SyncStatusIndicator` („Synchronisiert“ / „Offline“) analog zum Fitnesstracker integrieren.
- [ ] Bottom-Tab-Bar (`Heute`, `Rezepte`, `Fortschritt`, `Export`, `Mehr`) umsetzen.

### [P0] Design-System („Serious Data, Playful Soul“)
- [ ] Deep-Dark-Purple-Theme als Design-Tokens anlegen (`#0B0914` Hintergrund, `#161226` Cards, `#8B5CF6` Primärakzent, feine 1px-Rahmen).
- [ ] **Dynamischer Phasen-Glow** am oberen Bildschirmrand:
  - Aufbau-Phase (Bulk): Royal-Lila + warmes Amber/Gold (`#F59E0B`).
  - Cut-Phase (Definition): Neon-Violett + Eis-Cyan/Mint (`#06B6D4`).
- [ ] Typografie: Geometrische Überschriften (z. B. *Space Grotesk* / *Outfit*) und strikt `tabular-nums` für alle Kalorien-, Gramm- und Delta-Werte.
- [ ] Kleines lila Header-Maskottchen mit reaktiven Zuständen (Standard, Sonnenbrille bei $100\,\%$ Protein, Flamme bei Streak).
- [ ] Globalen Einstellungs-Toggle **„Humor-Modus (An/Aus)“** einbauen, der alle witzigen Sprüche sauber auf sachliche Standardtexte umschaltet.

### [P0] Startbildschirm („Heute“) & Makro-Abgleich
- [ ] **Hero-Card:** Großes Restbudget (`X kcal offen`), exakte Gramm-Deltas (`noch 42 g Protein`, `noch 65 g KH`, `noch 18 g Fett`), Status-Badge (`Kapitel 2`) und primärer CTA-Button.
- [ ] **4 Schnellaktionen:** Griffige Kacheln direkt unter der Hero-Card für **Barcode**, **Foto**, **Suche** und **Sprache**.
- [ ] Lebensmittelsuche (inkl. Favoriten und zuletzt verwendete Lebensmittel) mit schneller Mengenanpassung.
- [ ] **1–10 Tagesbewertung:** Kompakte 1-Tap-Leiste direkt auf dem Startbildschirm mit humorvollen Labels (`1–2` *Überlebt* bis `10` *Endboss-Tag*) und optionaler Kurznotiz.

### [P1] Reibungsarmes Logging (UX-Turbo)
- [ ] **Smart Defaults:** Zuletzt genutzte Menge pro Lebensmittel automatisch vorausfüllen.
- [ ] **Ein-Tipp-Brüche:** Schnelltasten wie `1/4`, `1/2`, `1 Packung` bei verpackten Produkten.
- [ ] **Live-Restbudget:** Beim Anpassen der Grammzahl live anzeigen, wie sich Rest-kcal und Rest-Protein verändern.
- [ ] **Quick-Add („Auswärts / Pi-mal-Daumen“):** Schnelleingabe (nur kcal, optional Protein & Notiz) ohne Datenbank-Zwang.
- [ ] **Uhrzeitabhängige 1-Tap-Chips:** Typische Frühstücks-/Mittags-/Abend-Einträge passend zur Tageszeit direkt auf dem Startbildschirm.
- [ ] *„Wie gestern übernehmen“*-Button und **Swipe-to-Delete mit Undo-Toast** statt Bestätigungs-Dialogen.

### [P1] Rezept- & Meal-Prep-UI
- [ ] Rezept-Editor mit getrennter Eingabe für Rohzutaten und tatsächliches Endgewicht nach dem Kochen.
- [ ] **Meal-Prep-Aufteilung:** Ein gekochtes Gericht direkt beim Speichern auf mehrere Tage (z. B. Heute, Morgen, Übermorgen) aufteilen.

### [P2] Export- & Fortschritts-Ansicht
- [ ] Export-Screen mit 1-Tipp-Auswahl für **7, 14, 31 und 90 Tage** (PDF, CSV, Markdown/JSON).
- [ ] 7-Tage-Übersicht für Makro-Bilanz und 1–10 Tagesbewertung.

---

## Abnahme-Kriterium (Done)
- Ein kompletter Ernährungstag inkl. 1–10-Bewertung lässt sich komplett offline im Mobile-Viewport erfassen und beim Reconnect konfliktfrei synchronisieren.
- Alle Zahlen nutzen `tabular-nums`, alle Touch-Targets sind mindestens $44 \times 44\text{ px}$ groß.