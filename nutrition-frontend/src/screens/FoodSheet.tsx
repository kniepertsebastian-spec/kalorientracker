import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { logEntry, toggleFavorite } from "../lib/actions";
import { apiJson, OfflineError } from "../lib/api";
import { COPY, MEAL_LABELS } from "../lib/copy";
import { db, searchKey } from "../lib/db";
import { formatNumber, fractionButtons, snapshotFromFood, snapshotFromRecipe, type Budget } from "../lib/day";
import { useApp } from "../lib/hooks";
import { MEAL_TYPES, type EntrySnapshot, type FoodDto, type MealType, type RecipeDto } from "../lib/types";
import { Sheet } from "../ui/Sheet";

type Picked = { type: "food"; food: FoodDto } | { type: "recipe"; recipe: RecipeDto };

export function unitsFor(food: FoodDto): string[] {
  const units: string[] = [];
  if (food.basis === "PER_100G" || food.densityGPerMl) units.push("g");
  if (food.basis === "PER_100ML" || food.densityGPerMl) units.push("ml");
  for (const u of food.units) if (!units.includes(u.label)) units.push(u.label);
  return units;
}

function useFoodSearch(q: string) {
  const [remote, setRemote] = useState<{ q: string; items: FoodDto[]; offline: boolean } | null>(null);
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      apiJson<{ items: FoodDto[] }>(`/nutrition/foods/search?q=${encodeURIComponent(term)}&limit=20`)
        .then((r) => !cancelled && setRemote({ q: term, items: r.items, offline: false }))
        .catch((e) => !cancelled && setRemote({ q: term, items: [], offline: e instanceof OfflineError || !navigator.onLine }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term]);
  const local = useLiveQuery(async () => {
    if (term.length < 2) return [];
    const key = searchKey(term);
    return db.foods.filter((f) => f.searchName.includes(key)).limit(20).toArray();
  }, [term]);
  const remoteItems = remote && remote.q === term ? remote.items : [];
  // Cached foods first (they work offline), then the server's further hits.
  const seen = new Set((local ?? []).map((f) => f.id));
  return { items: [...(local ?? []), ...remoteItems.filter((f) => !seen.has(f.id))], offline: remote?.q === term && remote.offline, loading: term.length >= 2 && remote?.q !== term };
}

interface Props {
  title?: string;
  date?: string;
  initialMealType?: MealType;
  budget?: Budget | null;
  /** "pick": hand the chosen food and amount back (recipe editor) instead of logging it. */
  onPick?: (food: FoodDto, quantity: number, unitLabel: string) => void;
  allowRecipes?: boolean;
  initialFood?: FoodDto | null;
  onClose: () => void;
}

export function FoodSheet({ title = "Lebensmittel suchen", date, initialMealType = "SNACK", budget, onPick, allowRecipes = true, initialFood = null, onClose }: Props) {
  const { humor, toast } = useApp();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Picked | null>(initialFood ? { type: "food", food: initialFood } : null);
  const { items, offline, loading } = useFoodSearch(q);

  const prefs = useLiveQuery(() => db.foodPrefs.toArray(), []) ?? [];
  const recentAndFav = useLiveQuery(async () => {
    const all = await db.foodPrefs.orderBy("lastUsedAt").reverse().toArray();
    const foods = await db.foods.bulkGet(all.map((p) => p.foodId));
    const pairs = all.map((p, i) => ({ pref: p, food: foods[i] })).filter((x): x is { pref: typeof x.pref; food: NonNullable<typeof x.food> } => !!x.food);
    return { favorites: pairs.filter((x) => x.pref.favorite), recent: pairs.filter((x) => x.pref.useCount > 0).slice(0, 8) };
  }, []);
  const recipes = useLiveQuery(() => (allowRecipes && !onPick ? db.recipes.orderBy("name").toArray() : []), [allowRecipes, onPick]) ?? [];
  const term = searchKey(q);
  const matchingRecipes = term.length >= 2 ? recipes.filter((r) => searchKey(r.name).includes(term)) : [];

  if (picked) {
    return (
      <Sheet title={picked.type === "food" ? picked.food.name : picked.recipe.name} onClose={onClose}>
        <AmountStep
          picked={picked}
          pref={picked.type === "food" ? prefs.find((p) => p.foodId === picked.food.id) : undefined}
          date={date}
          initialMealType={initialMealType}
          budget={budget}
          onPick={onPick}
          onBack={() => setPicked(null)}
          onDone={() => {
            toast(navigator.onLine ? COPY.synced(humor) : COPY.savedOffline(humor));
            onClose();
          }}
        />
      </Sheet>
    );
  }

  const row = (food: FoodDto, favorite?: boolean) => (
    <li key={food.id}>
      <button type="button" className="list-row" onClick={() => setPicked({ type: "food", food })}>
        <span className="grow">
          <span className="name">{food.name}</span>
          <span className="small muted">
            {food.brand ? `${food.brand} · ` : ""}
            <span className="num">{formatNumber(food.per100.kcal)}</span> kcal / 100 {food.basis === "PER_100ML" ? "ml" : "g"} · {food.source === "USER" ? "Eigen" : food.source}
          </span>
        </span>
        {favorite && <span aria-label="Favorit">★</span>}
      </button>
    </li>
  );

  return (
    <Sheet title={title} onClose={onClose}>
      <input
        type="search"
        className="search"
        placeholder="z. B. Magerquark, Haferflocken …"
        aria-label="Lebensmittel suchen"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {term.length < 2 ? (
        <>
          {(recentAndFav?.favorites.length ?? 0) > 0 && (
            <section>
              <h3 className="section">Favoriten</h3>
              <ul className="list">{recentAndFav!.favorites.map((x) => row(x.food, true))}</ul>
            </section>
          )}
          {(recentAndFav?.recent.length ?? 0) > 0 && (
            <section>
              <h3 className="section">Zuletzt verwendet</h3>
              <ul className="list">{recentAndFav!.recent.map((x) => row(x.food, !!x.pref.favorite))}</ul>
            </section>
          )}
          {recipes.length > 0 && (
            <section>
              <h3 className="section">Rezepte</h3>
              <ul className="list">
                {recipes.slice(0, 6).map((r) => (
                  <li key={r.id}>
                    <button type="button" className="list-row" onClick={() => setPicked({ type: "recipe", recipe: r })}>
                      <span className="grow">
                        <span className="name">{r.name}</span>
                        <span className="small muted">Rezept</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!recentAndFav?.recent.length && !recentAndFav?.favorites.length && <p className="muted small">Tippe mindestens zwei Buchstaben. Eigene Lebensmittel, BLS und Open Food Facts werden durchsucht.</p>}
        </>
      ) : (
        <ul className="list" aria-busy={loading}>
          {matchingRecipes.map((r) => (
            <li key={r.id}>
              <button type="button" className="list-row" onClick={() => setPicked({ type: "recipe", recipe: r })}>
                <span className="grow">
                  <span className="name">{r.name}</span>
                  <span className="small muted">Rezept</span>
                </span>
              </button>
            </li>
          ))}
          {items.map((f) => row(f, prefs.some((p) => p.foodId === f.id && p.favorite)))}
          {!loading && items.length === 0 && matchingRecipes.length === 0 && (
            <li className="muted small">{offline ? "Offline: nur bereits verwendete Lebensmittel sind durchsuchbar." : "Nichts gefunden."}</li>
          )}
        </ul>
      )}
    </Sheet>
  );
}

function AmountStep({
  picked,
  pref,
  date,
  initialMealType,
  budget,
  onPick,
  onBack,
  onDone,
}: {
  picked: Picked;
  pref?: { lastQuantity: number; lastUnit: string; favorite: 0 | 1 };
  date?: string;
  initialMealType: MealType;
  budget?: Budget | null;
  onPick?: Props["onPick"];
  onBack: () => void;
  onDone: () => void;
}) {
  const units = picked.type === "food" ? unitsFor(picked.food) : [...(picked.recipe.servings ? ["Portion"] : []), "g"];
  // Smart default: the amount used last time for this food.
  const defaultUnit = pref && units.includes(pref.lastUnit) ? pref.lastUnit : units[0]!;
  const defaultQty = pref && units.includes(pref.lastUnit) ? pref.lastQuantity : defaultUnit === "g" || defaultUnit === "ml" ? 100 : 1;
  const [quantity, setQuantity] = useState(String(defaultQty));
  const [unit, setUnit] = useState(defaultUnit);
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qty = Number(quantity.replace(",", "."));

  const snap: EntrySnapshot | null = useMemo(() => {
    if (!Number.isFinite(qty) || qty < 0) return null;
    try {
      return picked.type === "food" ? snapshotFromFood(picked.food, qty, unit) : snapshotFromRecipe(picked.recipe, qty, unit);
    } catch {
      return null;
    }
  }, [picked, qty, unit]);

  const submit = async () => {
    if (!snap || qty <= 0) return setError("Bitte eine Menge über 0 eingeben.");
    setBusy(true);
    try {
      if (onPick && picked.type === "food") onPick(picked.food, qty, unit);
      else await logEntry({ date: date!, mealType, source: picked, quantity: qty, unitLabel: unit });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  const fractions = picked.type === "food" ? fractionButtons(picked.food) : [];
  const est = (k: keyof EntrySnapshot) => (snap?.estimatedFields.includes(k as never) ? "≈ " : "");

  return (
    <div className="amount">
      <div className="amount-row">
        <label className="grow">
          Menge
          <input inputMode="decimal" className="num big-input" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="Menge" />
        </label>
        <label>
          Einheit
          <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Einheit">
            {units.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>
      {fractions.length > 0 && (
        <div className="chips" role="group" aria-label="Schnellmengen">
          {fractions.map((f) => (
            <button
              key={f.label}
              type="button"
              className={`chip ${unit === f.unitLabel && qty === f.quantity ? "on" : ""}`}
              onClick={() => {
                setUnit(f.unitLabel);
                setQuantity(String(f.quantity));
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <dl className="macro-grid" data-testid="amount-preview">
        <div>
          <dt>kcal</dt>
          <dd className="num">
            {est("kcal")}
            {formatNumber(snap?.kcal ?? null)}
          </dd>
        </div>
        <div>
          <dt>Protein</dt>
          <dd className="num">
            {est("proteinG")}
            {formatNumber(snap?.proteinG ?? null, 1)} g
          </dd>
        </div>
        <div>
          <dt>KH</dt>
          <dd className="num">
            {est("carbsG")}
            {formatNumber(snap?.carbsG ?? null, 1)} g
          </dd>
        </div>
        <div>
          <dt>Fett</dt>
          <dd className="num">
            {est("fatG")}
            {formatNumber(snap?.fatG ?? null, 1)} g
          </dd>
        </div>
      </dl>
      {snap === null && Number.isFinite(qty) && <p className="small danger">Diese Einheit lässt sich für dieses Lebensmittel nicht umrechnen.</p>}

      {budget && !onPick && snap && (
        <p className="live-budget" data-testid="live-budget">
          Danach: <span className="num">{formatNumber(budget.remainingKcal - (snap.kcal ?? 0))}</span> kcal offen
          {budget.remainingProteinG !== null && (
            <>
              {" · "}
              <span className="num">{formatNumber(Math.max(0, budget.remainingProteinG - (snap.proteinG ?? 0)))}</span> g Protein offen
            </>
          )}
        </p>
      )}

      {!onPick && (
        <div className="chips" role="radiogroup" aria-label="Mahlzeit">
          {MEAL_TYPES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mealType === m} className={`chip ${mealType === m ? "on" : ""}`} onClick={() => setMealType(m)}>
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>
      )}

      {error && <p className="small danger">{error}</p>}
      <div className="row">
        <button type="button" className="ghost" onClick={onBack}>
          Zurück
        </button>
        {picked.type === "food" && !onPick && (
          <button type="button" className="ghost" aria-pressed={!!pref?.favorite} onClick={() => void toggleFavorite(picked.food)}>
            {pref?.favorite ? "★ Favorit" : "☆ Favorit"}
          </button>
        )}
        <button type="button" className="primary grow" disabled={busy || !snap || qty <= 0} onClick={() => void submit()}>
          {onPick ? "Übernehmen" : "Eintragen"}
        </button>
      </div>
      {picked.type === "food" && picked.food.attribution && <p className="tiny muted">{picked.food.attribution}</p>}
    </div>
  );
}
