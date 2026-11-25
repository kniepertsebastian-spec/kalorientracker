import { useMemo, useState } from "react";
import { logEntry } from "../lib/actions";
import { checkPlausibility, saveLearnedFood, scanLabel, type CaptureStatus, type LabelScanDraft } from "../lib/capture";
import { COPY, failureText, MEAL_LABELS } from "../lib/copy";
import { cacheFood } from "../lib/db";
import { formatNumber, snapshotFromFood } from "../lib/day";
import { useApp } from "../lib/hooks";
import { NUTRIENT_KEYS, type NutrientBasis, type NutrientKey, type Nutrients } from "../lib/nutrients";
import { MEAL_TYPES, type FoodDto, type MealType } from "../lib/types";
import { Sheet } from "../ui/Sheet";
import { unitsFor } from "./FoodSheet";

const LABELS: Record<NutrientKey, string> = {
  kcal: "Kalorien (kcal)",
  proteinG: "Protein (g)",
  carbsG: "Kohlenhydrate (g)",
  fatG: "Fett (g)",
  fiberG: "Ballaststoffe (g)",
  sugarG: "davon Zucker (g)",
  saturatedFatG: "davon gesättigt (g)",
  saltG: "Salz (g)",
};

const STATUS_TEXT: Record<CaptureStatus, string> = { verified: "gelesen", estimated: "geschätzt", unknown: "unbekannt" };

/** Phones take 12-MP photos; the label stays readable at 2000 px and the upload stays small. */
export async function shrinkImage(file: File, maxSide = 2000): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 3_000_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
  } catch {
    return file; // e.g. HEIC in a browser that cannot decode it: the server takes it as it is
  }
}

interface Props {
  barcode?: string | null;
  date: string;
  initialMealType: MealType;
  onClose: () => void;
  /** After saving: the learned food, and whether it was logged right away. */
  onLearned?: (food: FoodDto, logged: boolean) => void;
}

/** Scan & Learn: nutrition table photo → AI draft → check → saved as own food (with barcode) and logged. */
export function ScanLearnSheet({ barcode = null, date, initialMealType, onClose, onLearned }: Props) {
  const { humor } = useApp();
  const [label, setLabel] = useState<File | null>(null);
  const [front, setFront] = useState<File | null>(null);
  const [productName, setProductName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<LabelScanDraft | null>(null);

  const read = async () => {
    if (!label) return;
    setBusy(true);
    setError(null);
    try {
      const [l, f] = await Promise.all([shrinkImage(label), front ? shrinkImage(front) : Promise.resolve(null)]);
      setDraft(await scanLabel({ label: l, front: f, productName, barcode }));
    } catch (e) {
      setError(failureText(e, humor));
    } finally {
      setBusy(false);
    }
  };

  if (draft) return <ReviewStep draft={draft} date={date} initialMealType={initialMealType} onBack={() => setDraft(null)} onClose={onClose} onLearned={onLearned} />;

  return (
    <Sheet title="Scan & Learn" onClose={onClose}>
      <div className="form">
        <p className="small muted">
          {COPY.scanUnknown(humor)}
          {barcode && (
            <>
              {" · Barcode "}
              <span className="num">{barcode}</span>
            </>
          )}
        </p>
        <PhotoField label="Nährwerttabelle (Pflicht)" file={label} onFile={setLabel} testId="label-photo" />
        <PhotoField label="Vorderseite (optional, für Name und Marke)" file={front} onFile={setFront} testId="front-photo" />
        <label>
          Produktname (optional)
          <span className="with-suffix">
            <input className="grow" maxLength={200} value={productName} placeholder="z. B. Skyr Natur" onChange={(e) => setProductName(e.target.value)} />
            <DictateButton onText={setProductName} />
          </span>
        </label>
        {error && <p className="small danger">{error}</p>}
        <button type="button" className="primary" disabled={!label || busy} onClick={() => void read()}>
          {busy ? COPY.scanLabel(humor) : "Tabelle auslesen"}
        </button>
        <p className="tiny muted">Fotos gehen nur an deinen eigenen KI-Schlüssel und werden nicht gespeichert. Nicht lesbare Werte bleiben „unbekannt“.</p>
      </div>
    </Sheet>
  );
}

function PhotoField({ label, file, onFile, testId }: { label: string; file: File | null; onFile: (f: File | null) => void; testId: string }) {
  return (
    <label className="photo-field">
      {label}
      <input type="file" accept="image/*" capture="environment" data-testid={testId} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <span className={`photo-pick ${file ? "on" : ""}`}>{file ? `✓ ${file.name || "Foto"}` : "◉ Foto aufnehmen oder wählen"}</span>
    </label>
  );
}

type SpeechCtor = new () => { lang: string; interimResults: boolean; maxAlternatives: number; start: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null };

/** The product name by voice, where the browser offers speech recognition (else the keyboard's mic). */
function DictateButton({ onText }: { onText: (t: string) => void }) {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  const [on, setOn] = useState(false);
  if (!Ctor) return null;
  return (
    <button
      type="button"
      className="icon"
      aria-label="Produktname sprechen"
      aria-pressed={on}
      onClick={() => {
        const rec = new Ctor();
        rec.lang = "de-DE";
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onresult = (e) => onText(e.results[0]?.[0]?.transcript.slice(0, 200) ?? "");
        rec.onend = () => setOn(false);
        setOn(true);
        rec.start();
      }}
    >
      ◖
    </button>
  );
}

const parseNum = (text: string): number | null => {
  if (text.trim() === "") return null;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const toText = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

function ReviewStep({ draft, date, initialMealType, onBack, onClose, onLearned }: { draft: LabelScanDraft; date: string; initialMealType: MealType; onBack: () => void; onClose: () => void; onLearned?: Props["onLearned"] }) {
  const { humor, toast } = useApp();
  const [name, setName] = useState(draft.name ?? "");
  const [brand, setBrand] = useState(draft.brand ?? "");
  const [basis, setBasis] = useState<NutrientBasis>(draft.basis);
  const [texts, setTexts] = useState<Record<NutrientKey, string>>(() => Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, toText(draft.per100[k])])) as Record<NutrientKey, string>);
  // A value the user typed counts as checked: it is no longer an estimate.
  const [touched, setTouched] = useState<Set<NutrientKey>>(new Set());
  const [units, setUnits] = useState(() => draft.suggestedUnits.map((u) => ({ ...u, keep: true })));
  const [mealType, setMealType] = useState(initialMealType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const per100: Nutrients = useMemo(() => Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, parseNum(texts[k])])) as Nutrients, [texts]);
  const plausibility = useMemo(() => checkPlausibility(per100, basis), [per100, basis]);
  const suspicious = new Set(plausibility.suspiciousFields);
  const estimatedFields = NUTRIENT_KEYS.filter((k) => draft.status[k] === "estimated" && !touched.has(k) && per100[k] !== null);
  const keptUnits = units.filter((u) => u.keep && u.baseAmount > 0 && u.label.trim());
  const invalid = NUTRIENT_KEYS.some((k) => texts[k].trim() !== "" && per100[k] === null);

  // What gets logged: one serving/pack if the label names one, else 100 g/ml.
  const preview: FoodDto = {
    id: "preview",
    source: "USER",
    name,
    brand: brand || null,
    barcode: draft.barcode,
    basis,
    densityGPerMl: null,
    per100,
    estimatedFields,
    units: keptUnits.map((u) => ({ id: u.label, label: u.label, baseAmount: u.baseAmount })),
  };
  const unitOptions = unitsFor(preview);
  const defaultUnit = keptUnits.find((u) => u.label !== "Packung")?.label ?? keptUnits[0]?.label ?? unitOptions[0]!;
  const [unit, setUnit] = useState(defaultUnit);
  const [qtyText, setQtyText] = useState(defaultUnit === "g" || defaultUnit === "ml" ? "100" : "1");
  const qty = parseNum(qtyText);
  const activeUnit = unitOptions.includes(unit) ? unit : unitOptions[0]!;
  let snap: ReturnType<typeof snapshotFromFood> | null = null;
  try {
    snap = qty !== null && qty > 0 ? snapshotFromFood(preview, qty, activeUnit) : null;
  } catch {
    snap = null;
  }

  const save = async (andLog: boolean) => {
    if (!name.trim()) return setError("Bitte einen Produktnamen eingeben.");
    if (invalid) return setError("Bitte nur Zahlen ab 0 eingeben.");
    if (per100.kcal === null) return setError("Ohne Kalorien lässt sich das Produkt nicht speichern. Bitte den kcal-Wert eintragen.");
    if (andLog && (!qty || qty <= 0)) return setError("Bitte eine Menge über 0 eingeben.");
    setBusy(true);
    setError(null);
    try {
      const food = await saveLearnedFood({ name, brand: brand || null, barcode: draft.barcode, basis, per100, estimatedFields, units: keptUnits });
      await cacheFood(food);
      if (andLog) await logEntry({ date, mealType, source: { type: "food", food }, quantity: qty!, unitLabel: activeUnit });
      toast(andLog ? `${food.name} gelernt und eingetragen` : COPY.learned(humor));
      onLearned?.(food, andLog);
      onClose();
    } catch (e) {
      setError(failureText(e, humor));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Werte prüfen" onClose={onClose}>
      <div className="form" data-testid="scan-review">
        {!plausibility.ok && (
          <div className="notice warn" role="status" data-testid="plausibility">
            <strong>{COPY.labelCheck(humor)}</strong>
            <ul>
              {plausibility.issues.map((i) => (
                <li key={i.code} className="small">
                  {i.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {plausibility.ok && plausibility.energyChecked && (
          <p className="small ok">
            Plausibel: Makros ergeben <span className="num">{formatNumber(plausibility.expectedKcal)}</span> kcal.
          </p>
        )}
        <label className={draft.nameStatus === "unknown" && !name ? "suspect" : ""}>
          Name
          <input maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nicht erkannt – bitte eintragen" />
        </label>
        <label>
          Marke (optional)
          <input maxLength={120} value={brand} onChange={(e) => setBrand(e.target.value)} />
        </label>
        <div className="chips" role="radiogroup" aria-label="Bezugsgröße">
          {(["PER_100G", "PER_100ML"] as const).map((b) => (
            <button key={b} type="button" role="radio" aria-checked={basis === b} className={`chip ${basis === b ? "on" : ""}`} onClick={() => setBasis(b)}>
              pro 100 {b === "PER_100G" ? "g" : "ml"}
            </button>
          ))}
          {draft.basisStatus !== "verified" && <span className="badge soft">Bezugsgröße angenommen</span>}
        </div>

        <div className="nutrient-grid">
          {NUTRIENT_KEYS.map((k) => {
            const status = touched.has(k) ? "verified" : draft.status[k];
            const flag = suspicious.has(k) || (status === "estimated" && per100[k] !== null);
            return (
              <label key={k} className={flag ? "suspect" : ""} data-testid={`nutrient-${k}`} data-suspect={flag || undefined}>
                <span className="nutrient-label">
                  {LABELS[k]}
                  {!touched.has(k) && status !== "verified" && <span className="status-tag">{STATUS_TEXT[status]}</span>}
                </span>
                <input
                  inputMode="decimal"
                  className="num"
                  value={texts[k]}
                  placeholder="unbekannt"
                  aria-invalid={texts[k].trim() !== "" && per100[k] === null}
                  onChange={(e) => {
                    setTexts((t) => ({ ...t, [k]: e.target.value }));
                    setTouched((s) => new Set(s).add(k));
                  }}
                />
              </label>
            );
          })}
        </div>

        {units.length > 0 && (
          <fieldset className="units">
            <legend className="small muted">Einheiten von der Packung</legend>
            {units.map((u, i) => (
              <label key={i} className="check-row">
                <input type="checkbox" checked={u.keep} onChange={(e) => setUnits((list) => list.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} />
                <span className="grow">
                  1 {u.label} = <span className="num">{formatNumber(u.baseAmount, u.baseAmount % 1 ? 1 : 0)}</span> {basis === "PER_100G" ? "g" : "ml"}
                  {u.status === "estimated" && <span className="status-tag">geschätzt</span>}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {draft.notes.length > 0 && (
          <ul className="tiny muted notes">
            {draft.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}

        <h3 className="section">Direkt eintragen</h3>
        <div className="amount-row">
          <label className="grow">
            Menge
            <input inputMode="decimal" className="num" value={qtyText} onChange={(e) => setQtyText(e.target.value)} aria-label="Menge" />
          </label>
          <label>
            Einheit
            <select value={activeUnit} onChange={(e) => setUnit(e.target.value)} aria-label="Einheit">
              {unitOptions.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
        </div>
        {snap && (
          <p className="live-budget">
            = <span className="num">{snap.estimatedFields.includes("kcal") ? "≈ " : ""}{formatNumber(snap.kcal)}</span> kcal · <span className="num">{formatNumber(snap.proteinG, 1)}</span> g Protein
          </p>
        )}
        <div className="chips" role="radiogroup" aria-label="Mahlzeit">
          {MEAL_TYPES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mealType === m} className={`chip ${mealType === m ? "on" : ""}`} onClick={() => setMealType(m)}>
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>

        {error && <p className="small danger">{error}</p>}
        <button type="button" className="primary" disabled={busy} onClick={() => void save(true)} data-testid="save-and-log">
          Speichern & direkt loggen
        </button>
        <div className="row">
          <button type="button" className="ghost" onClick={onBack} disabled={busy}>
            Neues Foto
          </button>
          <button type="button" className="ghost grow" onClick={() => void save(false)} disabled={busy}>
            Nur speichern
          </button>
        </div>
      </div>
    </Sheet>
  );
}
