---
name: nutrition-math-auditor
description: Prüft Ernährungs-Berechnungen, Rezept-Endgewicht-Logik, Nährwert-Snapshots, Einheiten-Umrechnungen und KI-Prompts auf Korrektheit und Halluzinationsschutz. Verwenden bei allen Änderungen an Foods-, Recipes-, Meals- oder AI-Modulen.
---

# Nutrition Math & AI Auditor

## Ziel
Stelle sicher, dass alle Nährwertberechnungen mathematisch exakt sind und KI-Funktionen niemals Werte erfinden.

## Fachliche Prüfpunkte
1. **Rohgewicht vs. Endgewicht (Rezepte)**
   - Gesamtnährwerte werden ausschließlich aus den **Rohgewichten** aller Zutaten summiert.
   - Die Umrechnung auf `pro 100 g` und auf die gegessene Portion erfolgt über das **tatsächliche Endgewicht** des fertigen Gerichts (Kochverlust / Wasseraufnahme korrekt abgebildet).
   - Edge-Cases testen: Endgewicht = 0, fehlendes Endgewicht (Fallback auf Summe der Rohgewichte), Nachkommastellen-Rundung.
2. **Einheiten- & Dichte-Umrechnung**
   - Volumen-zu-Gewicht-Umrechnungen (z. B. `10 ml Olivenöl ≈ 9,1 g`) und Haushaltsmaße (`EL`, `TL`, `Stück`, `½ Packung`) müssen deterministisch und nachvollziehbar über `FoodUnit` laufen.
3. **Plausibilitätscheck bei Foto-Scans („Scan & Learn“)**
   - Prüfe, dass das Backend nach jedem KI-Nährwertscan die Formel `(4 * Protein) + (4 * KH) + (9 * Fett)` gegen die erkannten `kcal` abgleicht (inkl. sinnvoller Toleranz für Ballaststoffe/Alkohol/Rundung) und auffällige Felder zur Prüfung markiert.
4. **Kein Halluzinieren in KI-Prompts**
   - Alle KI-Ausgaben (Nährwertfoto, Spracheingabe, Rezept-URL, Social-Media-Video) müssen ein striktes JSON-Schema mit Konfidenz-/Statusfeldern (`verified`, `estimated`, `unknown`) nutzen.
   - Fehlende Zutatenmengen oder Nährwerte müssen explizit als `unknown` markiert und im UI zur Bestätigung vorgelegt werden – niemals stillschweigend ausfüllen.
5. **Keine Doppelzählung von Aktivitätskalorien**
   - Zielkalorien und Zielprotein kommen direkt vom Fitnesstracker-Endpunkt. Der Kalorientracker addiert keine eigenen Aktivitätskalorien oben drauf.

## Pflicht-Tests
- Schreibe oder aktualisiere Vitest-Unit-Tests für jede neue Berechnungsfunktion (inkl. Protein-Pasta-Beispiel mit 10 ml / 9,1 g Olivenöl und Wasserverdampfung).
