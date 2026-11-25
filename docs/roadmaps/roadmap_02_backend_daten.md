# Teil-Roadmap 02: Backend-Kern, Datenmodell & Lebensmittel-DB

Status: ABGESCHLOSSEN (2026-11-25 16:08)

- **Welle:** 1 (Start, parallel zu Teil-Roadmap 01)
- **Abhängigkeiten:** Keine
- **Ziel:** Stabile gemeinsame API, exakte Nährwert-Rechenlogik und das 3-Schichten-Lebensmittelmodell in PostgreSQL.
- **Relevante Dateien:** `backend/prisma/*`, `backend/src/modules/foods/*`, `backend/src/modules/meals/*`, `backend/src/modules/recipes/*`, `backend/src/modules/nutritionExport/*`
- **Empfohlene Claude-Skills:** `prisma-migration-guard`, `nutrition-math-auditor`

---

## Arbeitspakete

### [P0] Prisma-Schema & Migrationen
- [x] Neue Tabellen im bestehenden `backend/prisma/schema.prisma` entwerfen (bestehende Fitnesstracker-Tabellen bleiben unberührt): (erledigt: 2026-11-25 16:08) – Migration `20261125121246_nutrition_core` (nur neue Tabellen/Enums), zusätzlich `NutritionSettings` (Fettanteil); Micronutrients als JSONB, Dichte und Einheiten über `FoodUnit`/`densityGPerMl`.
  - `Food` (Basis-Makros, erweiterte Nährwerte: Ballaststoffe, Zucker, gesättigte Fettsäuren, Salz; optionales `JSONB`-Feld für Mikronährstoffe; Quelle: `USER`, `BLS`, `OFF`).
  - `FoodUnit` (Einheiten- und Dichte-Umrechnungen wie `EL`, `TL`, `Stück`, `Packung`, `10 ml` Olivenöl $= 9{,}1\text{ g}$).
  - `Recipe` & `RecipeIngredient` (inkl. Rohgewicht und tatsächlichem Endgewicht nach dem Kochen).
  - `MealLog` & `MealEntry` (mit unveränderlichen **NutritionSnapshot**-Feldern).
  - `DailyNutritionRating` (1–10 Tagesbewertung + optionale Kurznotiz pro Tag).
- [x] Alle offline-synchronisierten Tabellen mit clientseitigen UUIDs (`id`), `updatedAt` und Soft-Delete (`deletedAt`) ausstatten. (erledigt: 2026-11-25 16:08)
- [x] Migrationen per `--create-only` prüfen und anwenden. (erledigt: 2026-11-25 16:08) – geprüft (`prisma validate`, `migrate diff` ohne Abweichung) und am 2026-11-25 in Prod angewendet (Backup vorher).

### [P0] Such-Index & 3-Schichten-Lebensmitteldatenbank
- [x] PostgreSQL-Erweiterung `pg_trgm` aktivieren und Trigram-Index auf Lebensmittelnamen/Marken anlegen (tippfehlertolerante Suche). (erledigt: 2026-11-25 16:08) – GIN-Trigramm-Indizes auf Name und Marke; Suche `GET /api/nutrition/foods/search`.
- [x] **Schicht 1:** Eigene gelernte Lebensmittel (höchste Suchpriorität). (erledigt: 2026-11-25 16:08)
- [x] **Schicht 2:** Einmaliges Import-Skript für den **Bundeslebensmittelschlüssel (BLS 4.0)** (~7.140 Grundlebensmittel, CC BY 4.0) nach PostgreSQL. (erledigt: 2026-11-25 16:08) – `pnpm --filter backend bls:import <xlsx>` bzw. `node dist/scripts/importBls.js`; Prod: 7 140 Lebensmittel importiert. Quellenangabe je Treffer (`attribution`).
- [x] **Schicht 3:** **Open Food Facts** Adapter für unbekannte Barcodes mit automatischem dauerhaftem Caching in PostgreSQL. (erledigt: 2026-11-25 16:08) – `GET /api/nutrition/foods/barcode/:code`, Lizenz ODbL wird mitgeliefert.

### [P0] Basis-API & Delta-Sync
- [x] CRUD-Endpunkte für Lebensmittel, Mahlzeiten-Logs und Tagesbewertungen (1–10) umsetzen. (erledigt: 2026-11-25 16:08)
- [x] Delta-Sync-Endpunkt analog zum Fitnesstracker (Append-Only für Logs/Bewertungen, Last-Write-Wins via `updatedAt` für Stammdaten/Rezepte). (erledigt: 2026-11-25 16:08) – `GET/POST /api/nutrition/sync` mit Tombstones.

### [P1] Präzise Rezept-Rechenlogik
- [x] Service zur Rezeptberechnung implementieren: (erledigt: 2026-11-25 16:08) – `backend/src/modules/nutrition/nutrients.ts`, `recipes/recipe.service.ts`; ml ohne Dichte → Gewicht als geschätzt markiert bis in die Mahlzeit.
  1. Summierung aller Nährwerte aus den **Rohgewichten** der Zutaten.
  2. Umrechnung auf `pro 100 g` und auf die gegessene Portion anhand des **tatsächlichen Endgewichts** (berücksichtigt Wasserverlust/Wasseraufnahme beim Kochen).
  3. Erzeugung eines unveränderlichen **Nährwert-Snapshots** beim Speichern und Loggen.
- [x] Edge-Cases abdecken (fehlendes Endgewicht fällt auf Summe der Rohgewichte zurück; Division durch 0 abfangen). (erledigt: 2026-11-25 16:08)

### [P1] Fitness-Bridge-Endpunkt (Single Source of Truth)
- [x] Read-Only-Endpunkt `GET /api/nutrition/targets/today` erstellen, der **Grundumsatz, Gesamtumsatz, Zielkalorien, Zielprotein** und die aktuelle **Trainingsphase (Aufbau/Cut)** direkt aus dem Fitnesstracker liefert. (erledigt: 2026-11-25 16:08)
- [x] Konfigurierbare Verteilung der verbleibenden Kalorien auf Kohlenhydrate und Fett ergänzen (ohne Aktivitätskalorien doppelt zu zählen). (erledigt: 2026-11-25 16:08) – `GET/PUT /api/nutrition/settings` (Fettanteil der restlichen Kalorien).

### [P2] Export-API (7, 14, 31 und 90 Tage)
- [x] Export-Endpunkt für die letzten **7, 14, 31 und 90 Tage** (optional freier Zeitraum) auf Basis der unveränderlichen Snapshots. (erledigt: 2026-11-25 16:08) – `GET /api/nutrition/export?days=7|14|31|90` oder `from`/`to` (höchstens ein Jahr).
- [x] Formate: **PDF** (lesbare Übersicht), **CSV** (Tabellenkalkulation) und **Markdown/JSON** (für KI-Auswertungen). (erledigt: 2026-11-25 16:08)
- [x] Inhalt: Zeitraum-Durchschnitte, tagesweise Mahlzeiten, Ziel-Deltas und die **1–10 Tagesbewertung**. (erledigt: 2026-11-25 16:08)

---

## Abnahme-Kriterium (Done)
- Alle Berechnungen (inkl. Beispielrezept Protein-Pasta mit $10\text{ ml} = 9{,}1\text{ g}$ Olivenöl und Kochverlust) sind über Vitest-Unit-Tests abgesichert.
- Historische Mahlzeiten bleiben unverändert, auch wenn ein Lebensmittel nachträglich bearbeitet wird.