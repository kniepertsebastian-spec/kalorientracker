/**
 * Minimal client for the shared backend (same origin: Caddy routes /api to it). The access token
 * lives only in memory; the session itself is the HttpOnly refresh cookie, which the backend scopes
 * to the parent domain (COOKIE_DOMAIN) — a login in the Fitnesstracker therefore also counts here.
 */
export interface User {
  id: string;
  email: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  timeZone: string;
}

export type SessionState = { authenticated: false } | { authenticated: true; user: User; accessToken: string };

type Fetch = typeof fetch;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<ApiError> {
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) message = body.message;
  } catch {
    // no JSON body
  }
  return new ApiError(res.status, message);
}

/** The boot check: rotates the refresh cookie and answers "signed in?" without a 401 for "no". */
export async function checkSession(fetchImpl: Fetch = fetch): Promise<SessionState> {
  const res = await fetchImpl("/api/auth/session", { method: "POST", credentials: "include" });
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as { authenticated: boolean; user?: User; accessToken?: string };
  if (body.authenticated && body.user && body.accessToken) {
    return { authenticated: true, user: body.user, accessToken: body.accessToken };
  }
  return { authenticated: false };
}

export async function login(email: string, password: string, fetchImpl: Fetch = fetch): Promise<SessionState> {
  const res = await fetchImpl("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as { user: User; accessToken: string };
  return { authenticated: true, user: body.user, accessToken: body.accessToken };
}

/** Logs out of both PWAs: the refresh token is revoked and the shared cookie cleared. */
export async function logout(fetchImpl: Fetch = fetch): Promise<void> {
  const res = await fetchImpl("/api/auth/logout", { method: "POST", credentials: "include" });
  if (!res.ok && res.status !== 204) throw await readError(res);
}

// ─── Authenticated calls ────────────────────────────────────────────────────────────────────────

/** Network down (fetch rejected) as opposed to an HTTP answer: the caller keeps its work queued. */
export class OfflineError extends Error {
  constructor() {
    super("Keine Verbindung");
    this.name = "OfflineError";
  }
}

let accessToken: string | null = null;
let refreshing: Promise<SessionState> | null = null;
let onSessionLost: () => void = () => undefined;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function hasAccessToken(): boolean {
  return accessToken !== null;
}

export function setSessionLostHandler(handler: () => void): void {
  onSessionLost = handler;
}

/** One refresh at a time: parallel 401s share it (the refresh cookie rotates on every use). */
export function refreshSession(fetchImpl: Fetch = fetch): Promise<SessionState> {
  refreshing ??= checkSession(fetchImpl)
    .then((state) => {
      accessToken = state.authenticated ? state.accessToken : null;
      return state;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function send(path: string, init: RequestInit, fetchImpl: Fetch): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  try {
    return await fetchImpl(`/api${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new OfflineError();
  }
}

/** Calls the API with the in-memory access token; a 401 gets one silent refresh and retry. */
export async function apiFetch(path: string, init: RequestInit = {}, fetchImpl: Fetch = fetch): Promise<Response> {
  if (!accessToken) {
    try {
      await refreshSession(fetchImpl);
    } catch {
      throw new OfflineError();
    }
  }
  let res = await send(path, init, fetchImpl);
  if (res.status === 401) {
    let state: SessionState;
    try {
      state = await refreshSession(fetchImpl);
    } catch {
      throw new OfflineError();
    }
    if (!state.authenticated) {
      onSessionLost();
      throw new ApiError(401, "Sitzung abgelaufen");
    }
    res = await send(path, init, fetchImpl);
  }
  if (!res.ok) throw await readError(res);
  return res;
}

export async function apiJson<T>(path: string, init: RequestInit = {}, fetchImpl: Fetch = fetch): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const res = await apiFetch(path, { ...init, headers }, fetchImpl);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
