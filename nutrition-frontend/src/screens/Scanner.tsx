import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { deleteEntry, logEntry } from "../lib/actions";
import { ApiError, apiJson, OfflineError } from "../lib/api";
import { createDeduper, scanFeedback } from "../lib/capture";
import { COPY, MEAL_LABELS } from "../lib/copy";
import { db } from "../lib/db";
import { formatNumber, snapshotFromFood } from "../lib/day";
import { useApp } from "../lib/hooks";
import { MEAL_TYPES, type FoodDto, type MealEntryDto, type MealType } from "../lib/types";
import { Sheet } from "../ui/Sheet";
import { unitsFor } from "./FoodSheet";
import { ScanLearnSheet } from "./ScanLearn";
import type { DecodeHintType as HintType } from "@zxing/library";

export type ScanItem =
  | { key: string; code: string; state: "loading" }
  | { key: string; code: string; state: "found"; food: FoodDto; quantity: number; unitLabel: string }
  | { key: string; code: string; state: "unknown" | "offline" | "error" };

/** Starting amount for a scanned product: what was used last time, else one pack/serving, else 100 g/ml. */
export async function defaultAmount(food: FoodDto): Promise<{ quantity: number; unitLabel: string }> {
  const pref = await db.foodPrefs.get(food.id);
  const units = unitsFor(food);
  if (pref && units.includes(pref.lastUnit)) return { quantity: pref.lastQuantity, unitLabel: pref.lastUnit };
  const pack = food.units.find((u) => /^(portion|packung|stück|flasche|riegel|becher|dose)/i.test(u.label));
  if (pack) return { quantity: 1, unitLabel: pack.label };
  return { quantity: 100, unitLabel: units[0] ?? "g" };
}

async function lookup(code: string): Promise<ScanItem> {
  const key = crypto.randomUUID();
  try {
    const food = (await db.foods.filter((f) => f.barcode === code).first()) ?? (await apiJson<FoodDto>(`/nutrition/foods/barcode/${code}`));
    return { key, code, state: "found", food, ...(await defaultAmount(food)) };
  } catch (e) {
    if (e instanceof OfflineError) return { key, code, state: "offline" };
    if (e instanceof ApiError && e.status === 404) return { key, code, state: "unknown" };
    return { key, code, state: "error" };
  }
}

/**
 * Continuous barcode scanner: the camera stays open, every new code beeps and lands in a growing
 * list, "Alle übernehmen" logs them together. An unknown code hands over to Scan & Learn with the
 * barcode; the scanner list survives that detour.
 */
export function ScanFlow({ date, initialMealType, onClose }: { date: string; initialMealType: MealType; onClose: () => void }) {
  const { humor, toast } = useApp();
  const [items, setItems] = useState<ScanItem[]>([]);
  const [learning, setLearning] = useState<ScanItem | null>(null);
  const [mealType, setMealType] = useState(initialMealType);
  const [busy, setBusy] = useState(false);

  // Codes still being looked up or not known: a rescan of those adds nothing new.
  const openCodes = useRef(new Set<string>());

  const addCode = useCallback(async (code: string) => {
    if (openCodes.current.has(code)) return;
    openCodes.current.add(code);
    const placeholder: ScanItem = { key: `l-${code}-${Date.now()}`, code, state: "loading" };
    setItems((list) => [placeholder, ...list]);
    const result = await lookup(code);
    if (result.state === "found") openCodes.current.delete(code);
    scanFeedback(result.state === "found");
    setItems((list) => {
      // The same product again: one more of it instead of a second row.
      const existing = result.state === "found" ? list.find((i) => i.state === "found" && i.food.id === result.food.id) : undefined;
      const rest = list.filter((i) => i.key !== placeholder.key);
      if (existing && existing.state === "found" && result.state === "found") {
        return rest.map((i) => (i.key === existing.key && i.state === "found" ? { ...i, quantity: i.unitLabel === "g" || i.unitLabel === "ml" ? i.quantity * 2 : i.quantity + 1 } : i));
      }
      return [result, ...rest];
    });
  }, []);

  const found = items.filter((i): i is Extract<ScanItem, { state: "found" }> => i.state === "found");

  const logAll = async () => {
    setBusy(true);
    const logged: MealEntryDto[] = [];
    let n = 0;
    try {
      for (const i of found) {
        logged.push(await logEntry({ date, mealType, source: { type: "food", food: i.food }, quantity: i.quantity, unitLabel: i.unitLabel }));
        n++;
      }
      toast(`${n} ${n === 1 ? "Produkt" : "Produkte"} eingetragen`, { label: "Rückgängig", run: () => void Promise.all(logged.map((e) => deleteEntry(e))) });
      onClose();
    } catch (e) {
      setItems((list) => list.filter((i) => !found.slice(0, n).some((f) => f.key === i.key)));
      toast(e instanceof Error ? e.message : "Konnte nicht eingetragen werden");
    } finally {
      setBusy(false);
    }
  };

  if (learning) {
    return (
      <ScanLearnSheet
        barcode={learning.code}
        date={date}
        initialMealType={mealType}
        onClose={() => setLearning(null)}
        onLearned={(food, logged) => {
          openCodes.current.delete(learning.code);
          void defaultAmount(food).then((amount) =>
            setItems((list) => (logged ? list.filter((i) => i.key !== learning.key) : list.map((i) => (i.key === learning.key ? { key: i.key, code: i.code, state: "found", food, ...amount } : i)))),
          );
        }}
      />
    );
  }

  return (
    <Sheet title="Barcode-Scanner" onClose={onClose}>
      <CameraScanner onCode={(c) => void addCode(c)} />
      <p className="tiny muted">{COPY.scanHint(humor)}</p>
      <ManualCode onCode={(c) => void addCode(c)} />

      {items.length > 0 && (
        <ul className="list scan-list" data-testid="scan-list" aria-live="polite">
          {items.map((i) => (
            <li key={i.key} className="list-row static">
              <ScanRow
                item={i}
                onChange={(next) => setItems((list) => list.map((x) => (x.key === i.key ? next : x)))}
                onLearn={() => setLearning(i)}
                onRemove={() => {
                  openCodes.current.delete(i.code);
                  setItems((list) => list.filter((x) => x.key !== i.key));
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {found.length > 0 && (
        <div className="scan-footer">
          <div className="chips" role="radiogroup" aria-label="Mahlzeit">
            {MEAL_TYPES.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mealType === m} className={`chip ${mealType === m ? "on" : ""}`} onClick={() => setMealType(m)}>
                {MEAL_LABELS[m]}
              </button>
            ))}
          </div>
          <button type="button" className="primary wide" disabled={busy} onClick={() => void logAll()} data-testid="log-all">
            Alle übernehmen (<span className="num">{found.length}</span>) ·{" "}
            <span className="num">{formatNumber(found.reduce((s, i) => s + (safeKcal(i) ?? 0), 0))}</span> kcal
          </button>
        </div>
      )}
    </Sheet>
  );
}

function safeKcal(i: Extract<ScanItem, { state: "found" }>): number | null {
  try {
    return snapshotFromFood(i.food, i.quantity, i.unitLabel).kcal;
  } catch {
    return null;
  }
}

function ScanRow({ item, onChange, onLearn, onRemove }: { item: ScanItem; onChange: (i: ScanItem) => void; onLearn: () => void; onRemove: () => void }) {
  const { humor } = useApp();
  const remove = (
    <button type="button" className="icon" aria-label="Aus der Liste entfernen" onClick={onRemove}>
      ✕
    </button>
  );
  if (item.state === "loading") {
    return (
      <span className="grow small muted">
        <span className="num">{item.code}</span> · suche …
      </span>
    );
  }
  if (item.state !== "found") {
    return (
      <>
        <span className="grow">
          <span className="name">{item.state === "unknown" ? COPY.scanUnknown(humor) : item.state === "offline" ? "Offline – Produkt nicht im Gerät" : "Suche fehlgeschlagen"}</span>
          <span className="small muted num">{item.code}</span>
        </span>
        {item.state === "unknown" && (
          <button type="button" className="primary" onClick={onLearn}>
            Scan & Learn
          </button>
        )}
        {remove}
      </>
    );
  }
  return <FoundRow item={item} onChange={onChange} remove={remove} />;
}

function FoundRow({ item, onChange, remove }: { item: Extract<ScanItem, { state: "found" }>; onChange: (i: ScanItem) => void; remove: ReactNode }) {
  const [text, setText] = useState(String(item.quantity).replace(".", ","));
  // A rescan raises the amount from outside: show it unless the field already says the same.
  useEffect(() => {
    setText((t) => (Number(t.replace(",", ".")) === item.quantity ? t : String(item.quantity).replace(".", ",")));
  }, [item.quantity]);
  const units = unitsFor(item.food);
  const kcal = safeKcal(item);
  return (
    <>
      <span className="grow">
        <span className="name">{item.food.name}</span>
        <span className="small muted">
          {item.food.brand ? `${item.food.brand} · ` : ""}
          <span className="num">{formatNumber(kcal)}</span> kcal
        </span>
      </span>
      <input
        inputMode="decimal"
        className="num qty-input"
        aria-label={`Menge ${item.food.name}`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value.replace(",", "."));
          if (Number.isFinite(n) && n > 0) onChange({ ...item, quantity: n });
        }}
      />
      <select aria-label={`Einheit ${item.food.name}`} value={item.unitLabel} onChange={(e) => onChange({ ...item, unitLabel: e.target.value })}>
        {units.map((u) => (
          <option key={u}>{u}</option>
        ))}
      </select>
      {remove}
    </>
  );
}

function ManualCode({ onCode }: { onCode: (code: string) => void }) {
  const [code, setCode] = useState("");
  const valid = /^\d{6,14}$/.test(code);
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onCode(code);
        setCode("");
      }}
    >
      <input inputMode="numeric" className="num grow" aria-label="Barcode-Nummer eintippen" placeholder="oder Nummer eintippen" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 14))} />
      <button type="submit" disabled={!valid}>
        Suchen
      </button>
    </form>
  );
}

type CameraState = "starting" | "running" | "denied" | "unavailable";

/** ZXing on the rear camera, loaded on first use (keeps it out of the main bundle). */
function CameraScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>("starting");
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return;
    }
    let stopped = false;
    let controls: { stop: () => void } | null = null;
    const isNew = createDeduper();
    void (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const hints = new Map<HintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]]]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 400 });
        if (stopped || !videoRef.current) return;
        const c = await reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: "environment" } } }, videoRef.current, (result) => {
          const text = result?.getText();
          if (text && /^\d{6,14}$/.test(text) && isNew(text)) onCodeRef.current(text);
        });
        if (stopped) c.stop();
        else {
          controls = c;
          setState("running");
        }
      } catch (e) {
        if (!stopped) setState(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "unavailable");
      }
    })();
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="camera" data-state={state}>
      <video ref={videoRef} muted playsInline aria-label="Kamerabild" />
      {state === "running" && <span className="camera-frame" aria-hidden="true" />}
      {state === "starting" && <p className="camera-note small">Kamera startet …</p>}
      {state === "denied" && <p className="camera-note small">Kein Kamerazugriff. In den Browser-Einstellungen erlauben oder die Nummer eintippen.</p>}
      {state === "unavailable" && <p className="camera-note small">Keine Kamera verfügbar. Nummer unter dem Strichcode eintippen.</p>}
    </div>
  );
}
