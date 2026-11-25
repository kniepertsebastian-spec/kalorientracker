---
name: prisma-migration-guard
description: Prüft Änderungen an backend/prisma/schema.prisma und neuen SQL-Migrationen auf Rückwärtskompatibilität, Schutz bestehender Fitnesstracker-Tabellen, Nährwert-Snapshots und Such-Indizes. Verwenden vor jeder Prisma-Migration.
---

# Prisma Migration Guard

## Ziel
Stelle sicher, dass Schema-Erweiterungen für den Kalorientracker die gemeinsame PostgreSQL-Datenbank sauber erweitern, ohne bestehende Fitnesstracker-Daten zu gefährden.

## Pflichtprüfungen vor jeder Migration
1. **Schutz bestehender Fitnesstracker-Tabellen**
   - Prüfe, dass bestehende Tabellen (`User`, `Profile`, `BodyComposition`, `WorkoutLog`, `TrainingPlan`, `Activity`, `HealthSync`, etc.) nicht destruktiv verändert werden (`DROP TABLE`, `DROP COLUMN`, inkompatible Typänderungen).
   - Neue Felder an bestehenden Tabellen müssen `nullable` sein oder einen sicheren `@default` haben.
2. **Single Source of Truth**
   - Keine Duplizierung von Körperdaten, Grundumsatz, Gesamtumsatz, Zielkalorien oder Zielprotein in Ernährungs-Tabellen (diese gehören dem Fitnesstracker).
3. **Nährwert-Snapshots (Unveränderlichkeit)**
   - Tabellen für geloggte Mahlzeiten (`MealLog` / `MealEntry`) und gespeicherte Rezepte müssen eigene Snapshot-Felder für Kalorien und Makros besitzen, damit spätere Änderungen an `Food` historische Logs niemals verfälschen.
4. **Einheiten & Suche**
   - Prüfe, ob Umrechnungen (`ml ↔ g`, `Stück`, `EL`, `TL`, `Packung`) sauber über `FoodUnit` / Dichte abbildbar sind.
   - Prüfe sinnvolle Indizes auf `userId`, Datumsfeldern (`loggedAt` / `date`), `barcode` (unique/index) sowie `pg_trgm`-Indizes für tippfehlertolerante Lebensmittelsuche.
5. **Sync-Felder**
   - Alle offline-synchronisierten Entitäten müssen clientseitige UUIDs (`id`), `updatedAt` und bei Bedarf `deletedAt` (Soft-Delete für Delta-Sync) unterstützen.

## Validierungsschritte
1. Führe `npx prisma validate` aus.
2. Erzeuge die Migration mit `--create-only` und lies die generierte `migration.sql` vollständig vor dem Anwenden.
3. Führe danach die Backend-Tests (`npm test`) aus.

## Verboten ohne explizite Freigabe
- `prisma migrate reset`
- `prisma db push --force-reset`
- Manuelles Löschen oder Umschreiben bereits angewendeter Migrationen.
