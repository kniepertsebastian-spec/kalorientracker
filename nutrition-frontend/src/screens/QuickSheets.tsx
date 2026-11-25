import { useState } from "react";
import { quickAdd } from "../lib/actions";
import { ApiError, apiJson, OfflineError } from "../lib/api";
import { COPY, MEAL_LABELS } from "../lib/copy";
import { db } from "../lib/db";
import { formatNumber, quickSnapshot, type Budget } from "../lib/day";
import { useApp } from "../lib/hooks";
import { MEAL_TYPES, type FoodDto, type MealType } from "../lib/types";
import { Sheet } from "../ui/Sheet";

/** Quick-Add ("Auswärts / Pi-mal-Daumen"): kcal only, protein and a note optional. Marked as an estimate. */
export function QuickAddSheet({ date, initialMealType, budget, onClose }: { date: string; initialMealType: MealType; budget: Budget | null; onClose: () => void }) {
  const { humor, toast } = useApp();
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [note, setNote] = useState("");
  const [mealType, setMealType] = useState(initialMealType);
  const k = Number(kcal.replace(",", "."));
  const p = protein.trim() === "" ? null : Number(protein.replace(",", "."));
  const valid = kcal.trim() !== "" && Number.isFinite(k) && k >= 0 && k <= 20000 && (p === null || (Number.isFinite(p) && p >= 0 && p <= 1000));

  const save = async () => {
    if (!valid) return;
    await quickAdd(date, mealType, note.trim().slice(0, 200) || "Schnelleingabe", quickSnapshot(k, p));
    toast(navigator.onLine ? COPY.synced(humor) : COPY.savedOffline(humor));
    onClose();
  };

  return (
    <Sheet title={COPY.quickAdd(humor)} onClose={onClose}>
      <div className="form">
        <label>
          Kalorien (kcal)
          <input inputMode="decimal" className="num big-input" data-autofocus="" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </label>
        <label>
          Protein in g (optional)
          <input inputMode="decimal" className="num" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </label>
        <label>
          Notiz (optional)
          <input maxLength={200} value={note} placeholder="z. B. Döner beim Italiener" onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="chips" role="radiogroup" aria-label="Mahlzeit">
          {MEAL_TYPES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mealType === m} className={`chip ${mealType === m ? "on" : ""}`} onClick={() => setMealType(m)}>
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>
        {budget && valid && (
          <p className="live-budget">
            Danach: <span className="num">{formatNumber(budget.remainingKcal - k)}</span> kcal offen
          </p>
        )}
        <p className="tiny muted">Wird als Schätzung markiert. Fehlende Nährwerte bleiben „unbekannt“, nicht 0.</p>
        <button type="button" className="primary" disabled={!valid} onClick={() => void save()}>
          Eintragen
        </button>
      </div>
    </Sheet>
  );
}

/** Barcode by hand until the camera scanner arrives (Roadmap 04): own DB, then Open Food Facts. */
export function BarcodeSheet({ onFound, onClose }: { onFound: (food: FoodDto) => void; onClose: () => void }) {
  const { humor } = useApp();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = /^\d{6,14}$/.test(code.trim());

  const lookup = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const cached = await db.foods.filter((f) => f.barcode === code.trim()).first();
      onFound(cached ?? (await apiJson<FoodDto>(`/nutrition/foods/barcode/${code.trim()}`)));
    } catch (e) {
      setMessage(e instanceof OfflineError ? "Offline – nur bereits verwendete Produkte sind bekannt." : e instanceof ApiError && e.status === 404 ? COPY.scanUnknown(humor) : "Suche fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Barcode" onClose={onClose}>
      <div className="form">
        <label>
          EAN / Barcode-Nummer
          <input inputMode="numeric" className="num big-input" data-autofocus="" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </label>
        <p className="tiny muted">Der Kamera-Scanner kommt mit dem Scanner-Update. Bis dahin: Nummer unter dem Strichcode eintippen.</p>
        {message && <p className="small danger">{message}</p>}
        <button type="button" className="primary" disabled={!valid || busy} onClick={() => void lookup()}>
          {busy ? "Suche …" : "Produkt suchen"}
        </button>
      </div>
    </Sheet>
  );
}
