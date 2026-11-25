import { useState } from "react";
import { apiFetch, OfflineError } from "../lib/api";
import { useSyncState } from "../lib/sync";
import { useOutboxCount } from "../lib/hooks";

const RANGES = [7, 14, 31, 90] as const;
const FORMATS = [
  { id: "pdf", label: "PDF" },
  { id: "csv", label: "CSV" },
  { id: "md", label: "Markdown" },
  { id: "json", label: "JSON" },
] as const;

/** The export is built by the server from synced data, so it needs a connection. */
export function Export() {
  const { online } = useSyncState();
  const pending = useOutboxCount();
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const [format, setFormat] = useState<(typeof FORMATS)[number]["id"]>("pdf");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch(`/nutrition/export?days=${days}&format=${format}`);
      const blob = await res.blob();
      const name = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `ernaehrung.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage(`${name} heruntergeladen`);
    } catch (e) {
      setMessage(e instanceof OfflineError ? "Offline – der Export braucht eine Verbindung." : e instanceof Error ? e.message : "Export fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen" data-testid="screen-export">
      <h1>Export</h1>
      <section className="card form">
        <h2>Zeitraum</h2>
        <div className="chips" role="radiogroup" aria-label="Zeitraum">
          {RANGES.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={days === d} className={`chip ${days === d ? "on" : ""}`} onClick={() => setDays(d)}>
              <span className="num">{d}</span> Tage
            </button>
          ))}
        </div>
        <h2>Format</h2>
        <div className="chips" role="radiogroup" aria-label="Format">
          {FORMATS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={format === f.id} className={`chip ${format === f.id ? "on" : ""}`} onClick={() => setFormat(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <p className="small muted">Enthält Tagessummen, Mahlzeiten, Ziele aus dem Fitnesstracker und Bewertungen. Geschätzte Werte sind markiert.</p>
        {pending > 0 && online && <p className="small muted">Hinweis: <span className="num">{pending}</span> Änderungen sind noch nicht synchronisiert und fehlen ggf. im Export.</p>}
        {message && <p className="small">{message}</p>}
        <button type="button" className="primary" disabled={busy || !online} onClick={() => void download()}>
          {!online ? "Offline – Export nicht möglich" : busy ? "Wird erstellt …" : "Herunterladen"}
        </button>
      </section>
    </div>
  );
}
