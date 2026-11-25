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
