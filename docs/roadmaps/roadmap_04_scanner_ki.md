# Teil-Roadmap 04: Schnellerfassung, Scanner & KI-Automatisierung

Status: ABGESCHLOSSEN (2026-11-25 20:35) – Arbeitspakete umgesetzt und live; Abnahme der KI-Pfade mit echtem Gemini-Aufruf steht aus (Test-Account braucht einen Gemini-Schlüssel).

- **Welle:** 3 (parallel zur Feinpolitur von Teil-Roadmap 03)
- **Abhängigkeiten:** Basis-App (03), Redis/Worker (01) und Lebensmittel-/Rezept-API (02)
- **Ziel:** Minimaler Tippaufwand durch Barcode-Dauer-Scan, „Scan & Learn“-Fotoerkennung, Spracheingabe und automatischen Rezeptimport.
- **Relevante Dateien:** `backend/src/modules/nutritionAi/*`, `backend/src/workers/*`, `nutrition-frontend/src/features/capture/*`
- **Empfohlene Claude-Skills:** `nutrition-math-auditor`, `server-ops-check`

---

## Arbeitspakete

### [P1] Barcode-Scanner mit Dauer-Scan-Modus
- [x] ZXing-Barcode-Scanner in die Kalorien-PWA integrieren. (erledigt: 2026-11-25 20:35)
- [x] **Dauer-Scan-Modus:** Kamera bleibt für mehrere Produkte hintereinander offen (akustisches/haptisches Feedback, Liste unten wächst mit, am Ende 1 Tipp auf *„Alle übernehmen“*). (erledigt: 2026-11-25 20:35)
- [x] Automatische Übergabe an „Scan & Learn“, wenn ein Barcode weder lokal noch in Open Food Facts existiert. (erledigt: 2026-11-25 20:35)

### [P1] „Scan & Learn“ (Lebensmittel per Rückseiten-Foto beibringen)
- [x] Kamera-Flow: 1 Foto der **Nährwerttabelle (Rückseite)** – optional zweites Foto der Vorderseite oder Produktname kurz einsprechen. (erledigt: 2026-11-25 20:35)
- [x] Erweiterung des bestehenden Gemini-Clients (`aiClient.ts`) für multimodale JSON-Extraktion: Produktname, Marke, Nährwerte pro 100 g/ml, Packungsgewicht und Portionsgröße. (erledigt: 2026-11-25 20:35)
- [x] **Mathematischer Plausibilitätscheck im Backend:** Prüfung von $(4 \times \text{Protein}) + (4 \times \text{KH}) + (9 \times \text{Fett})$ gegen die erkannten Kalorien (mit Toleranz für Ballaststoffe/Rundung); auffällige Felder gelb markieren. (erledigt: 2026-11-25 20:35)
- [x] 1-Tap-Bestätigung (*„Speichern & direkt loggen“*), Barcode wird dauerhaft in Schicht 1 (PostgreSQL) gespeichert. (erledigt: 2026-11-25 20:35)

### [P1] Spracheingabe
- [x] Kurze Audio-Aufnahme im Frontend (zuverlässiger als Web Speech API unter iOS Safari) mit Upload ans Backend. (erledigt: 2026-11-25 20:35)
- [x] Gemini-Extraktion von Lebensmitteln, Mengen und Einheiten inkl. Abgleich gegen die eigene Lebensmitteldatenbank und Vorschau zur Bestätigung. (erledigt: 2026-11-25 20:35)

### [P2] Automatisierter Rezeptimport (Web & Social Media)
- [x] **Web Share Target API** im PWA-Manifest registrieren (Links direkt aus TikTok, Instagram, YouTube oder Browser über das Teilen-Menü an die App senden). (erledigt: 2026-11-25 20:35)
- [x] **Zweistufiger Import-Flow:** Einfügen/Teilen lädt zunächst eine kostenlose Vorschau (Plattform & Titel) – erst ein Bestätigungsklick startet den asynchronen KI-Job. (erledigt: 2026-11-25 20:35)
- [x] Webseiten-Import via Schema.org/JSON-LD mit KI-Fallback. (erledigt: 2026-11-25 20:35)
- [x] Kochbuchseiten- und Zutatenlisten-Foto über Gemini Multimodal. (erledigt: 2026-11-25 20:35)
- [x] **BullMQ-Worker für Social Media (TikTok, Instagram Reels, YouTube Shorts):** Extraktion von Metadaten, Untertiteln oder Audio via `yt-dlp` (soweit technisch und rechtlich zulässig) + KI-Analyse. (erledigt: 2026-11-25 20:35)
- [x] **Pflicht-Fallbacks:** Direkter Video-Upload, Bildschirmaufnahme-Upload sowie Text-/Transkript-Eingabe für private oder gesperrte Videos. (erledigt: 2026-11-25 20:35)
- [x] **Konfidenz-UI (Kein Halluzinieren):** Strikte Kennzeichnung jedes Werts als `verified`, `estimated` oder `unknown`. Fehlende Mengen werden niemals stillschweigend erfunden, sondern als offene Rückfrage markiert. (erledigt: 2026-11-25 20:35)

### [P2] Wöchentliche „Wochen-Drops“ (High-Protein / Low-kcal Rezeptideen)
- [x] Wöchentlicher Scheduler-Job (z. B. Sonntagmorgen), der 3–5 neue Rezeptideen mit hohem Proteinanteil ($\ge 30\text{–}40\text{ g}$ Protein) und moderaten Kalorien ($\le 500\text{–}600\text{ kcal}$) rotiert. (erledigt: 2026-11-25 20:35)
- [x] Wiederholungssperre von 6–8 Wochen für bereits gezeigte oder abgelehnte Ideen. (erledigt: 2026-11-25 20:35)
- [x] Nährwert-Abgleich gegen die eigene Datenbank + 1-Tap-Übernahme in eigene Rezepte. (erledigt: 2026-11-25 20:35)
- [x] **[P3]** Filter *„Was passt noch in mein Restbudget?“* für eigene Rezepte und Wochen-Drops. (erledigt: 2026-11-25 20:35)

---

## Abnahme-Kriterium (Done)
- Ein unbekanntes Supermarktprodukt wird per Barcode + Rückseiten-Foto in unter 15 Sekunden gelernt und geloggt.
- Ein Rezept-Link oder Kochbuch-Foto erzeugt asynchron ein prüfbares Rezept-Draft ohne halluzinierte Nährwerte.

### Abnahme-Stand (2026-11-25 20:35)
- Live geprüft (`e2e/capture.mjs`, 22/22 PASS): Kamera-Dauerscan, bekannter Barcode, unbekannter Barcode → Scan & Learn, Doppelscan ohne zweite Zeile, „Alle übernehmen“ + Rückgängig, Sprach-Sheet, kostenlose Link-Vorschau, Share Target, Wochen-Drops mit 1-Tap.
- Offen: Foto → Gemini → gespeichert in < 15 s und Rezept-Entwurf per KI live messen, sobald der Test-Account im Fitnesstracker einen Gemini-Schlüssel hat. Ohne Schlüssel antwortet die API mit einer verständlichen 409-Meldung.
