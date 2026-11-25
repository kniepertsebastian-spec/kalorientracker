import { addDays, dayTotals, formatNumber } from "../lib/day";
import { ratingLabel, waterContext } from "../lib/copy";
import { useApp, useBodyTrend, useEntries, useRatings, useTargets } from "../lib/hooks";
import type { BodyTrend } from "../lib/types";

const FITNESS_URL = import.meta.env.VITE_FITNESS_URL ?? "https://fitness.pwa-tree.de";
const signed = (n: number | null, decimals = 0) => (n === null ? "–" : `${n > 0 ? "+" : n < 0 ? "−" : "±"}${formatNumber(Math.abs(n), decimals)}`);
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

/** Sum of (eaten − target) over the logged days, against today's target from the Fitnesstracker. */
export function weekBalance(days: { count: number; kcal: number | null }[], target: number | null): number | null {
  if (target === null) return null;
  const logged = days.filter((d) => d.count > 0 && d.kcal !== null);
  return logged.length ? Math.round(logged.reduce((s, d) => s + (d.kcal! - target), 0)) : null;
}

/** The last 7 days from the local store: kcal against the target, macros, rating; next to them the
 *  weight trend and body water from the Fitnesstracker (cached for offline). */
export function Progress({ today }: { today: string }) {
  const { humor } = useApp();
  const from = addDays(today, -6);
  const entries = useEntries(from, today) ?? [];
  const ratings = useRatings(from, today) ?? [];
  const targets = useTargets();
  const trend = useBodyTrend();
  const target = targets?.targetCalories ?? null;
  const proteinTarget = targets?.targetProteinG ?? null;

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
  const balance = weekBalance(days, target);
  const avgProtein = avg("proteinG");
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", timeZone: "UTC" });

  return (
    <div className="screen" data-testid="screen-progress">
      <h1>Fortschritt</h1>
      <div className="progress-pair">
      <section className="card" data-testid="week-balance">
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
        </p>
        {target !== null && (
          <dl className="kv small">
            <div>
              <dt>Bilanz zum Ziel</dt>
              <dd className="num" data-testid="balance">{balance === null ? "–" : `${signed(balance)} kcal`}</dd>
            </div>
            {proteinTarget !== null && (
              <div>
                <dt>Ø Protein zum Ziel</dt>
                <dd className="num">{avgProtein === null ? "–" : `${signed(Math.round(avgProtein - proteinTarget))} g`}</dd>
              </div>
            )}
            <div>
              <dt>Grundumsatz · Gesamtumsatz · Ziel</dt>
              <dd className="num">
                {formatNumber(targets?.bmr ?? null)} · {formatNumber(targets?.tdee ?? null)} · {formatNumber(target)} kcal
              </dd>
            </div>
          </dl>
        )}
        {target !== null && <p className="tiny muted">Ziele aus dem Fitnesstracker, gemessen am heutigen Ziel. Training ist im Gesamtumsatz schon enthalten und wird nicht extra gutgeschrieben.</p>}
      </section>
      <BodyCard trend={trend} humor={humor} />
      </div>

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

function BodyCard({ trend, humor }: { trend: BodyTrend | null | undefined; humor: boolean }) {
  if (trend === undefined) return null;
  const points = trend?.points ?? [];
  return (
    <section className="card" aria-label="Gewicht und Wasser" data-testid="body-trend">
      <h2>Gewicht</h2>
      {points.length === 0 || !trend ? (
        <p className="small muted">
          {trend ? "Keine Messung in den letzten 30 Tagen." : "Noch keine Daten geladen."} Gewicht und Wasseranteil kommen aus dem{" "}
          <a className="link-btn" href={FITNESS_URL}>Fitnesstracker</a>.
        </p>
      ) : (
        <>
          <dl className="macro-grid three">
            <div>
              <dt>Zuletzt</dt>
              <dd className="num">{formatNumber(trend.latest!.weightKg, 1)} kg</dd>
            </div>
            <div>
              <dt>Ø 7 Tage</dt>
              <dd className="num">{trend.avg7Kg === null ? "–" : `${formatNumber(trend.avg7Kg, 1)} kg`}</dd>
            </div>
            <div>
              <dt>zur Vorwoche</dt>
              <dd className="num" data-testid="weekly-change">{trend.weeklyChangeKg === null ? "–" : `${signed(trend.weeklyChangeKg, 1)} kg`}</dd>
            </div>
          </dl>
          <Sparkline trend={trend} />
          {trend.water ? (
            <p className="small" data-testid="water-context">
              Wasseranteil {shortDate(trend.water.previousDate)} → {shortDate(trend.water.date)}:{" "}
              <span className="num">{signed(trend.water.waterChangePercentPoints, 1)}</span> %-Punkte bei <span className="num">{signed(trend.water.weightChangeKg, 1)}</span> kg.{" "}
              <span className="muted">{waterContext(trend.water.weightChangeKg, trend.water.waterChangePercentPoints, humor)}</span>
            </p>
          ) : (
            <p className="small muted">{waterContext(0, 0, humor)} Für die Wasser-Einordnung braucht es zwei Messungen mit Wasseranteil (Körperanalyse-Waage).</p>
          )}
        </>
      )}
    </section>
  );
}

/** Weight per measured day over the trend window; gaps stay gaps on the time axis. */
function Sparkline({ trend }: { trend: BodyTrend }) {
  const W = 300;
  const H = 72;
  const pad = 6;
  const start = addDays(trend.date, -(trend.days - 1));
  const span = Math.max(trend.days - 1, 1);
  const dayIndex = (d: string) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000);
  const weights = trend.points.map((p) => p.weightKg);
  const lo = Math.min(...weights) - 0.3;
  const hi = Math.max(...weights) + 0.3;
  const x = (d: string) => pad + (dayIndex(d) / span) * (W - 2 * pad);
  const y = (w: number) => pad + (1 - (w - lo) / (hi - lo)) * (H - 2 * pad);
  const line = trend.points.map((p) => `${x(p.date).toFixed(1)},${y(p.weightKg).toFixed(1)}`).join(" ");
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gewichtsverlauf, ${trend.points.length} Messungen in ${trend.days} Tagen, ${formatNumber(Math.min(...weights), 1)} bis ${formatNumber(Math.max(...weights), 1)} kg`}>
      <rect x={x(addDays(trend.date, -6))} y="0" width={W - pad - x(addDays(trend.date, -6))} height={H} className="sparkline-week" />
      {trend.points.length > 1 && <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
      {trend.points.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.weightKg)} r="2.5" fill={p.bodyWaterPercent !== null ? "var(--cyan)" : "var(--accent)"} />
      ))}
    </svg>
  );
}
