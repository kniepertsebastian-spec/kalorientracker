import { useLiveQuery } from "dexie-react-hooks";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { checkSession, login, logout, setAccessToken, setSessionLostHandler, type SessionState, type User } from "./lib/api";
import { greeting, loadHumor, phaseLine, saveHumor, trainingLine } from "./lib/copy";
import { clearLocalData, db, getMeta, setMeta } from "./lib/db";
import { addDays, budget, dayTotals, streak } from "./lib/day";
import { AppContext, DEFAULT_BADGE, useEntries, useTargets, useToday, type AppCtx } from "./lib/hooks";
import { startSyncLoop, syncNow, useSyncState } from "./lib/sync";
import { Today } from "./screens/Today";
import { Mascot, type MascotMood } from "./ui/Mascot";
import { SyncStatusIndicator } from "./ui/SyncStatusIndicator";

const FITNESS_URL = import.meta.env.VITE_FITNESS_URL ?? "https://fitness.pwa-tree.de";
const BADGE_KEY = "kcal.badge";

// Today is the start screen and stays in the main bundle; the other tabs load on first visit
// (the service worker precaches them, so this works offline too).
const Recipes = lazy(() => import("./screens/Recipes").then((m) => ({ default: m.Recipes })));
const Progress = lazy(() => import("./screens/Progress").then((m) => ({ default: m.Progress })));
const Export = lazy(() => import("./screens/Export").then((m) => ({ default: m.Export })));
const More = lazy(() => import("./screens/More").then((m) => ({ default: m.More })));

const TABS = [
  { id: "heute", label: "Heute", icon: "◐" },
  { id: "rezepte", label: "Rezepte", icon: "▤" },
  { id: "fortschritt", label: "Fortschritt", icon: "▁▃▅" },
  { id: "export", label: "Export", icon: "⇩" },
  { id: "mehr", label: "Mehr", icon: "⋯" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const tabFromHash = (): TabId => {
  const id = location.hash.replace(/^#\/?/, "");
  return TABS.some((t) => t.id === id) ? (id as TabId) : "heute";
};

type Boot = { kind: "loading" } | { kind: "error"; message: string } | { kind: "login" } | { kind: "ready"; user: User };

/** Same account as before on this device? If not, the local store belongs to someone else: wipe it. */
async function adoptUser(user: User): Promise<void> {
  const previous = await getMeta<string>("accountId");
  if (previous && previous !== user.id) await clearLocalData();
  await setMeta("accountId", user.id);
  await setMeta("user", user);
}

export function App() {
  const [boot, setBoot] = useState<Boot>({ kind: "loading" });
  const [humor, setHumor] = useState(loadHumor);
  const [showLogin, setShowLogin] = useState(false);

  const start = useCallback(async () => {
    setBoot({ kind: "loading" });
    let session: SessionState;
    try {
      session = await checkSession();
    } catch {
      // Offline (or the server is down): the last signed-in user keeps working on local data.
      const cached = await getMeta<User>("user");
      setBoot(cached ? { kind: "ready", user: cached } : { kind: "error", message: "Server nicht erreichbar. Für die erste Anmeldung braucht es eine Verbindung." });
      return;
    }
    if (!session.authenticated) return setBoot({ kind: "login" });
    setAccessToken(session.accessToken);
    await adoptUser(session.user);
    setBoot({ kind: "ready", user: session.user });
  }, []);

  useEffect(() => void start(), [start]);

  const onLoggedIn = async (session: SessionState) => {
    if (!session.authenticated) return;
    setAccessToken(session.accessToken);
    await adoptUser(session.user);
    setShowLogin(false);
    setBoot({ kind: "ready", user: session.user });
    void syncNow().catch(() => undefined);
  };

  const toggleHumor = (on: boolean) => {
    saveHumor(on);
    setHumor(on);
  };

  if (boot.kind === "ready" && !showLogin) return <Shell user={boot.user} humor={humor} onHumor={toggleHumor} onNeedLogin={() => setShowLogin(true)} onLoggedOut={() => setBoot({ kind: "login" })} />;

  return (
    <main className="shell narrow">
      <header className="top">
        <span className="brand">
          <Mascot mood="default" flame={false} size={32} /> Kalorientracker
        </span>
      </header>
      {boot.kind === "loading" && <p className="muted">Lade …</p>}
      {boot.kind === "error" && (
        <section className="card">
          <p>{boot.message}</p>
          <button type="button" onClick={() => void start()}>
            Erneut versuchen
          </button>
        </section>
      )}
      {(boot.kind === "login" || showLogin) && <Login humor={humor} onDone={(s) => void onLoggedIn(s)} onCancel={showLogin ? () => setShowLogin(false) : undefined} />}
    </main>
  );
}

function Shell({ user, humor, onHumor, onNeedLogin, onLoggedOut }: { user: User; humor: boolean; onHumor: (on: boolean) => void; onNeedLogin: () => void; onLoggedOut: () => void }) {
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [badge, setBadgeState] = useState(() => localStorage.getItem(BADGE_KEY) ?? DEFAULT_BADGE);
  const [toastState, setToast] = useState<{ id: number; message: string; action?: { label: string; run: () => void } } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targets = useTargets();
  const timeZone = targets?.timeZone ?? user.timeZone ?? "Europe/Berlin";
  const today = useToday(timeZone);
  const { authLost } = useSyncState();

  useEffect(() => {
    const stop = startSyncLoop();
    setSessionLostHandler(() => undefined); // the indicator shows "Anmeldung nötig"; data stays local
    return stop;
  }, []);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Phase glow on the body: Aufbau lilac/amber, Cut violet/cyan, from the Fitnesstracker's phase.
  const phase = targets?.nutritionPhase ?? null;
  useEffect(() => {
    document.body.dataset.phase = phase === "BULK" ? "bulk" : phase === "CUT" ? "cut" : "neutral";
  }, [phase]);

  const toast = useCallback<AppCtx["toast"]>((message, action) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 5000 : 2800);
  }, []);

  const setBadge = (text: string) => {
    localStorage.setItem(BADGE_KEY, text);
    setBadgeState(text);
  };

  // Mascot: sunglasses once today's protein target is reached, a flame for a 3+ day logging streak.
  const todayEntries = useEntries(today, today);
  const loggedDays = useLiveQuery(async () => new Set((await db.mealEntries.where("date").between(addDays(today, -60), today, true, true).toArray()).map((e) => e.date)), [today]);
  const b = budget(targets ?? null, dayTotals(todayEntries ?? []).values);
  const days = loggedDays ? streak(loggedDays, today) : 0;
  // No phase line while loading; "no profile" only when the Fitnesstracker says so.
  const phaseText = !targets ? null : phase ? phaseLine(phase, humor) : targets.profileComplete ? null : phaseLine(null, humor);
  const training = targets ? trainingLine(targets.trainingPhase, targets.trainingPaused) : null;
  const hour = new Date().getHours();
  // Mood: over budget by more than a snack shows a sweat drop; nothing logged by noon, sleepy eyes.
  const mood: MascotMood = b?.proteinReached ? "sunglasses" : b && b.remainingKcal < -150 ? "over" : todayEntries && todayEntries.length === 0 && hour >= 12 ? "sleepy" : "default";

  const ctx = useMemo<AppCtx>(() => ({ humor, timeZone, userName: user.firstName ?? user.displayName, badge, toast }), [humor, timeZone, user, badge, toast]);

  const doLogout = async () => {
    await logout().catch(() => undefined);
    setAccessToken(null);
    await clearLocalData(); // shared devices: nothing of this account stays behind
    onLoggedOut();
  };

  return (
    <AppContext.Provider value={ctx}>
      <main className="shell">
        <header className="top">
          <span className="brand">
            <Mascot mood={mood} flame={days >= 3} />
            Kalorientracker
          </span>
          <SyncStatusIndicator />
        </header>
        {tab === "heute" && (
          <div className="greet">
            <h1>{greeting(ctx.userName, hour, humor, phase)}</h1>
            <p className="small muted" data-testid="phase-line">
              {[phaseText, training].filter(Boolean).join(" · ")}
              {days >= 2 && (
                <>
                  {phaseText || training ? " · " : ""}
                  <span className="num">{days}</span> Tage in Folge
                </>
              )}
            </p>
          </div>
        )}

        {authLost && (
          <div className="banner" role="status">
            <span className="grow small">Sitzung abgelaufen. Einträge werden lokal gesammelt.</span>
            <button type="button" onClick={onNeedLogin}>
              Anmelden
            </button>
          </div>
        )}

        {tab === "heute" && <Today today={today} />}
        <Suspense fallback={<p className="small muted screen">Lädt …</p>}>
          {tab === "rezepte" && <Recipes today={today} />}
          {tab === "fortschritt" && <Progress today={today} />}
          {tab === "export" && <Export />}
          {tab === "mehr" && <More user={user} onHumor={onHumor} onBadge={setBadge} onLogout={doLogout} />}
        </Suspense>
      </main>

      {toastState && (
        <div className="toast" role="status" key={toastState.id} data-testid="toast">
          <span className="grow">{toastState.message}</span>
          {toastState.action && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                toastState.action!.run();
                setToast(null);
              }}
            >
              {toastState.action.label}
            </button>
          )}
        </div>
      )}

      <nav className="tabs" aria-label="Hauptnavigation">
        {TABS.map((t) => (
          <a key={t.id} href={`#/${t.id}`} className="tab" aria-current={tab === t.id ? "page" : undefined}>
            <span aria-hidden="true" className="tab-icon">
              {t.icon}
            </span>
            {t.label}
          </a>
        ))}
      </nav>
    </AppContext.Provider>
  );
}

function Login({ onDone, humor, onCancel }: { onDone: (state: SessionState) => void; humor: boolean; onCancel?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await login(email, password));
    } catch {
      setError(humor ? "Das war nicht das Passwort. Wir haben nachgezählt." : "E-Mail oder Passwort falsch.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h1>Anmelden</h1>
      <p className="muted">
        Gleiches Konto wie im <a href={FITNESS_URL}>Fitnesstracker</a>. Bist du dort angemeldet, klappt es hier meist automatisch.
      </p>
      <form onSubmit={submit} className="form">
        <label>
          E-Mail
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Passwort
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="small danger">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Prüfe …" : "Anmelden"}
        </button>
        {onCancel && (
          <button type="button" className="ghost" onClick={onCancel}>
            Später
          </button>
        )}
      </form>
    </section>
  );
}
