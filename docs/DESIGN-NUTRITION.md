# Design-System: Kalorientracker („Serious Data, Playful Soul“)

Geschwister-App zum bestehenden Fitnesstracker – gleiche Dark-Purple-DNA, aber mit eigenem, persönlichem Charakter.

## 1. Visuelle DNA & Farben
- **Basis:** Deep Dark Mode in sehr dunklem Violett-Schwarz (`#0B0914`), abgesetzte Cards (`#161226`), feine 1px-Rahmen (`rgba(168, 85, 247, 0.18)`).
- **Primärfarbe:** Sattes Royal-Lila (`#8B5CF6` / `#9333EA`) für Hauptaktionen, aktive Tabs und Highlights.
- **Dynamischer Phasen-Glow (subtiler Gradient am oberen Bildschirmrand, gesteuert über die aktive Phase aus dem Fitnesstracker):**
  - **Aufbau-Phase (Bulk):** Royal-Lila + warmes Amber/Gold (`#F59E0B`) für Energie & Wachstum.
  - **Cut-Phase (Definition):** Kühles Neon-Violett + Eis-Cyan/Mint (`#06B6D4`) für Schärfe & Fokus.
- **Makro-Farben:** Klar unterscheidbare, kontrastreiche Balken/Gradients für Protein, Kohlenhydrate und Fett.

## 2. Typografie & Daten-Klarheit („Serious Data“)
- **Überschriften:** Geometrische, markante Sans-Serif (z. B. `Space Grotesk` oder `Outfit`).
- **Zahlen (kcal, Gramm, Restbudget):** Immer mit `font-variant-numeric: tabular-nums` (oder technischer Mono-Schrift), groß und auf einen Blick erfassbar.
- **Null Reibung:** Keine Spielereien, die das Loggen verlangsamen. Eingaben, Scanner, Suche und Navigation bleiben maximal clean, schnell und professionell.

## 3. Persönlichkeit & Humor („Playful Soul“)
- **Tonfall:** Wie ein guter Kumpel mit trockenem Humor – leicht selbstironisch, motivierend, nie kitschig oder kindisch.
- **Kontext:** Nutzer ist Basti (30), Transformation von 203 kg auf 98 kg („Kapitel 2“), aktuell strukturierte Aufbau- und Cut-Phasen.
- **Profi-Schalter:** In den Einstellungen existiert ein globaler Toggle **„Humor-Modus (An/Aus)“**, der bei Bedarf alle Sprüche auf sachliche Standardtexte umschaltet.
- **Header-Maskottchen:** Kleines, minimalistisches lila Avatar-Icon im Header, das subtil auf den Tagesstatus reagiert (entspannt, Sonnenbrille bei 100 % Protein, Flamme bei Streak).

## 4. Layout-Struktur Startbildschirm („Heute“)
1. **Header:** Lila Maskottchen-Icon + Titel „Kalorientracker“, grünes „Synchronisiert“-Badge, Menü-Icon.
2. **Begrüßung:** „Guten Morgen, Basti“ + phasenabhängige Micro-Copy.
3. **Hero-Card:** Restbudget groß („X kcal offen“), exakte Gramm-Deltas für Protein, KH und Fett, kleines Status-Badge („Kapitel 2“) und primärer CTA-Button („Mahlzeit eintragen“).
4. **4 Schnellaktionen:** Griffige Kacheln für `Barcode`, `Foto`, `Suche`, `Sprache`.
5. **Schnell-Log:** Uhrzeitabhängige 1-Tap-Chips (Favoriten / Zuletzt verwendet).
6. **Tagesbewertung:** Kompakte 1–10-Leiste direkt auf dem Screen mit kurzem Feedback-Label und optionaler Kurznotiz.
7. **Bottom-Tab-Bar:** Konsistent zum Fitnesstracker (`Heute`, `Rezepte`, `Fortschritt`, `Export`, `Mehr`).

## 5. Micro-Copy-Referenz (Humor-Modus An vs. Aus)
| Bereich | Sachlich (Humor Aus) | Bastis Touch (Humor An) |
| :--- | :--- | :--- |
| Begrüßung (Aufbau) | Phase Aufbau · Woche X | Phase Aufbau · Die Muskeln haben Hunger. |
| Begrüßung (Cut) | Phase Cut · Woche X | Phase Cut · Formschliff läuft. |
| Proteinziel erreicht | Proteinziel 100 % erreicht | Protein voll. Bizeps-Polizei nickt. |
| Viel Protein, wenig kcal offen | Noch X g Protein bei Y kcal | Endgegner-Kombi: Zeit für den Magerquark-Move. |
| Kalorien leicht über Ziel | +X kcal über Tagesziel | +X kcal Bonus-Treibstoff. Morgen wieder sauber. |
| Quick-Add (Auswärts) | Schnelleingabe ohne Produkt | Pi-mal-Daumen / Auswärts-Schätzung |
| Scan & Learn (Neu anlegen) | Produkt nicht gefunden | Kenn ich noch nicht – zeig mal die Rückseite. |
| KI analysiert Rezept-Link | Rezept wird geladen… | KI schält virtuell die Zwiebeln… |
| Wöchentliche Rezeptideen | Empfohlene Rezepte | Wochen-Drops (High Protein) |
| Keine Einträge heute | Noch keine Mahlzeiten erfasst | Noch nichts im Tank. Was gibt's zuerst? |
| Legacy / Profil-Badge | Gewichtsverlust: 105 kg | Kapitel 2 · -105 kg im Rückspiegel |
| 1–10 Tagesbewertung | 1 = Schlecht … 10 = Sehr gut | 1–2 Überlebt · 3–4 War ein Kampf · 5–6 Solide Pflicht · 7–8 Stabile Maschine · 9 Fast perfekt · 10 Endboss-Tag |
