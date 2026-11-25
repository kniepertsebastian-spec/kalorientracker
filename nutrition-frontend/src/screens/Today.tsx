import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { clearRating, copyDay, deleteEntry, relogEntry, setRating, undoDeleteEntry } from "../lib/actions";
import { budgetLine, COPY, MEAL_LABELS, ratingLabel } from "../lib/copy";
import { db } from "../lib/db";
import { addDays, budget as computeBudget, dayTotals, formatNumber, frequentEntries, mealTypeForHour, type Budget } from "../lib/day";
import { useApp, useEntries, useRatings, useTargets, type DayEntry } from "../lib/hooks";
import { MEAL_TYPES, type FoodDto, type MealType } from "../lib/types";
import { SwipeRow } from "../ui/SwipeRow";
import { FoodSheet } from "./FoodSheet";
import { QuickAddSheet } from "./QuickSheets";
import { ScanLearnSheet } from "./ScanLearn";
import { ScanFlow } from "./Scanner";
import { VoiceSheet } from "./Voice";

type Open = null | { kind: "search"; food?: FoodDto } | { kind: "quick" } | { kind: "barcode" } | { kind: "photo" } | { kind: "voice" };

export function Today({ today }: { today: string }) {
  const { humor, badge, toast } = useApp();
  const targets = useTargets();
  const entries = useEntries(today, today);
  const recent = useEntries(addDays(today, -14), addDays(today, -1));
  const yesterdayCount = useLiveQuery(() => db.mealEntries.where("date").equals(addDays(today, -1)).count(), [today]) ?? 0;
  const [open, setOpen] = useState<Open>(null);
  const slot = mealTypeForHour(new Date().getHours());

  const totals = dayTotals(entries ?? []);
  const b = computeBudget(targets ?? null, totals.values);
  const chips = frequentEntries(recent ?? [], slot);

  const removeEntry = async (e: DayEntry) => {
    await deleteEntry(e);
    toast(COPY.deleted(humor), { label: "Rückgängig", run: () => void undoDeleteEntry(e) });
  };

  return (
    <div className="screen" data-testid="screen-today">
      <Hero budget={b} totals={totals.values} estimated={totals.estimated.length > 0} badge={badge} humor={humor} profileMissing={targets !== undefined && !b} onLog={() => setOpen({ kind: "search" })} />

      <section className="quick-actions" aria-label="Schnellaktionen">
        <button type="button" className="tile" onClick={() => setOpen({ kind: "barcode" })}>
          <span aria-hidden="true">▥</span>Barcode
        </button>
        <button type="button" className="tile" onClick={() => setOpen({ kind: "photo" })}>
          <span aria-hidden="true">◉</span>Foto
        </button>
        <button type="button" className="tile" onClick={() => setOpen({ kind: "search" })}>
          <span aria-hidden="true">⌕</span>Suche
        </button>
        <button type="button" className="tile" onClick={() => setOpen({ kind: "voice" })}>
          <span aria-hidden="true">◖</span>Sprache
        </button>
      </section>

      <button type="button" className="ghost wide" onClick={() => setOpen({ kind: "quick" })}>
        + {COPY.quickAdd(humor)}
      </button>

      {chips.length > 0 && (
        <section aria-label="Oft um diese Zeit">
          <h3 className="section">Oft um diese Zeit · {MEAL_LABELS[slot]}</h3>
          <div className="chips">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                className="chip"
                data-testid="time-chip"
                onClick={() => void relogEntry(c.entry, today, slot).then(() => toast(`${c.name} eingetragen`))}
              >
                + {c.name} <span className="num">{formatNumber(c.quantity, c.quantity % 1 ? 1 : 0)} {c.unitLabel}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card" aria-label="Mahlzeiten heute">
        <div className="card-head">
          <h2>Mahlzeiten</h2>
          {yesterdayCount > 0 && (
            <button type="button" className="ghost small-btn" onClick={() => void copyDay(addDays(today, -1), today).then((n) => toast(`${n} Einträge von gestern übernommen`))}>
              Wie gestern übernehmen
            </button>
          )}
        </div>
        {entries && entries.length === 0 && <p className="muted">{COPY.emptyDay(humor)}</p>}
        {MEAL_TYPES.map((m) => {
          const list = (entries ?? []).filter((e) => e.mealType === m);
          if (list.length === 0) return null;
          const kcal = dayTotals(list).values.kcal;
          return (
            <div key={m} className="meal">
              <h3 className="meal-head">
                <span>{MEAL_LABELS[m]}</span>
                <span className="num muted">{formatNumber(kcal)} kcal</span>
              </h3>
              <ul className="entries">
                {list.map((e) => (
                  <SwipeRow key={e.id} label={e.name} onDelete={() => void removeEntry(e)}>
                    <span className="grow">
                      <span className="name">{e.name}</span>
                      <span className="small muted num">
                        {formatNumber(e.quantity, e.quantity % 1 ? 2 : 0)} {e.unitLabel}
                        {e.grams !== null && e.unitLabel !== "g" ? ` · ${formatNumber(e.grams)} g` : ""}
                        {" · "}
                        {formatNumber(e.nutrients.proteinG, 1)} g P
                      </span>
                    </span>
                    <span className="num kcal">
                      {e.estimatedFields.includes("kcal") ? "≈ " : ""}
                      {formatNumber(e.nutrients.kcal)}
                    </span>
                  </SwipeRow>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <RatingBar today={today} />

      {open?.kind === "search" && <FoodSheet date={today} initialMealType={slot} budget={b} initialFood={open.food ?? null} onClose={() => setOpen(null)} />}
      {open?.kind === "quick" && <QuickAddSheet date={today} initialMealType={slot} budget={b} onClose={() => setOpen(null)} />}
      {open?.kind === "barcode" && <ScanFlow date={today} initialMealType={slot} onClose={() => setOpen(null)} />}
      {open?.kind === "photo" && <ScanLearnSheet date={today} initialMealType={slot} onClose={() => setOpen(null)} />}
      {open?.kind === "voice" && <VoiceSheet date={today} initialMealType={slot} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Hero({
  budget,
  totals,
  estimated,
  badge,
  humor,
  profileMissing,
  onLog,
}: {
  budget: Budget | null;
  totals: { kcal: number | null; proteinG: number | null };
  estimated: boolean;
  badge: string;
  humor: boolean;
  profileMissing: boolean;
  onLog: () => void;
}) {
  const over = budget !== null && budget.remainingKcal < 0;
  const delta = (label: string, v: number | null) =>
    v === null ? null : (
      <li>
        <span className="num">{v >= 0 ? `noch ${formatNumber(v)} g` : `+${formatNumber(-v)} g`}</span> {label}
      </li>
    );
  return (
    <section className={`card hero ${over ? "over" : ""}`} aria-label="Restbudget" data-testid="hero">
      <div className="hero-top">
        {badge && <span className="badge">{badge}</span>}
        {estimated && <span className="badge soft" title="Enthält geschätzte oder unvollständige Werte">≈ teils geschätzt</span>}
      </div>
      {budget ? (
        <>
          <p className="hero-number">
            <span className="num" data-testid="kcal-left">
              {formatNumber(Math.abs(budget.remainingKcal))}
            </span>
            <span className="unit">{over ? " kcal drüber" : " kcal offen"}</span>
          </p>
          <div className="bar" role="progressbar" aria-label="Kalorien heute" aria-valuemin={0} aria-valuemax={budget.targetKcal} aria-valuenow={Math.round(totals.kcal ?? 0)}>
            <span style={{ width: `${Math.min(100, budget.progress * 100)}%` }} />
          </div>
          <p className="small muted">
            <span className="num">{formatNumber(totals.kcal)}</span> von <span className="num">{formatNumber(budget.targetKcal)}</span> kcal · {budgetLine(budget, humor)}
          </p>
          <ul className="deltas">
            {delta("Protein", budget.remainingProteinG)}
            {delta("KH", budget.remainingCarbsG)}
            {delta("Fett", budget.remainingFatG)}
          </ul>
        </>
      ) : (
        <>
          <p className="hero-number">
            <span className="num">{formatNumber(totals.kcal)}</span>
            <span className="unit"> kcal heute</span>
          </p>
          <p className="small muted">
            {profileMissing ? "Zielwerte fehlen: Profil im Fitnesstracker ausfüllen. Hier wird nichts geschätzt." : "Zielwerte werden geladen …"}
          </p>
        </>
      )}
      <button type="button" className="primary wide" onClick={onLog}>
        Mahlzeit eintragen
      </button>
    </section>
  );
}

function RatingBar({ today }: { today: string }) {
  const { humor, toast } = useApp();
  const ratings = useRatings(today, today);
  const current = ratings?.[0] ?? null;
  const [note, setNote] = useState(current?.note ?? "");
  useEffect(() => setNote(current?.note ?? ""), [current?.id, current?.note]);

  const rate = async (score: number) => {
    await setRating(today, score, note);
    toast(`${score}/10 · ${ratingLabel(score, humor)}`);
  };

  return (
    <section className="card" aria-label="Tagesbewertung" data-testid="rating">
      <div className="card-head">
        <h2>Wie war der Tag?</h2>
        {current && (
          <span className="badge" data-testid="rating-label">
            <span><span className="num">{current.score}/10</span> · {ratingLabel(current.score, humor)}</span>
          </span>
        )}
      </div>
      <div className="rating" role="radiogroup" aria-label="Bewertung 1 bis 10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={current?.score === s} aria-label={`${s} – ${ratingLabel(s, humor)}`} className={`rate num ${current?.score === s ? "on" : ""}`} onClick={() => void rate(s)}>
            {s}
          </button>
        ))}
      </div>
      <p className="tiny muted rating-scale">{humor ? "1–2 Überlebt · 3–4 War ein Kampf · 5–6 Solide Pflicht · 7–8 Stabile Maschine · 9 Fast perfekt · 10 Endboss-Tag" : "1 = Schlecht … 10 = Sehr gut"}</p>
      <div className="row">
        <input aria-label="Kurznotiz zur Bewertung" placeholder="Kurznotiz (optional)" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} className="grow" />
        {current && note !== (current.note ?? "") && (
          <button type="button" onClick={() => void rate(current.score)}>
            Speichern
          </button>
        )}
        {current && (
          <button type="button" className="ghost" onClick={() => void clearRating(today)}>
            Löschen
          </button>
        )}
      </div>
    </section>
  );
}

export type { MealType };
