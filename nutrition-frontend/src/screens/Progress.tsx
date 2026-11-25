import { addDays, dayTotals, formatNumber } from "../lib/day";
import { ratingLabel } from "../lib/copy";
import { useApp, useEntries, useRatings, useTargets } from "../lib/hooks";

/** The last 7 days from the local store: kcal against the target, macros, rating. */
export function Progress({ today }: { today: string }) {
  const { humor } = useApp();
  const from = addDays(today, -6);
  const entries = useEntries(from, today) ?? [];
  const ratings = useRatings(from, today) ?? [];
  const targets = useTargets();
  const target = targets?.targetCalories ?? null;

  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((date) => {
    const list = entries.filter((e) => e.date === date);
    const t = dayTotals(list);
    return { date, count: list.length, ...t.values, estimated: t.estimated.length > 0, rating: ratings.find((r) => r.date === date) ?? null };
  });
  const logged = days.filter((d) => d.count > 0);
  const avg = (k: "kcal" | "proteinG" | "carbsG" | "fatG") => (logged.length ? logged.reduce((s, d) => s + (d[k] ?? 0), 0) / logged.length : null);
  const rated = days.filter((d) => d.rating);
  const avgRating = rated.length ? rated.reduce((s, d) => s + d.rating!.score, 0) / rated.length : null;
  const max = Math.max(target ?? 0, ...days.map((d) => d.kcal ?? 0), 1);
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", timeZone: "UTC" });

  return (
    <div className="screen" data-testid="screen-progress">
      <h1>Fortschritt</h1>
      <section className="card">
        <h2>Letzte 7 Tage</h2>
        <dl className="macro-grid">
          <div>
            <dt>Ø kcal</dt>
            <dd className="num">{formatNumber(avg("kcal"))}</dd>
          </div>
          <div>
            <dt>Ø Protein</dt>
            <dd className="num">{formatNumber(avg("proteinG"))} g</dd>
          </div>
          <div>
            <dt>Ø KH</dt>
            <dd className="num">{formatNumber(avg("carbsG"))} g</dd>
          </div>
          <div>
            <dt>Ø Fett</dt>
            <dd className="num">{formatNumber(avg("fatG"))} g</dd>
          </div>
        </dl>
        <p className="small muted">
          Erfasst an <span className="num">{logged.length}</span> von <span className="num">7</span> Tagen
          {avgRating !== null && (
            <>
              {" · Ø Bewertung "}
              <span className="num">{formatNumber(avgRating, 1)}</span>
            </>
          )}
          {target !== null && (
            <>
              {" · Ziel heute "}
              <span className="num">{formatNumber(target)}</span> kcal
            </>
          )}
        </p>
      </section>

      <section className="card" aria-label="Kalorien pro Tag">
        <h2>Kalorien</h2>
        <div className="week-chart" role="list">
          {days.map((d) => (
            <div key={d.date} className="week-col" role="listitem" aria-label={`${label(d.date)}: ${formatNumber(d.kcal)} kcal`}>
              <span className="num tiny">{d.count ? formatNumber(d.kcal) : "–"}</span>
              <div className="week-track">
                {target !== null && <span className="week-target" style={{ bottom: `${(target / max) * 100}%` }} />}
                <span className={`week-bar ${target !== null && (d.kcal ?? 0) > target ? "over" : ""}`} style={{ height: `${((d.kcal ?? 0) / max) * 100}%` }} />
              </div>
              <span className="tiny muted">{label(d.date)}</span>
            </div>
          ))}
        </div>
        {target !== null && <p className="tiny muted">Linie: heutiges Kalorienziel aus dem Fitnesstracker.</p>}
      </section>

      <section className="card">
        <h2>Tage im Detail</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>kcal</th>
              <th>P</th>
              <th>KH</th>
              <th>F</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.date}>
                <td>{label(d.date)}</td>
                <td className="num">
                  {d.estimated && d.count ? "≈ " : ""}
                  {d.count ? formatNumber(d.kcal) : "–"}
                </td>
                <td className="num">{d.count ? formatNumber(d.proteinG) : "–"}</td>
                <td className="num">{d.count ? formatNumber(d.carbsG) : "–"}</td>
                <td className="num">{d.count ? formatNumber(d.fatG) : "–"}</td>
                <td className="num" title={d.rating ? ratingLabel(d.rating.score, humor) : undefined}>
                  {d.rating?.score ?? "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
