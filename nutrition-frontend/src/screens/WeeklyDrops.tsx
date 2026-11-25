import { useEffect, useState } from "react";
import { deleteEntry, logEntry, saveRecipe, type DraftIngredient } from "../lib/actions";
import { apiJson } from "../lib/api";
import { weeklyDrops, type WeeklyDrop, type WeeklyDropsAnswer } from "../lib/capture";
import { COPY, failureText, MEAL_LABELS } from "../lib/copy";
import { cacheFood, db, getMeta, setMeta } from "../lib/db";
import { budget as computeBudget, dayTotals, formatNumber, mealTypeForHour } from "../lib/day";
import { useApp, useEntries, useTargets } from "../lib/hooks";
import type { EntrySnapshot, FoodDto } from "../lib/types";

const CACHE_KEY = "weeklyDrops";

/** The entry for one serving, exactly the stored per-serving values (no cooked weight is known). */
export function dropSnapshot(drop: WeeklyDrop): EntrySnapshot {
  return { ...drop.perServing, grams: null, estimatedFields: drop.estimatedFields };
}

/** Weekly drops: 3-5 high-protein ideas every Sunday, 1 tap to log or keep as a recipe. */
export function WeeklyDrops({ today }: { today: string }) {
  const { humor, toast } = useApp();
  const targets = useTargets();
  const entries = useEntries(today, today);
  const b = computeBudget(targets ?? null, dayTotals(entries ?? []).values);
  const remaining = b && b.remainingKcal > 0 ? Math.floor(b.remainingKcal) : null;
  const [fitOnly, setFitOnly] = useState(false);
  const [answer, setAnswer] = useState<WeeklyDropsAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const max = fitOnly ? remaining : null;

  useEffect(() => {
    let cancelled = false;
    weeklyDrops(max)
      .then((a) => {
        if (cancelled) return;
        setAnswer(a);
        setError(null);
        if (max === null) void setMeta(CACHE_KEY, a);
      })
      .catch(async (e) => {
        if (cancelled) return;
        // Offline: last week's answer from the device, filtered here.
        const cached = await getMeta<WeeklyDropsAnswer>(CACHE_KEY);
        if (cached) {
          const drops = max === null ? cached.drops : cached.drops.filter((d) => d.kcal !== null && d.kcal <= max);
          setAnswer({ ...cached, drops, hiddenCount: cached.drops.length - drops.length });
        }
        setError(failureText(e, humor));
      });
    return () => {
      cancelled = true;
    };
  }, [max, humor]);

  const logToday = async (drop: WeeklyDrop) => {
    const mealType = mealTypeForHour(new Date().getHours());
    const entry = await logEntry({ date: today, mealType, source: { type: "free", name: drop.name, snapshot: dropSnapshot(drop) }, quantity: 1, unitLabel: "Portion" });
    toast(`${drop.name} eingetragen · ${MEAL_LABELS[mealType]}`, { label: "Rückgängig", run: () => void deleteEntry(entry) });
  };

  const keepAsRecipe = async (drop: WeeklyDrop) => {
    const ingredients: DraftIngredient[] = [];
    try {
      for (const i of drop.ingredients) {
        let food: FoodDto | undefined = await db.foods.get(i.foodId);
        if (!food) {
          food = await apiJson<FoodDto>(`/nutrition/foods/${i.foodId}`);
          await cacheFood(food);
        }
        ingredients.push({ food, quantity: i.grams, unitLabel: "g" });
      }
    } catch (e) {
      return toast(failureText(e, humor));
    }
    const note = drop.steps.map((s, i) => `${i + 1}. ${s}`).join("\n").slice(0, 2000) || null;
    await saveRecipe({ name: drop.name, note, servings: drop.servings, finalWeightG: null, ingredients });
    toast(humor ? "Im Rezeptbuch. Endgewicht beim Kochen nachtragen." : "Als Rezept gespeichert");
  };

  if (!answer && !error) return null;

  return (
    <section className="card drops" aria-label="Ideen der Woche" data-testid="weekly-drops">
      <div className="card-head">
        <h2>{COPY.dropsTitle(humor)}</h2>
        {remaining !== null && (
          <button type="button" className={`chip ${fitOnly ? "on" : ""}`} aria-pressed={fitOnly} onClick={() => setFitOnly((v) => !v)}>
            ≤ <span className="num">{formatNumber(remaining)}</span> kcal
          </button>
        )}
      </div>
      {answer && (
        <p className="tiny muted">
          Je ≥ <span className="num">30</span> g Protein, ≤ <span className="num">600</span> kcal pro Portion · neue Ideen ab {new Date(`${answer.nextDropAt}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC" })}
        </p>
      )}
      {error && !answer && <p className="small muted">{error}</p>}
      {answer && answer.drops.length === 0 && <p className="small muted">{fitOnly ? COPY.dropsEmpty(humor) : "Diese Woche noch keine Ideen."}</p>}
      <ul className="list">
        {answer?.drops.map((d) => (
          <li key={d.id} className="drop">
            <button type="button" className="list-row" aria-expanded={open === d.id} onClick={() => setOpen(open === d.id ? null : d.id)}>
              <span className="grow">
                <span className="name">{d.name}</span>
                <span className="small muted">
                  <span className="num">
                    {d.estimatedFields.includes("kcal") ? "≈ " : ""}
                    {formatNumber(d.kcal)}
                  </span>{" "}
                  kcal · <span className="num">{formatNumber(d.proteinG, 1)}</span> g Protein
                  {d.tags.length > 0 ? ` · ${d.tags.slice(0, 2).join(", ")}` : ""}
                </span>
              </span>
              <span aria-hidden="true">{open === d.id ? "▴" : "▾"}</span>
            </button>
            {open === d.id && (
              <div className="drop-body">
                <ul className="small">
                  {d.ingredients.map((i) => (
                    <li key={i.foodId}>
                      <span className="num">{formatNumber(i.grams)} g</span> {i.name}
                    </li>
                  ))}
                </ul>
                {d.steps.length > 0 && (
                  <ol className="small steps">
                    {d.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                )}
                <p className="tiny muted">Nährwerte aus dem BLS, Mengen roh für eine Portion.</p>
              </div>
            )}
            <div className="row">
              <button type="button" className="primary grow" onClick={() => void logToday(d)} data-testid="drop-log">
                Heute eintragen
              </button>
              <button type="button" className="ghost" onClick={() => void keepAsRecipe(d)}>
                Als Rezept
              </button>
            </div>
          </li>
        ))}
      </ul>
      {answer && answer.hiddenCount > 0 && (
        <p className="tiny muted">
          <span className="num">{answer.hiddenCount}</span> weitere passen heute nicht mehr ins Budget.
        </p>
      )}
    </section>
  );
}
