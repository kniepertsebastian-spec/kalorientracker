import { useEffect, useRef, useState } from "react";
import { deleteEntry, logEntry } from "../lib/actions";
import { candidateToFood, pickUnit, recorderMimeType, voiceFromAudio, voiceFromText, type VoicePreview } from "../lib/capture";
import { COPY, failureText, MEAL_LABELS } from "../lib/copy";
import { formatNumber, snapshotFromFood } from "../lib/day";
import { useApp } from "../lib/hooks";
import { MEAL_TYPES, type FoodDto, type MealEntryDto, type MealType } from "../lib/types";
import { Sheet } from "../ui/Sheet";
import { unitsFor } from "./FoodSheet";

const MAX_RECORD_MS = 60_000;

interface Row {
  name: string;
  include: boolean;
  candidateIdx: number;
  qtyText: string;
  unit: string;
  /** The amount came from the AI as an estimate or not at all: shown for a look before logging. */
  check: boolean;
}

export function rowsFromPreview(p: VoicePreview): Row[] {
  return p.items.map((item) => {
    const food = item.candidates[0] ? candidateToFood(item.candidates[0]) : null;
    const { unit, matched } = pickUnit(food ? unitsFor(food) : ["g"], item.unit);
    const qty = matched ? item.quantity : null;
    return { name: item.name, include: !!food, candidateIdx: 0, qtyText: qty === null ? "" : String(qty).replace(".", ","), unit, check: !matched || item.quantityStatus !== "verified" };
  });
}

/** Voice: "200 g Skyr und eine Banane" → matched against the food DB → preview → confirm. */
export function VoiceSheet({ date, initialMealType, focusText = false, onClose }: { date: string; initialMealType: MealType; focusText?: boolean; onClose: () => void }) {
  const { humor, toast } = useApp();
  const [phase, setPhase] = useState<"idle" | "recording" | "thinking">("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<VoicePreview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [mealType, setMealType] = useState(initialMealType);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(
    () => () => {
      // Closing the sheet mid-recording: release the microphone.
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  useEffect(() => {
    if (phase !== "recording") return;
    const started = Date.now();
    const t = setInterval(() => {
      const ms = Date.now() - started;
      setElapsed(Math.floor(ms / 1000));
      if (ms >= MAX_RECORD_MS && recorder.current?.state === "recording") recorder.current.stop();
    }, 250);
    return () => clearInterval(t);
  }, [phase]);

  const show = (p: VoicePreview) => {
    setPreview(p);
    setRows(rowsFromPreview(p));
    if (p.items.length === 0) setError(humor ? "Kein Essen herausgehört. Nochmal, mit Mengen?" : "Keine Lebensmittel erkannt.");
  };

  const run = async (call: () => Promise<VoicePreview>) => {
    setPhase("thinking");
    setError(null);
    try {
      show(await call());
    } catch (e) {
      setError(failureText(e, humor));
    } finally {
      setPhase("idle");
    }
  };

  const startRecording = async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return setError("Aufnahme wird von diesem Browser nicht unterstützt. Bitte tippen.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError("Kein Mikrofonzugriff. In den Browser-Einstellungen erlauben oder tippen.");
    }
    const mimeType = recorderMimeType((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = (rec.mimeType || mimeType || "audio/webm").split(";")[0]!;
      const blob = new Blob(chunks, { type });
      if (blob.size < 1000) {
        setPhase("idle");
        return setError("Die Aufnahme war zu kurz.");
      }
      void run(() => voiceFromAudio(blob));
    };
    recorder.current = rec;
    rec.start();
    setElapsed(0);
    setPhase("recording");
  };

  const chosen = rows.map((r, i) => {
    const cands = preview?.items[i]?.candidates ?? [];
    const food: FoodDto | null = cands[r.candidateIdx] ? candidateToFood(cands[r.candidateIdx]!) : null;
    const qty = Number(r.qtyText.replace(",", "."));
    let kcal: number | null = null;
    let ok = false;
    if (food && r.qtyText.trim() !== "" && Number.isFinite(qty) && qty > 0) {
      try {
        kcal = snapshotFromFood(food, qty, r.unit).kcal;
        ok = true;
      } catch {
        ok = false;
      }
    }
    return { row: r, food, qty, kcal, ok };
  });
  const toLog = chosen.filter((c) => c.row.include);
  const ready = toLog.length > 0 && toLog.every((c) => c.ok);

  const confirm = async () => {
    const logged: MealEntryDto[] = [];
    for (const c of toLog) logged.push(await logEntry({ date, mealType, source: { type: "food", food: c.food! }, quantity: c.qty, unitLabel: c.row.unit }));
    toast(`${logged.length} ${logged.length === 1 ? "Eintrag" : "Einträge"} gespeichert`, { label: "Rückgängig", run: () => void Promise.all(logged.map((e) => deleteEntry(e))) });
    onClose();
  };

  const update = (i: number, patch: Partial<Row>) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Sheet title="Sprache" onClose={onClose}>
      {!preview || preview.items.length === 0 ? (
        <div className="form">
          <button
            type="button"
            className={`record ${phase === "recording" ? "on" : ""}`}
            disabled={phase === "thinking"}
            aria-pressed={phase === "recording"}
            onClick={() => (phase === "recording" ? recorder.current?.stop() : void startRecording())}
            data-testid="record"
          >
            <span aria-hidden="true">{phase === "recording" ? "■" : "◖"}</span>
            {phase === "recording" ? (
              <>
                Stopp · <span className="num">{elapsed}</span> s
              </>
            ) : phase === "thinking" ? (
              COPY.voiceThinking(humor)
            ) : (
              "Aufnahme starten"
            )}
          </button>
          {phase === "recording" && <p className="small muted">{COPY.voiceListening(humor)}</p>}
          <p className="small muted">Zum Beispiel: „200 Gramm Skyr, eine Banane und ein Esslöffel Erdnussbutter“.</p>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim().length >= 2) void run(() => voiceFromText(text.trim()));
            }}
          >
            <input className="grow" maxLength={2000} autoFocus={focusText} enterKeyHint="done" value={text} onChange={(e) => setText(e.target.value)} placeholder="… oder hier tippen" aria-label="Mahlzeit als Text" />
            <button type="submit" disabled={text.trim().length < 2 || phase !== "idle"}>
              Auswerten
            </button>
          </form>
          {error && <p className="small danger">{error}</p>}
        </div>
      ) : (
        <div className="form" data-testid="voice-preview">
          {preview.transcript && <p className="small muted">„{preview.transcript}“</p>}
          <ul className="list">
            {chosen.map((c, i) => {
              const item = preview.items[i]!;
              const units = c.food ? unitsFor(c.food) : ["g"];
              return (
                <li key={i} className={`card voice-item ${c.row.include && !c.ok ? "suspect" : ""}`}>
                  <label className="check-row">
                    <input type="checkbox" checked={c.row.include} disabled={item.candidates.length === 0} onChange={(e) => update(i, { include: e.target.checked })} />
                    <span className="grow name">{item.name}</span>
                    {c.ok && (
                      <span className="num">
                        {formatNumber(c.kcal)} kcal
                      </span>
                    )}
                  </label>
                  {item.candidates.length === 0 ? (
                    <p className="small muted">Nichts Passendes in der Datenbank. Über die Suche eintragen.</p>
                  ) : (
                    <>
                      <select aria-label={`Lebensmittel für ${item.name}`} value={c.row.candidateIdx} onChange={(e) => update(i, { candidateIdx: Number(e.target.value), ...unitPatch(item.candidates[Number(e.target.value)]!, item.unit) })}>
                        {item.candidates.map((cand, j) => (
                          <option key={cand.id} value={j}>
                            {cand.name}
                            {cand.brand ? ` (${cand.brand})` : ""} · {cand.own ? "Eigen" : cand.source}
                          </option>
                        ))}
                      </select>
                      <div className="amount-row">
                        <input inputMode="decimal" className="num grow" aria-label={`Menge ${item.name}`} placeholder="Menge?" value={c.row.qtyText} onChange={(e) => update(i, { qtyText: e.target.value, check: false })} />
                        <select aria-label={`Einheit ${item.name}`} value={c.row.unit} onChange={(e) => update(i, { unit: e.target.value })}>
                          {units.map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                      {c.row.check && <p className="tiny warn-text">{c.row.qtyText ? "Menge geschätzt – bitte prüfen." : `Menge nicht verstanden${item.unit ? ` („${item.quantity ?? ""} ${item.unit}“)` : ""} – bitte eintragen.`}</p>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="chips" role="radiogroup" aria-label="Mahlzeit">
            {MEAL_TYPES.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mealType === m} className={`chip ${mealType === m ? "on" : ""}`} onClick={() => setMealType(m)}>
                {MEAL_LABELS[m]}
              </button>
            ))}
          </div>
          <p className="live-budget">
            Zusammen <span className="num">{formatNumber(toLog.reduce((s, c) => s + (c.kcal ?? 0), 0))}</span> kcal
          </p>
          <div className="row">
            <button type="button" className="ghost" onClick={() => setPreview(null)}>
              Nochmal
            </button>
            <button type="button" className="primary grow" disabled={!ready} onClick={() => void confirm()} data-testid="voice-confirm">
              Bestätigen & eintragen
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function unitPatch(cand: Parameters<typeof candidateToFood>[0], wanted: string | null): Pick<Row, "unit"> {
  return { unit: pickUnit(unitsFor(candidateToFood(cand)), wanted).unit };
}
