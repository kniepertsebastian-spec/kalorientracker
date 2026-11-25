import { describe, expect, it, vi } from "vitest";
import { ApiError, checkSession, login, logout } from "./api.js";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const user = { id: "u1", email: "a@b.c", displayName: "A", firstName: null, lastName: null, timeZone: "Europe/Berlin" };

describe("api", () => {
  it("checkSession sends the cookie and maps a signed-in answer", async () => {
    const fetchImpl = vi.fn(async () => json(200, { authenticated: true, accessToken: "t", user }));
    expect(await checkSession(fetchImpl)).toEqual({ authenticated: true, user, accessToken: "t" });
    expect(fetchImpl).toHaveBeenCalledWith("/api/auth/session", { method: "POST", credentials: "include" });
  });

  it("checkSession treats 'no session' as an ordinary answer", async () => {
    expect(await checkSession(async () => json(200, { authenticated: false }))).toEqual({ authenticated: false });
  });

  it("login surfaces the backend's message", async () => {
    await expect(login("a@b.c", "x", async () => json(401, { message: "Invalid credentials" }))).rejects.toEqual(
      new ApiError(401, "Invalid credentials"),
    );
  });

  it("logout accepts 204", async () => {
    await expect(logout(async () => new Response(null, { status: 204 }))).resolves.toBeUndefined();
  });
});
