# Teil-Roadmap 02: Backend-Kern, Datenmodell & Lebensmittel-DB

- **Welle:** 1 (Start, parallel zu Teil-Roadmap 01)
- **Abhängigkeiten:** Keine
- **Ziel:** Stabile gemeinsame API, exakte Nährwert-Rechenlogik und das 3-Schichten-Lebensmittelmodell in PostgreSQL.
- **Relevante Dateien:** `backend/prisma/*`, `backend/src/modules/foods/*`, `backend/src/modules/meals/*`, `backend/src/modules/recipes/*`, `backend/src/modules/nutritionExport/*`
- **Empfohlene Claude-Skills:** `prisma-migration-guard`, `nutrition-math-auditor`

---

## Arbeitspakete

### [P0] Prisma-Schema & Migrationen
- [ ] Neue Tabellen im bestehenden `backend/prisma/schema.prisma` entwerfen (bestehende Fitnesstracker-Tabellen bleiben unberührt):
  - `Food` (Basis-Makros, erweiterte Nährwerte: Ballaststoffe, Zucker, gesättigte Fettsäuren, Salz; optionales `JSONB`-Feld für Mikronährstoffe; Quelle: `USER`, `BLS`, `OFF`).
  - `FoodUnit` (Einheiten- und Dichte-Umrechnungen wie `EL`, `TL`, `Stück`, `Packung`, `10 ml` Olivenöl $= 9{,}1\text{ g}$).
  - `Recipe` & `RecipeIngredient` (inkl. Rohgewicht und tatsächlichem Endgewicht nach dem Kochen).
  - `MealLog` & `MealEntry` (mit unveränderlichen **NutritionSnapshot**-Feldern).
  - `DailyNutritionRating` (1–10 Tagesbewertung + optionale Kurznotiz pro Tag).
- [ ] Alle offline-synchronisierten Tabellen mit clientseitigen UUIDs (`id`), `updatedAt` und Soft-Delete (`deletedAt`) ausstatten.
- [ ] Migrationen per `--create-only` prüfen und anwenden.

### [P0] Such-Index & 3-Schichten-Lebensmitteldatenbank
- [ ] PostgreSQL-Erweiterung `pg_trgm` aktivieren und Trigram-Index auf Lebensmittelnamen/Marken anlegen (tippfehlertolerante Suche).
- [ ] **Schicht 1:** Eigene gelernte Lebensmittel (höchste Suchpriorität).
- [ ] **Schicht 2:** Einmaliges Import-Skript für den **Bundeslebensmittelschlüssel (BLS 4.0)** (~7.140 Grundlebensmittel, CC BY 4.0) nach PostgreSQL.
- [ ] **Schicht 3:** **Open Food Facts** Adapter für unbekannte Barcodes mit automatischem dauerhaftem Caching in PostgreSQL.

### [P0] Basis-API & Delta-Sync
- [ ] CRUD-Endpunkte für Lebensmittel, Mahlzeiten-Logs und Tagesbewertungen (1–10) umsetzen.
- [ ] Delta-Sync-Endpunkt analog zum Fitnesstracker (Append-Only für Logs/Bewertungen, Last-Write-Wins via `updatedAt` für Stammdaten/Rezepte).

### [P1] Präzise Rezept-Rechenlogik
- [ ] Service zur Rezeptberechnung implementieren:
  1. Summierung aller Nährwerte aus den **Rohgewichten** der Zutaten.
  2. Umrechnung auf `pro 100 g` und auf die gegessene Portion anhand des **tatsächlichen Endgewichts** (berücksichtigt Wasserverlust/Wasseraufnahme beim Kochen).
  3. Erzeugung eines unveränderlichen **Nährwert-Snapshots** beim Speichern und Loggen.
- [ ] Edge-Cases abdecken (fehlendes Endgewicht fällt auf Summe der Rohgewichte zurück; Division durch 0 abfangen).

### [P1] Fitness-Bridge-Endpunkt (Single Source of Truth)
- [ ] Read-Only-Endpunkt `GET /api/nutrition/targets/today` erstellen, der **Grundumsatz, Gesamtumsatz, Zielkalorien, Zielprotein** und die aktuelle **Trainingsphase (Aufbau/Cut)** direkt aus dem Fitnesstracker liefert.
- [ ] Konfigurierbare Verteilung der verbleibenden Kalorien auf Kohlenhydrate und Fett ergänzen (ohne Aktivitätskalorien doppelt zu zählen).

### [P2] Export-API (7, 14, 31 und 90 Tage)
- [ ] Export-Endpunkt für die letzten **7, 14, 31 und 90 Tage** (optional freier Zeitraum) auf Basis der unveränderlichen Snapshots.
- [ ] Formate: **PDF** (lesbare Übersicht), **CSV** (Tabellenkalkulation) und **Markdown/JSON** (für KI-Auswertungen).
- [ ] Inhalt: Zeitraum-Durchschnitte, tagesweise Mahlzeiten, Ziel-Deltas und die **1–10 Tagesbewertung**.

---

## Abnahme-Kriterium (Done)
- Alle Berechnungen (inkl. Beispielrezept Protein-Pasta mit $10\text{ ml} = 9{,}1\text{ g}$ Olivenöl und Kochverlust) sind über Vitest-Unit-Tests abgesichert.
- Historische Mahlzeiten bleiben unverändert, auch wenn ein Lebensmittel nachträglich bearbeitet wird.