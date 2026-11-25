import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecipeDraft } from "../lib/actions";
import { candidateToFood, importApi, importNote, isPending, pickUnit, VIDEO_MAX_BYTES, type CaptureStatus, type PendingShare, type RecipeImportDto } from "../lib/capture";
import { COPY, failureText } from "../lib/copy";
import { cacheFood } from "../lib/db";
import { formatNumber, snapshotFromFood } from "../lib/day";
import { useApp } from "../lib/hooks";
import { Sheet } from "../ui/Sheet";
import { unitsFor } from "./FoodSheet";
import { shrinkImage } from "./ScanLearn";

type Source = "link" | "photo" | "video" | "text";

const PLATFORM: Record<string, string> = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", web: "Webseite" };
const STATUS_LABEL: Record<RecipeImportDto["status"], string> = {
  PREVIEW_PENDING: "Vorschau lädt",
  PREVIEW_READY: "Vorschau bereit",
  EXTRACT_PENDING: "In der Warteschlange",
  EXTRACTING: "Wird analysiert",
  READY: "Entwurf bereit",
  FAILED: "Fehlgeschlagen",
};

/** Polls one import while the worker is on it: every 1.5 s, after a minute every 5 s. */
function useImport(id: string | null, rev: number) {
  const [dto, setDto] = useState<RecipeImportDto | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const tick = async () => {
      try {
        const next = await importApi.get(id);
        if (cancelled) return;
        setDto(next);
        setError(null);
        if (isPending(next.status)) timer = setTimeout(() => void tick(), Date.now() - started > 60_000 ? 5000 : 1500);
      } catch (e) {
        if (cancelled) return;
        setError(e);
        timer = setTimeout(() => void tick(), 5000);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, rev]);
  return { dto, setDto, error };
}

/**
 * Recipe import: a link (shared into the app or pasted) first gets a free preview (title, platform;
 * no AI), the analysis starts only on confirm and runs as a background job. Photo, video and text
 * are the fallbacks when a link cannot be read.
 */
export function RecipeImportSheet({ share, onReview, onClose }: { share?: PendingShare | null; onReview: (dto: RecipeImportDto) => void; onClose: () => void }) {
  const { humor } = useApp();
  const [source, setSource] = useState<Source>(share && !share.url && share.text ? "text" : "link");
  const [url, setUrl] = useState(share?.url ?? "");
  const [text, setText] = useState(share && !share.url ? (share.text ?? "") : "");
  const [title, setTitle] = useState(share?.title ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const { dto, setDto, error: pollError } = useImport(activeId, rev);
  const [recent, setRecent] = useState<RecipeImportDto[] | null>(null);

  const loadRecent = useCallback(() => {
    importApi
      .list()
      .then((r) => setRecent(r.items))
      .catch(() => setRecent([]));
  }, []);
  useEffect(loadRecent, [loadRecent]);

  // A shared link starts its free preview right away.
  useEffect(() => {
    if (share?.url) void start(() => importApi.fromUrl(share.url!));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (call: () => Promise<RecipeImportDto>) => {
    setBusy(true);
    setError(null);
    try {
      const created = await call();
      setDto(created);
      setActiveId(created.id);
    } catch (e) {
      setError(failureText(e, humor));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (source === "link") return start(() => importApi.fromUrl(url.trim()));
    if (source === "text") return start(() => importApi.fromText(text, title));
    if (!file) return;
    if (source === "video" && file.size > VIDEO_MAX_BYTES) return setError(`Das Video ist zu groß (max. ${Math.round(VIDEO_MAX_BYTES / 1024 / 1024)} MB). Kürzer aufnehmen oder den Text einfügen.`);
    if (source === "photo") return start(async () => importApi.fromPhoto(await shrinkImage(file, 2400), title));
    return start(() => importApi.fromVideo(file, title));
  };

  const confirm = async () => {
    if (!dto) return;
    setBusy(true);
    try {
      setDto(await importApi.confirm(dto.id));
      setRev((n) => n + 1); // polls again, now for the analysis
    } catch (e) {
      setError(failureText(e, humor));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    !busy &&
    ((source === "link" && /^https?:\/\/\S+\.\S+/i.test(url.trim())) || (source === "text" && text.trim().length >= 20) || ((source === "photo" || source === "video") && !!file));

  return (
    <Sheet title="Rezept importieren" onClose={onClose}>
      {dto ? (
        <div className="form" data-testid="import-status">
          <ImportCard dto={dto} />
          {dto.status === "PREVIEW_READY" && (
            <>
              <p className="small muted">Die Vorschau ist kostenlos. Erst „Analysieren“ startet das Auslesen der Zutaten (bei Videos mit KI).</p>
              <button type="button" className="primary" disabled={busy} onClick={() => void confirm()} data-testid="import-confirm">
                Rezept analysieren
              </button>
            </>
          )}
          {isPending(dto.status) && (
            <p className="small muted" aria-live="polite">
              {dto.status === "PREVIEW_PENDING" ? "Vorschau wird geladen …" : COPY.recipeLoading(humor)} {dto.status !== "PREVIEW_PENDING" && COPY.importQueued(humor)}
            </p>
          )}
          {dto.status === "READY" && (
            <>
              <p className="small ok">{COPY.importReady(humor)}</p>
              <button type="button" className="primary" onClick={() => onReview(dto)} data-testid="import-review">
                Entwurf prüfen
              </button>
            </>
          )}
          {dto.status === "FAILED" && (
            <>
              <p className="small danger">{dto.error ?? COPY.importFailed(humor)}</p>
              <p className="small muted">Alternativen: Bildschirmaufnahme oder Video hochladen, ein Foto machen oder den Rezepttext einfügen.</p>
            </>
          )}
          {pollError !== null && <p className="small danger">{failureText(pollError, humor)}</p>}
          <div className="row">
            <button
              type="button"
              className="ghost grow"
              onClick={() => {
                setActiveId(null);
                setDto(null);
                loadRecent();
              }}
            >
              Anderes Rezept
            </button>
            <button
              type="button"
              className="ghost danger"
              disabled={busy}
              data-testid="import-discard"
              onClick={() => {
                const id = dto.id;
                setActiveId(null);
                setDto(null);
                void importApi
                  .remove(id)
                  .catch(() => undefined)
                  .finally(loadRecent);
              }}
            >
              Verwerfen
            </button>
          </div>
        </div>
      ) : (
        <div className="form">
          <div className="chips" role="radiogroup" aria-label="Quelle">
            {(
              [
                ["link", "Link"],
                ["photo", "Foto"],
                ["video", "Video"],
                ["text", "Text"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={source === id}
                className={`chip ${source === id ? "on" : ""}`}
                onClick={() => {
                  setSource(id);
                  setFile(null);
                  setError(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {source === "link" && (
            <label>
              Link zu Rezept, TikTok, Instagram oder YouTube
              <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </label>
          )}
          {source === "text" && (
            <label>
              Zutatenliste oder Transkript
              <textarea rows={8} maxLength={30000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Zutaten mit Mengen, gerne auch die Videobeschreibung" />
            </label>
          )}
          {(source === "photo" || source === "video") && (
            <label className="photo-field">
              {source === "photo" ? "Kochbuchseite oder Screenshot" : "Video oder Bildschirmaufnahme (kurz, max. 18 MB)"}
              <input
                type="file"
                accept={source === "photo" ? "image/*" : "video/mp4,video/webm,video/quicktime"}
                {...(source === "photo" ? { capture: "environment" as const } : {})}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <span className={`photo-pick ${file ? "on" : ""}`}>{file ? `✓ ${file.name}` : source === "photo" ? "◉ Foto aufnehmen oder wählen" : "▶ Video wählen"}</span>
            </label>
          )}
          {source !== "link" && (
            <label>
              Titel (optional)
              <input maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
          )}
          {error && <p className="small danger">{error}</p>}
          <button type="button" className="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? "Sende …" : source === "link" ? "Vorschau laden" : "Analysieren"}
          </button>
          <p className="tiny muted">Nährwerte werden nie von der KI geschätzt, sondern aus den zugeordneten Lebensmitteln berechnet. Fehlende Mengen bleiben offen, bis du sie einträgst.</p>

          {recent && recent.length > 0 && (
            <section>
              <h3 className="section">Letzte Importe</h3>
              <ul className="list">
                {recent.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="list-row"
                      onClick={() => {
                        setDto(r);
                        setActiveId(r.id);
                      }}
                    >
                      <ImportCard dto={r} compact />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}

function ImportCard({ dto, compact = false }: { dto: RecipeImportDto; compact?: boolean }) {
  const host = dto.url ? safeHost(dto.url) : null;
  return (
    <span className="grow import-card">
      <span className="name">{dto.title ?? dto.draft?.title ?? (dto.source === "URL" ? host : "Rezept")}</span>
      <span className="small muted">
        {dto.platform ? PLATFORM[dto.platform] ?? dto.platform : dto.source === "PHOTO" ? "Foto" : dto.source === "VIDEO" ? "Video" : dto.source === "TEXT" ? "Text" : ""}
        {host && !compact ? ` · ${host}` : ""} · <span className={`import-status s-${dto.status.toLowerCase()}`}>{STATUS_LABEL[dto.status]}</span>
      </span>
    </span>
  );
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ─── Review: confidence per ingredient, open questions, then on to the recipe editor ────────────

const CONF_LABEL: Record<CaptureStatus, string> = { verified: "belegt", estimated: "geschätzt", unknown: "unbekannt" };

interface ReviewRow {
  include: boolean;
  candidateIdx: number;
  qtyText: string;
  unit: string;
}

export function initialReviewRows(dto: RecipeImportDto): ReviewRow[] {
  return (dto.draft?.ingredients ?? []).map((ing) => {
    const cand = ing.candidates[0];
    const food = cand ? candidateToFood(cand) : null;
    const { unit, matched } = pickUnit(food ? unitsFor(food) : ["g"], ing.unit);
    return { include: !!cand, candidateIdx: 0, qtyText: matched && ing.quantity !== null ? String(ing.quantity).replace(".", ",") : "", unit };
  });
}

export function ImportReview({ dto, onContinue, onCancel }: { dto: RecipeImportDto; onContinue: (draft: RecipeDraft) => void; onCancel: () => void }) {
  const { toast } = useApp();
  const draft = dto.draft!;
  const [rows, setRows] = useState<ReviewRow[]>(() => initialReviewRows(dto));
  const [name, setName] = useState(draft.title ?? dto.title ?? "");
  const [servingsText, setServingsText] = useState(draft.servings.value ? String(draft.servings.value) : "");
  const update = (i: number, patch: Partial<ReviewRow>) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const resolved = useMemo(
    () =>
      draft.ingredients.map((ing, i) => {
        const r = rows[i]!;
        const cand = ing.candidates[r.candidateIdx];
        const food = cand ? candidateToFood(cand) : null;
        const qty = Number(r.qtyText.replace(",", "."));
        let kcal: number | null = null;
        let ok = false;
        if (food && r.qtyText.trim() !== "" && Number.isFinite(qty) && qty > 0) {
          try {
            kcal = snapshotFromFood(food, qty, r.unit).kcal;
            ok = true;
          } catch {
            ok = false;
          }
        }
        return { ing, row: r, food, qty, kcal, ok };
      }),
    [draft, rows],
  );
  const included = resolved.filter((x) => x.row.include);
  const open = included.filter((x) => !x.ok).length;
  const servings = Number(servingsText);

  const proceed = async () => {
    for (const x of included) await cacheFood(x.food!);
    onContinue({
      name: name.trim() || "Importiertes Rezept",
      note: importNote(dto),
      servings: servingsText.trim() && Number.isFinite(servings) && servings > 0 ? Math.round(servings) : null,
      finalWeightG: null,
      ingredients: included.map((x) => ({ food: x.food!, quantity: x.qty, unitLabel: x.row.unit })),
    });
    toast("Jetzt noch das Endgewicht nach dem Kochen eintragen");
  };

  return (
    <div className="screen" data-testid="import-review-screen">
      <div className="card-head">
        <h1>Entwurf prüfen</h1>
        <button type="button" className="ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
      <section className="card form">
        <label>
          Name
          <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={draft.servings.status !== "verified" ? "suspect" : ""}>
          <span className="nutrient-label">
            Portionen{draft.servings.status !== "verified" && <span className="status-tag">{CONF_LABEL[draft.servings.status]}</span>}
          </span>
          <input inputMode="numeric" className="num" value={servingsText} onChange={(e) => setServingsText(e.target.value)} placeholder="unbekannt" />
        </label>
        <p className="tiny muted">Quelle: {draft.method === "json-ld" ? "strukturierte Rezeptdaten der Seite" : "KI-Auswertung"}. Mengen gelten roh, wie im Rezept angegeben.</p>
      </section>

      {draft.openQuestions.length > 0 && (
        <section className="notice warn" data-testid="open-questions">
          <strong>Offene Fragen</strong>
          <ul>
            {draft.openQuestions.map((q, i) => (
              <li key={i} className="small">
                {q}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Zutaten</h2>
          <span className="small muted">
            <span className="num">{included.length}</span> von <span className="num">{draft.ingredients.length}</span>
          </span>
        </div>
        <ul className="list">
          {resolved.map((x, i) => {
            const units = x.food ? unitsFor(x.food) : ["g"];
            return (
              <li key={i} className={`review-row ${x.row.include && !x.ok ? "suspect" : ""}`} data-testid="review-ingredient">
                <label className="check-row">
                  <input type="checkbox" checked={x.row.include} disabled={x.ing.candidates.length === 0} onChange={(e) => update(i, { include: e.target.checked })} aria-label={`${x.ing.name} übernehmen`} />
                  <span className="grow">
                    <span className="name">{x.ing.name}</span>
                    {x.ing.raw && <span className="tiny muted"> „{x.ing.raw}“</span>}
                  </span>
                  <span className={`conf conf-${x.ing.status}`}>{CONF_LABEL[x.ing.status]}</span>
                </label>
                {x.ing.note && <p className="tiny muted">{x.ing.note}</p>}
                {x.ing.candidates.length === 0 ? (
                  <p className="small muted">Kein passendes Lebensmittel gefunden. Später im Editor über „+ Zutat“ ergänzen.</p>
                ) : (
                  x.row.include && (
                    <>
                      <select aria-label={`Lebensmittel für ${x.ing.name}`} value={x.row.candidateIdx} onChange={(e) => update(i, { candidateIdx: Number(e.target.value), unit: pickUnit(unitsFor(candidateToFood(x.ing.candidates[Number(e.target.value)]!)), x.ing.unit).unit })}>
                        {x.ing.candidates.map((c, j) => (
                          <option key={c.id} value={j}>
                            {c.name}
                            {c.brand ? ` (${c.brand})` : ""} · {c.own ? "Eigen" : c.source}
                          </option>
                        ))}
                      </select>
                      <div className="amount-row">
                        <input inputMode="decimal" className="num grow" aria-label={`Menge ${x.ing.name}`} placeholder="Menge fehlt" value={x.row.qtyText} onChange={(e) => update(i, { qtyText: e.target.value })} />
                        <select aria-label={`Einheit ${x.ing.name}`} value={x.row.unit} onChange={(e) => update(i, { unit: e.target.value })}>
                          {units.map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                        <span className="num small muted kcal-cell">{x.ok ? `${formatNumber(x.kcal)} kcal` : "–"}</span>
                      </div>
                    </>
                  )
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {draft.steps.length > 0 && (
        <details className="card">
          <summary>
            Zubereitung (<span className="num">{draft.steps.length}</span> Schritte)
          </summary>
          <ol className="small steps">
            {draft.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </details>
      )}

      {open > 0 && (
        <p className="small warn-text">
          Bei <span className="num">{open}</span> {open === 1 ? "Zutat fehlt" : "Zutaten fehlen"} Menge oder Einheit. Eintragen oder abwählen.
        </p>
      )}
      <button type="button" className="primary wide" disabled={open > 0 || included.length === 0} onClick={() => void proceed()} data-testid="import-continue">
        Weiter zum Rezept
      </button>
    </div>
  );
}
