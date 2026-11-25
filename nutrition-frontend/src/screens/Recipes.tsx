import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { calculateDraft, deleteRecipe, saveRecipe, splitRecipeOverDays, type DraftIngredient, type RecipeDraft } from "../lib/actions";
import { apiJson } from "../lib/api";
import { COPY, MEAL_LABELS } from "../lib/copy";
import { cacheFood, db } from "../lib/db";
import { addDays, formatNumber } from "../lib/day";
import { useApp } from "../lib/hooks";
import { roundTo, type NutrientValues } from "../lib/nutrients";
import { MEAL_TYPES, type FoodDto, type MealType, type RecipeDto } from "../lib/types";
import { Sheet } from "../ui/Sheet";
import { importApi, takeShare, type PendingShare, type RecipeImportDto } from "../lib/capture";
import { FoodSheet } from "./FoodSheet";
import { ImportReview, RecipeImportSheet } from "./RecipeImport";
import { WeeklyDrops } from "./WeeklyDrops";

type View =
  | { mode: "list" }
  | { mode: "edit"; draft: RecipeDraft; importId?: string }
  | { mode: "prep"; recipe: RecipeDto }
  | { mode: "import"; share: PendingShare | null }
  | { mode: "review"; dto: RecipeImportDto };

export function Recipes({ today }: { today: string }) {
  const { toast, humor } = useApp();
  const recipes = useLiveQuery(() => db.recipes.orderBy("name").toArray(), []);
  const [view, setView] = useState<View>({ mode: "list" });

  // A link shared into the app lands here (main.tsx keeps it and opens this tab).
  useEffect(() => {
    const share = takeShare();
    if (share) setView({ mode: "import", share });
  }, []);

  const edit = async (r: RecipeDto) => {
    // Editing needs the ingredient foods; they are cached once used, else fetched.
    const ingredients: DraftIngredient[] = [];
    for (const i of r.ingredients) {
      let food: FoodDto | undefined = i.foodId ? await db.foods.get(i.foodId) : undefined;
      if (!food && i.foodId) {
        try {
          food = await apiJson<FoodDto>(`/nutrition/foods/${i.foodId}`);
          await cacheFood(food);
        } catch {
          return toast(`„${i.name}“ ist offline nicht verfügbar. Online erneut versuchen.`);
        }
      }
      if (!food) return toast(`„${i.name}“ gibt es nicht mehr.`);
      ingredients.push({ food, quantity: i.quantity, unitLabel: i.unitLabel });
    }
    setView({ mode: "edit", draft: { id: r.id, name: r.name, note: r.note, servings: r.servings, finalWeightG: r.finalWeightG, ingredients } });
  };

  if (view.mode === "edit") return <RecipeEditor initial={view.draft} importId={view.importId} onDone={() => setView({ mode: "list" })} />;
  if (view.mode === "review") return <ImportReview dto={view.dto} onCancel={() => setView({ mode: "list" })} onContinue={(draft) => setView({ mode: "edit", draft, importId: view.dto.id })} />;

  return (
    <div className="screen" data-testid="screen-recipes">
      <div className="card-head">
        <h1>Rezepte</h1>
        <button type="button" className="primary" onClick={() => setView({ mode: "edit", draft: { name: "", servings: null, finalWeightG: null, ingredients: [] } })}>
          + Neues Rezept
        </button>
      </div>
      <button type="button" className="ghost wide" onClick={() => setView({ mode: "import", share: null })} data-testid="open-import">
        ⇣ Importieren: Link, Foto, Video oder Text
      </button>
      {recipes && recipes.length === 0 && <p className="muted">{COPY.emptyRecipes(humor)}</p>}
      <ul className="list">
        {(recipes ?? []).map((r) => (
          <li key={r.id} className="card recipe-card">
            <div className="grow">
              <strong>{r.name}</strong>
              <p className="small muted">
                <span className="num">{formatNumber(r.totals.kcal)}</span> kcal gesamt · <span className="num">{formatNumber(r.effectiveWeightG)}</span> g {r.weightSource === "final" ? "Endgewicht" : "Rohgewicht (kein Endgewicht)"}
                {r.per100g && (
                  <>
                    {" · "}
                    <span className="num">{formatNumber(r.per100g.kcal)}</span> kcal/100 g
                  </>
                )}
                {r.perServing && r.servings && (
                  <>
                    {" · "}
                    <span className="num">{formatNumber(r.perServing.kcal)}</span> kcal/Portion
                  </>
                )}
              </p>
            </div>
            <div className="row">
              <button type="button" className="ghost" onClick={() => void edit(r)}>
                Bearbeiten
              </button>
              <button type="button" className="ghost" onClick={() => setView({ mode: "prep", recipe: r })}>
                Meal-Prep
              </button>
            </div>
          </li>
        ))}
      </ul>
      <WeeklyDrops today={today} />
      {view.mode === "import" && <RecipeImportSheet share={view.share} onReview={(dto) => setView({ mode: "review", dto })} onClose={() => setView({ mode: "list" })} />}
      {view.mode === "prep" && <MealPrepSheet recipe={view.recipe} today={today} onClose={() => setView({ mode: "list" })} />}
    </div>
  );
}

function NumberInput({ label, value, onChange, suffix }: { label: string; value: number | null; onChange: (v: number | null) => void; suffix?: string }) {
  const [text, setText] = useState(value === null ? "" : String(value).replace(".", ","));
  return (
    <label>
      {label}
      <span className="with-suffix">
        <input
          inputMode="decimal"
          className="num"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value.replace(",", "."));
            onChange(e.target.value.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : n);
          }}
        />
        {suffix && <span className="muted small">{suffix}</span>}
      </span>
    </label>
  );
}

function Macros({ n, label }: { n: NutrientValues | null; label: string }) {
  if (!n) return null;
  const est = (k: keyof NutrientValues["values"]) => (n.estimated.includes(k) ? "≈ " : "");
  return (
    <div className="macro-line">
      <span className="small muted">{label}</span>
      <span className="num">
        {est("kcal")}
        {formatNumber(n.values.kcal)} kcal · {est("proteinG")}
        {formatNumber(n.values.proteinG, 1)} P · {est("carbsG")}
        {formatNumber(n.values.carbsG, 1)} KH · {est("fatG")}
        {formatNumber(n.values.fatG, 1)} F
      </span>
    </div>
  );
}

function RecipeEditor({ initial, importId, onDone }: { initial: RecipeDraft; importId?: string; onDone: () => void }) {
  const { toast } = useApp();
  const [draft, setDraft] = useState<RecipeDraft>(initial);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calc = useMemo(() => {
    try {
      return calculateDraft(draft);
    } catch (e) {
      return e instanceof Error ? e : new Error("Berechnung fehlgeschlagen");
    }
  }, [draft]);

  const save = async () => {
    if (!draft.name.trim()) return setError("Bitte einen Namen eingeben.");
    if (draft.ingredients.length === 0) return setError("Mindestens eine Zutat.");
    if (calc instanceof Error) return setError(calc.message);
    await saveRecipe(draft);
    // The import's draft has served its purpose once the recipe exists.
    if (importId) void importApi.remove(importId).catch(() => undefined);
    toast("Rezept gespeichert");
    onDone();
  };

  return (
    <div className="screen" data-testid="recipe-editor">
      <div className="card-head">
        <h1>{initial.id ? "Rezept bearbeiten" : "Neues Rezept"}</h1>
        <button type="button" className="ghost" onClick={onDone}>
          Abbrechen
        </button>
      </div>
      <section className="card form">
        <label>
          Name
          <input value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="z. B. Protein-Pasta" />
        </label>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Zutaten (roh)</h2>
          <button type="button" onClick={() => setAdding(true)}>
            + Zutat
          </button>
        </div>
        {draft.ingredients.length === 0 && <p className="muted small">Zutaten im Rohzustand eintragen, also vor dem Kochen gewogen.</p>}
        <ul className="list">
          {draft.ingredients.map((i, idx) => {
            const r = calc instanceof Error ? null : calc.ingredients[idx];
            return (
              <li key={idx} className="list-row static">
                <span className="grow">
                  <span className="name">{i.food.name}</span>
                  <span className="small muted num">
                    {formatNumber(i.quantity, i.quantity % 1 ? 2 : 0)} {i.unitLabel}
                    {r && i.unitLabel !== "g" ? ` · ${r.weightEstimated ? "≈ " : ""}${formatNumber(r.rawWeightG, 1)} g` : ""}
                    {r ? ` · ${formatNumber(r.nutrients.values.kcal)} kcal` : ""}
                  </span>
                </span>
                <button type="button" className="icon" aria-label={`${i.food.name} entfernen`} onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, j) => j !== idx) })}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card form">
        <h2>Fertiges Gericht</h2>
        <NumberInput label="Endgewicht nach dem Kochen" suffix="g" value={draft.finalWeightG} onChange={(v) => setDraft({ ...draft, finalWeightG: v })} />
        <NumberInput label="Portionen (optional)" value={draft.servings} onChange={(v) => setDraft({ ...draft, servings: v === null ? null : Math.round(v) })} />
        {calc instanceof Error ? (
          <p className="small danger">{calc.message}</p>
        ) : (
          draft.ingredients.length > 0 && (
            <div className="calc" data-testid="recipe-calc">
              <Macros n={calc.totals} label="Gesamt (aus Rohzutaten)" />
              <p className="small muted">
                Rohgewicht <span className="num">{calc.totalWeightEstimated ? "≈ " : ""}{formatNumber(calc.totalRawWeightG)} g</span>
                {calc.weightSource === "final" ? (
                  <>
                    {" → Endgewicht "}
                    <span className="num">{formatNumber(calc.effectiveWeightG)} g</span>
                    {calc.cookingChangePercent !== null && (
                      <>
                        {" ("}
                        <span className="num">
                          {calc.cookingChangePercent > 0 ? "+" : ""}
                          {formatNumber(roundTo(calc.cookingChangePercent, 0))} %
                        </span>
                        {")"}
                      </>
                    )}
                  </>
                ) : (
                  " · ohne Endgewicht wird das Rohgewicht verwendet"
                )}
              </p>
              <Macros n={calc.per100g} label="pro 100 g fertig" />
              <Macros n={calc.perServing} label={`pro Portion${calc.servingWeightG ? ` (${formatNumber(calc.servingWeightG)} g)` : ""}`} />
            </div>
          )
        )}
      </section>

      {error && <p className="small danger">{error}</p>}
      <div className="row">
        {initial.id && (
          <button
            type="button"
            className="ghost danger"
            onClick={() => {
              const r = { id: initial.id!, name: initial.name } as RecipeDto;
              void deleteRecipe(r).then(() => {
                toast("Rezept gelöscht");
                onDone();
              });
            }}
          >
            Löschen
          </button>
        )}
        <button type="button" className="primary grow" onClick={() => void save()}>
          Speichern
        </button>
      </div>

      {adding && (
        <FoodSheet
          title="Zutat hinzufügen"
          allowRecipes={false}
          onPick={(food, quantity, unitLabel) => setDraft((d) => ({ ...d, ingredients: [...d.ingredients, { food, quantity, unitLabel }] }))}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function MealPrepSheet({ recipe, today, onClose }: { recipe: RecipeDto; today: string; onClose: () => void }) {
  const { toast } = useApp();
  const options = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const [days, setDays] = useState<string[]>([today, addDays(today, 1), addDays(today, 2)]);
  const [mealType, setMealType] = useState<MealType>("LUNCH");
  const per = days.length ? recipe.effectiveWeightG / days.length : 0;
  const weekday = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", timeZone: "UTC" });

  return (
    <Sheet title={`Meal-Prep: ${recipe.name}`} onClose={onClose}>
      <div className="form">
        <p className="small muted">Das fertige Gericht (<span className="num">{formatNumber(recipe.effectiveWeightG)} g</span>) wird gleichmäßig auf die gewählten Tage verteilt.</p>
        <div className="chips" role="group" aria-label="Tage">
          {options.map((d) => (
            <button key={d} type="button" aria-pressed={days.includes(d)} className={`chip ${days.includes(d) ? "on" : ""}`} onClick={() => setDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort()))}>
              {d === today ? "Heute" : weekday(d)}
            </button>
          ))}
        </div>
        <div className="chips" role="radiogroup" aria-label="Mahlzeit">
          {MEAL_TYPES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mealType === m} className={`chip ${mealType === m ? "on" : ""}`} onClick={() => setMealType(m)}>
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>
        {days.length > 0 && (
          <p className="live-budget">
            <span className="num">{days.length}</span> × <span className="num">{formatNumber(per)} g</span> ≈ <span className="num">{formatNumber(recipe.per100g?.kcal != null ? (recipe.per100g.kcal * per) / 100 : null)}</span> kcal pro Tag
          </p>
        )}
        <button
          type="button"
          className="primary"
          disabled={days.length === 0}
          onClick={() =>
            void splitRecipeOverDays(recipe, days, mealType).then(() => {
              toast(`Auf ${days.length} Tage verteilt`);
              onClose();
            })
          }
        >
          Eintragen
        </button>
      </div>
    </Sheet>
  );
}
