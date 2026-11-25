import { useEffect, useState, type FormEvent } from "react";
import { checkSession, login, logout, type SessionState } from "./api";
import { greeting, loadHumor, saveHumor } from "./copy";

const FITNESS_URL = import.meta.env.VITE_FITNESS_URL ?? "https://fitness.pwa-tree.de";

type View = { kind: "loading" } | { kind: "error"; message: string } | SessionState;

export function App() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [humor, setHumor] = useState(loadHumor);

  const refresh = () => {
    setView({ kind: "loading" });
    checkSession()
      .then(setView)
      .catch(() => setView({ kind: "error", message: "Server nicht erreichbar." }));
  };
  useEffect(refresh, []);

  const toggleHumor = () => {
    saveHumor(!humor);
    setHumor(!humor);
  };

  return (
    <main className="shell">
      <header className="top">
        <span className="brand">Kalorientracker</span>
        <label className="toggle">
          <input type="checkbox" checked={humor} onChange={toggleHumor} />
          Humor-Modus
        </label>
      </header>
      {"kind" in view && view.kind === "loading" && <p className="muted">Lade …</p>}
      {"kind" in view && view.kind === "error" && (
        <section className="card">
          <p>{view.message}</p>
          <button onClick={refresh}>Erneut versuchen</button>
        </section>
      )}
      {"authenticated" in view && view.authenticated && (
        <Home name={view.user.firstName ?? view.user.displayName} humor={humor} onLogout={() => void logout().catch(() => undefined).finally(refresh)} />
      )}
      {"authenticated" in view && !view.authenticated && <Login onDone={setView} humor={humor} />}
    </main>
  );
}

function Home({ name, humor, onLogout }: { name: string | null; humor: boolean; onLogout: () => void }) {
  return (
    <section className="card">
      <h1>{greeting(name, new Date().getHours(), humor)}</h1>
      <p className="muted">
        Angemeldet über das gemeinsame Konto mit dem Fitnesstracker. Zielkalorien und Protein kommen von dort.
      </p>
      <div className="stats">
        <div>
          <span className="label">Heute</span>
          <span className="num">0 kcal</span>
        </div>
        <div>
          <span className="label">Protein</span>
          <span className="num">0 g</span>
        </div>
      </div>
      <button className="secondary" onClick={onLogout}>
        Abmelden
      </button>
    </section>
  );
}

function Login({ onDone, humor }: { onDone: (state: SessionState) => void; humor: boolean }) {
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
        Gleiches Konto wie im <a href={FITNESS_URL}>Fitnesstracker</a>. Bist du dort angemeldet, klappt es hier meist
        automatisch.
      </p>
      <form onSubmit={submit}>
        <label>
          E-Mail
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Passwort
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Prüfe …" : "Anmelden"}
        </button>
      </form>
    </section>
  );
}
