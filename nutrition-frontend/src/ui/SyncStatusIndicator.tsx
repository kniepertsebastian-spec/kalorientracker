import { useEffect, useId, useRef, useState } from "react";
import { useFailed, useOutboxCount } from "../lib/hooks";
import { discardFailed, retryFailed, syncNow, useSyncState } from "../lib/sync";

// Always visible, like the Fitnesstracker's: an all-clear needs its own signal, not just the absence
// of a warning. Priority: failed > offline > syncing > pending > synced. The pill opens a non-modal
// panel (Escape or a tap outside closes it) with the failed changes and their way out.
export function SyncStatusIndicator() {
  const { online, syncing, authLost } = useSyncState();
  const pending = useOutboxCount();
  const failed = useFailed();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const suffix = pending > 0 ? ` · ${pending}` : "";
  const pill =
    failed.length > 0
      ? { text: `${failed.length} fehlgeschlagen`, tone: "failed" }
      : authLost
        ? { text: "Anmeldung nötig", tone: "failed" }
        : !online
          ? { text: `Offline${suffix}`, tone: "offline" }
          : syncing
            ? { text: `Synchronisiert…${suffix}`, tone: "syncing" }
            : pending > 0
              ? { text: `${pending} ausstehend`, tone: "pending" }
              : { text: "Synchronisiert", tone: "synced" };

  const detail =
    failed.length > 0
      ? "Einige Änderungen hat der Server abgelehnt. Lokal sind sie noch da."
      : authLost
        ? "Die Sitzung ist abgelaufen. Nach dem Anmelden wird alles Ausstehende synchronisiert."
        : !online
          ? `Keine Verbindung. Änderungen werden lokal gespeichert${pending ? ` (${pending} wartend)` : ""} und automatisch synchronisiert.`
          : pending > 0
            ? `${pending} Änderung${pending === 1 ? "" : "en"} wird synchronisiert.`
            : "Alle Änderungen sind synchronisiert.";

  return (
    <div ref={ref} className="sync">
      <button
        ref={trigger}
        type="button"
        className={`pill pill-${pill.tone}`}
        data-testid="sync-status"
        data-tone={pill.tone}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="dot" aria-hidden="true" />
        <span className="num">{pill.text}</span>
      </button>
      {open && (
        <div id={panelId} role="dialog" aria-label="Synchronisierung" className="sync-panel">
          <p className="muted small">{detail}</p>
          {online && !syncing && (
            <button type="button" className="ghost" onClick={() => void syncNow().catch(() => undefined)}>
              Jetzt synchronisieren
            </button>
          )}
          {failed.map((f) => (
            <div key={f.seq} className="failed" data-testid="failed-op">
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
        </div>
      )}
    </div>
  );
}
