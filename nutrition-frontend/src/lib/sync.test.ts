import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRating, deleteEntry, isQuickDuplicate, logEntry, logEntryChecked, setRating, undoDeleteEntry } from "./actions";
import { setAccessToken } from "./api";
import { clearLocalData, db } from "./db";
import { applyPull, buildPushBody, getSyncState, settle, syncNow } from "./sync";
import type { SyncPull } from "./types";
import { food } from "../test/fixtures";

const emptyPull = (over: Partial<SyncPull> = {}): SyncPull => ({
  foods: [],
  foodUnits: [],
  recipes: [],
  mealLogs: [],
  mealEntries: [],
  ratings: [],
  deleted: { foods: [], foodUnits: [], recipes: [], mealLogs: [], mealEntries: [], ratings: [] },
  settings: null,
  serverTime: "2026-11-25T10:00:00.000Z",
  ...over,
});

type Push = ReturnType<typeof buildPushBody>;

/** A tiny fake of the backend: applies every op, remembers the pushes. */
function server() {
  const pushes: Push[] = [];
  let offline = false;
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (offline) throw new TypeError("Failed to fetch");
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.startsWith("/api/nutrition/sync") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as Push;
      pushes.push(body);
      const results = [
        ...(body.mealLogs as { id: string }[]).map((l) => ({ kind: "mealLog", id: l.id, status: "applied" })),
        ...(body.mealEntries as { entry: { id: string } }[]).map((e) => ({ kind: "mealEntry", id: e.entry.id, status: "applied" })),
        ...(body.ratings as { id: string }[]).map((r) => ({ kind: "rating", id: r.id, status: "applied" })),
        ...body.deletions.mealEntries.map((id) => ({ kind: "mealEntry", id, status: "applied" })),
        ...body.deletions.ratings.map((id) => ({ kind: "rating", id, status: "applied" })),
      ];
      return json({ results });
    }
    if (url.startsWith("/api/nutrition/sync")) return json(emptyPull());
    if (url.startsWith("/api/nutrition/targets/today")) return json({ date: "2026-11-25", timeZone: "Europe/Berlin", profileComplete: true, targetCalories: 2500, targetProteinG: 180, macros: null, nutritionPhase: "CUT", trainingPhase: null });
    return new Response("{}", { status: 404 });
  });
  return {
    pushes,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    setOffline: (v: boolean) => {
      offline = v;
    },
  };
}

let srv: ReturnType<typeof server>;

beforeEach(async () => {
  await clearLocalData();
  srv = server();
  vi.stubGlobal("fetch", srv.fetchImpl); // the debounced syncs of the actions use the global fetch
  setAccessToken("test-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("offline day and sync", () => {
  it("logs offline into IndexedDB and the outbox, then pushes once online", async () => {
    srv.setOffline(true);
    const e1 = await logEntry({ date: "2026-11-25", mealType: "BREAKFAST", source: { type: "food", food: food() }, quantity: 250, unitLabel: "g" });
    await logEntry({ date: "2026-11-25", mealType: "BREAKFAST", source: { type: "food", food: food() }, quantity: 100, unitLabel: "g" });
    await setRating("2026-11-25", 8, "Guter Tag");

    expect(await db.mealEntries.where("date").equals("2026-11-25").count()).toBe(2);
    expect(await db.mealLogs.count()).toBe(1); // one log per day and slot
    expect((await db.outbox.toArray()).map((r) => r.kind)).toEqual(["mealLog", "mealEntry", "mealEntry", "rating"]);
    expect((await db.foodPrefs.get("f-quark"))?.lastQuantity).toBe(100);

    await syncNow();
    expect(getSyncState().online).toBe(false);
    expect(await db.outbox.count()).toBe(4); // kept for later

    srv.setOffline(false);
    await syncNow();
    expect(getSyncState().online).toBe(true);
    expect(await db.outbox.count()).toBe(0);
    const pushed = srv.pushes.at(-1)!;
    expect(pushed.mealLogs).toHaveLength(1);
    expect(pushed.mealEntries).toHaveLength(2);
    const sent = (pushed.mealEntries as { entry: { id: string; snapshot: { kcal: number } } }[]).find((x) => x.entry.id === e1.id)!;
    expect(sent.entry.snapshot.kcal).toBe(167.5); // the snapshot taken offline goes as it is
    expect(pushed.ratings).toHaveLength(1);
    expect(await db.meta.get("targets")).toBeTruthy();
  });

  it("deleting an unsynced entry cancels its create instead of sending a delete", async () => {
    srv.setOffline(true);
    const e = await logEntry({ date: "2026-11-25", mealType: "LUNCH", source: { type: "food", food: food() }, quantity: 100, unitLabel: "g" });
    await deleteEntry(e);
    expect((await db.outbox.toArray()).map((r) => r.kind)).toEqual(["mealLog"]);
    expect(await db.mealEntries.count()).toBe(0);
  });

  it("undo after a synced entry's delete drops the queued delete", async () => {
    const e = await logEntry({ date: "2026-11-25", mealType: "LUNCH", source: { type: "food", food: food() }, quantity: 100, unitLabel: "g" });
    await syncNow();
    expect(await db.outbox.count()).toBe(0);
    const row = { ...(await db.mealEntries.get(e.id))! };
    await deleteEntry(row);
    expect((await db.outbox.toArray()).map((r) => r.kind)).toEqual(["delete"]);
    await undoDeleteEntry(row);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.mealEntries.get(e.id)).toBeTruthy();
  });

  it("a new rating for the day replaces the unsynced one", async () => {
    srv.setOffline(true);
    await setRating("2026-11-25", 4, null);
    await setRating("2026-11-25", 9, "doch gut");
    expect((await db.ratings.toArray()).map((r) => r.score)).toEqual([9]);
    expect((await db.outbox.toArray()).map((r) => r.kind)).toEqual(["rating"]);
    await clearRating("2026-11-25");
    expect(await db.outbox.count()).toBe(0);
  });

  it("a pull does not bring back what is deleted locally but not yet pushed", async () => {
    const e = await logEntry({ date: "2026-11-25", mealType: "LUNCH", source: { type: "food", food: food() }, quantity: 100, unitLabel: "g" });
    await syncNow();
    const stored = (await db.mealEntries.get(e.id))!;
    const log = (await db.mealLogs.get(stored.mealLogId))!;
    await deleteEntry(stored);
    const { date: _d, ...dto } = stored;
    await applyPull(emptyPull({ mealLogs: [log], mealEntries: [dto] }));
    expect(await db.mealEntries.get(e.id)).toBeUndefined();
  });

  it("pulled entries get their date from the meal log; deleted logs take their entries along", async () => {
    const log = { id: "log-1", date: "2026-11-24", mealType: "DINNER" as const, eatenAt: null, note: null };
    const entry = { id: "ent-1", mealLogId: "log-1", foodId: null, recipeId: null, name: "Pizza", brand: null, quantity: 1, unitLabel: "Portion", grams: null, nutrients: { kcal: 900, proteinG: 35, carbsG: 100, fatG: 35, fiberG: null, sugarG: null, saturatedFatG: null, saltG: null }, estimatedFields: [] };
    await applyPull(emptyPull({ mealLogs: [log], mealEntries: [entry] }));
    expect((await db.mealEntries.get("ent-1"))?.date).toBe("2026-11-24");
    await applyPull(emptyPull({ deleted: { foods: [], foodUnits: [], recipes: [], mealLogs: ["log-1"], mealEntries: [], ratings: [] } }));
    expect(await db.mealEntries.count()).toBe(0);
    expect(await db.meta.get("serverTime")).toBeTruthy();
  });

  it("a rejected op moves to failed; a delete of something already gone counts as done", async () => {
    await db.outbox.bulkAdd([
      { kind: "rating", id: "r1", payload: { id: "r1", date: "2026-11-25", score: 11 }, label: "Bewertung", queuedAt: "" },
      { kind: "delete", id: "x1", target: "mealEntries", label: "Weg", queuedAt: "" },
    ]);
    const rows = await db.outbox.toArray();
    await settle(rows, [
      { kind: "rating", id: "r1", status: "rejected", message: "score zu groß" },
      { kind: "mealEntry", id: "x1", status: "rejected", message: "Eintrag nicht gefunden" },
    ]);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.failed.toArray()).map((f) => [f.id, f.reason])).toEqual([["r1", "score zu groß"]]);
  });

  it("builds the push body in the server's shape", () => {
    const body = buildPushBody([
      { kind: "mealEntry", id: "e1", mealLogId: "l1", payload: { id: "e1", quantity: 1, unitLabel: "g" }, label: "", queuedAt: "" },
      { kind: "delete", id: "r9", target: "ratings", label: "", queuedAt: "" },
    ]);
    expect(body.mealEntries).toEqual([{ mealLogId: "l1", entry: { id: "e1", quantity: 1, unitLabel: "g" } }]);
    expect(body.deletions.ratings).toEqual(["r9"]);
    expect(body.deletions.foods).toEqual([]);
  });
});

describe("duplicate detection (quick repeat)", () => {
  const base = { id: "a", name: "Magerquark", foodId: "f-quark", recipeId: null, quantity: 250, unitLabel: "g", createdAt: "2026-11-25T08:00:00.000Z" };

  it("flags the same food, amount and unit within two minutes only", () => {
    expect(isQuickDuplicate(base, { ...base, id: "b", createdAt: "2026-11-25T08:01:30.000Z" })).toBe(true);
    expect(isQuickDuplicate(base, { ...base, id: "b", createdAt: "2026-11-25T08:02:30.000Z" })).toBe(false);
    expect(isQuickDuplicate(base, { ...base, id: "b", quantity: 200 })).toBe(false);
    expect(isQuickDuplicate(base, { ...base, id: "b", unitLabel: "Becher" })).toBe(false);
    expect(isQuickDuplicate(base, { ...base, id: "b", foodId: "f-skyr" })).toBe(false);
    expect(isQuickDuplicate(base, base)).toBe(false);
  });

  it("compares free entries by name", () => {
    const free = { ...base, foodId: null, name: "Döner" };
    expect(isQuickDuplicate(free, { ...free, id: "b", name: " döner " })).toBe(true);
    expect(isQuickDuplicate(free, { ...free, id: "b", name: "Dürüm" })).toBe(false);
  });

  it("logs the repeat anyway and reports it, so the toast can offer to undo", async () => {
    srv.setOffline(true);
    const input = { date: "2026-11-25", mealType: "SNACK" as const, source: { type: "food" as const, food: food() }, quantity: 250, unitLabel: "g" };
    expect((await logEntryChecked(input)).duplicate).toBe(false);
    const second = await logEntryChecked(input);
    expect(second.duplicate).toBe(true);
    expect(await db.mealEntries.where("date").equals("2026-11-25").count()).toBe(2);
    expect((await logEntryChecked({ ...input, quantity: 100 })).duplicate).toBe(false);
    await deleteEntry(second.entry);
    expect(await db.mealEntries.where("date").equals("2026-11-25").count()).toBe(2);
  });
});
