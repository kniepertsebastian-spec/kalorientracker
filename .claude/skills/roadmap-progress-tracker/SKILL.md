---
name: roadmap-progress-tracker
description: Dokumentiert abgeschlossene Arbeitspakete, offene Zwischenstände und den nächsten Schritt mit echtem Timestamp in docs/PROGRESS-LOG.md sowie in den jeweiligen ROADMAP-Dateien. Am Anfang jeder Session ausführen, um anhand der letzten Timestamps den aktuellen Stand zu ermitteln, und am Ende jedes Tasks zum Dokumentieren.
---

# Roadmap Progress Tracker

## Ziel
Sorge für lückenlose Kontinuität über alle Teil-Roadmaps (`docs/roadmaps/ROADMAP-01-*.md` bis `ROADMAP-05-*.md`) und über mehrere Sessions hinweg.

## Modus A: Session-Start („Wo sind wir stehengeblieben?“)
1. Lies die obersten Einträge von `docs/PROGRESS-LOG.md` (neuester Timestamp steht ganz oben).
2. Prüfe zusätzlich, ob in `docs/roadmaps/ROADMAP-*.md` neuere Timestamps oder offene `[ ]`-Punkte in der zuletzt aktiven Roadmap stehen.
3. Gib dem Nutzer eine kurze 4-Zeilen-Zusammenfassung:
   - **Letzter Stand:** Timestamp + zuletzt bearbeitete Roadmap
   - **Abgeschlossen:** Welche Roadmap(s) komplett fertig sind
   - **Stehengeblieben bei:** Exakter letzter Punkt / offene Datei / Blocker
   - **Nächster Schritt:** Konkrete Empfehlung, womit jetzt weitergemacht wird

## Modus B: Dokumentation nach Änderungen oder am Session-Ende
1. **Echten Timestamp abrufen:** Führe im Terminal `date '+%Y-%m-%d %H:%M %Z'` aus. Timestamps niemals schätzen.
2. **Teil-Roadmap aktualisieren:**
   - Hake erledigte Punkte in der betroffenen `ROADMAP-XX-*.md` ab (`- [x] ...`) und ergänze am Ende der Zeile `(erledigt: YYYY-MM-DD HH:MM)`.
   - Wenn alle Punkte einer Teil-Roadmap erledigt sind, setze oben in der Datei `Status: ABGESCHLOSSEN (YYYY-MM-DD HH:MM)`.
3. **Zentrales Log aktualisieren (`docs/PROGRESS-LOG.md`):**
   - Füge den neuen Eintrag **ganz oben** direkt unter der Überschrift ein (neuester Timestamp immer zuerst).
   - Nutze exakt dieses Format:

```markdown
## [YYYY-MM-DD HH:MM CET] – ROADMAP-XX: <Kurztitel>
- **Roadmap-Status:** In Arbeit | Abgeschlossen | Pausiert
- **Abgeschlossene Roadmaps bisher:** z. B. ROADMAP-01, ROADMAP-02
- **Was wurde umgesetzt:**
  - Konkrete Änderungen inkl. wichtigster Dateipfade / Migrationen / Tests
- **Stehengeblieben bei / Offene Punkte:**
  - Exakter Zustand (z. B. welcher Test noch fehlt oder welcher Endpunkt als Nächstes dran ist)
- **Nächster konkreter Schritt:**
  - Ein klarer Startbefehl für die nächste Session
