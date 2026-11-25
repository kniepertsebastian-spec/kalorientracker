import { useState } from "react";
import { db } from "../lib/db";
import { formatNumber } from "../lib/day";
import { useApp, useFailed, useOutboxCount } from "../lib/hooks";
import { discardFailed, retryFailed, syncNow, useSyncState } from "../lib/sync";
import type { User } from "../lib/api";
import { useLiveQuery } from "dexie-react-hooks";

const FITNESS_URL = import.meta.env.VITE_FITNESS_URL ?? "https://fitness.pwa-tree.de";

export function More({
  user,
  onHumor,
  onBadge,
  onLogout,
}: {
  user: User;
  onHumor: (on: boolean) => void;
  onBadge: (text: string) => void;
  onLogout: () => Promise<void>;
}) {
  const { humor, badge } = useApp();
  const { online, syncing, lastSyncAt } = useSyncState();
  const pending = useOutboxCount();
  const failed = useFailed();
  const counts = useLiveQuery(async () => ({ foods: await db.foods.count(), entries: await db.mealEntries.count() }), []);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="screen" data-testid="screen-more">
      <h1>Mehr</h1>

      <section className="card form">
        <h2>Darstellung</h2>
        <label className="switch">
          <span className="grow">
            Humor-Modus
            <span className="small muted block">Trockene Sprüche in Statusmeldungen und Bewertung. Aus: nur Fakten.</span>
          </span>
          <input type="checkbox" role="switch" checked={humor} onChange={(e) => onHumor(e.target.checked)} data-testid="humor-toggle" />
        </label>
        <label>
          Badge auf der Heute-Karte
          <input value={badge} maxLength={40} placeholder="leer = kein Badge" onChange={(e) => onBadge(e.target.value)} />
        </label>
      </section>

      <section className="card">
        <h2>Synchronisierung</h2>
        <p className="small muted">
          {online ? "Online" : "Offline"} · <span className="num">{pending}</span> ausstehend · <span className="num">{failed.length}</span> fehlgeschlagen
          {lastSyncAt && <> · zuletzt {new Date(lastSyncAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</>}
        </p>
        {counts && (
          <p className="tiny muted">
            Lokal gespeichert: <span className="num">{formatNumber(counts.entries)}</span> Einträge, <span className="num">{formatNumber(counts.foods)}</span> Lebensmittel
          </p>
        )}
        {failed.map((f) => (
          <div key={f.seq} className="failed">
            <strong>{f.label}</strong>
            <span className="small danger">{f.reason}</span>
            <div className="row">
              <button type="button" onClick={() => void retryFailed(f)}>
                Erneut versuchen
              </button>
              <button type="button" className="ghost" onClick={() => void discardFailed(f)}>
                Verwerfen
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="ghost" disabled={!online || syncing} onClick={() => void syncNow().catch(() => undefined)}>
          Jetzt synchronisieren
        </button>
      </section>

      <section className="card">
        <h2>Konto</h2>
        <p className="small muted">
          Angemeldet als {user.displayName ?? user.firstName ?? "du"}. Zielkalorien, Protein und Phase kommen aus dem Fitnesstracker.
        </p>
        <a className="link-btn" href={FITNESS_URL}>
          Fitnesstracker öffnen ↗
        </a>
        {confirmLogout && pending > 0 && (
          <p className="small danger">
            <span className="num">{pending}</span> Änderungen sind noch nicht synchronisiert und gehen beim Abmelden verloren.
          </p>
        )}
        <button
          type="button"
          className={confirmLogout ? "danger-btn" : "ghost"}
          disabled={busy}
          onClick={() => {
            if (pending > 0 && !confirmLogout) return setConfirmLogout(true);
            setBusy(true);
            void onLogout().finally(() => setBusy(false));
          }}
        >
          {confirmLogout && pending > 0 ? "Trotzdem abmelden" : "Abmelden (beide Apps)"}
        </button>
      </section>

      <section className="card">
        <h2>Quellen</h2>
        <p className="tiny muted">
          Nährwerte: eigene Lebensmittel, Bundeslebensmittelschlüssel (BLS 4.0, Max Rubner-Institut) und Open Food Facts (ODbL, openfoodfacts.org). „≈“ markiert geschätzte oder unvollständige Werte.
        </p>
      </section>
    </div>
  );
}
