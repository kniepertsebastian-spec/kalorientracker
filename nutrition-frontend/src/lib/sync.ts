// Delta sync with the shared backend, same idea as the Fitnesstracker's offline queue: every
// change is written to IndexedDB first and queued in the outbox; the engine pushes the outbox in
// one POST /api/nutrition/sync, then pulls what changed since the last serverTime. Ids come from
// the client and every op is idempotent on the server, so a push that is repeated after a lost
// answer cannot create duplicates ("konfliktfrei").
import { useSyncExternalStore } from "react";
import { ApiError, OfflineError, apiJson } from "./api";
import { cacheFood, db, getMeta, setMeta, type FailedRow, type OutboxRow } from "./db";
import type { DeletionKind, MealEntryDto, SyncOpResult, SyncPull, TodayTargets } from "./types";

// ─── State for the indicator ────────────────────────────────────────────────────────────────────

export interface SyncState {
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  authLost: boolean;
}

let state: SyncState = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  syncing: false,
  lastSyncAt: null,
  authLost: false,
};
const listeners = new Set<() => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getSyncState(): SyncState {
  return state;
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Outbox rows currently on their way to the server: they must not be cancelled locally. */
const inFlight = new Set<number>();

export function isInFlight(seq: number | undefined): boolean {
  return seq !== undefined && inFlight.has(seq);
}

// ─── Push ───────────────────────────────────────────────────────────────────────────────────────

const RESULT_KIND: Record<OutboxRow["kind"] | DeletionKind, string> = {
  mealLog: "mealLog",
  mealEntry: "mealEntry",
  rating: "rating",
  recipe: "recipe",
  delete: "",
  mealLogs: "mealLog",
  mealEntries: "mealEntry",
  ratings: "rating",
  recipes: "recipe",
};

export function resultKind(row: OutboxRow): string {
  return row.kind === "delete" ? RESULT_KIND[row.target] : RESULT_KIND[row.kind];
}

export function buildPushBody(rows: readonly OutboxRow[]) {
  const body = {
    recipes: [] as unknown[],
    mealLogs: [] as unknown[],
    mealEntries: [] as unknown[],
    ratings: [] as unknown[],
    deletions: { foods: [], foodUnits: [], recipes: [] as string[], mealLogs: [] as string[], mealEntries: [] as string[], ratings: [] as string[] },
  };
  for (const row of rows) {
    if (row.kind === "mealLog") body.mealLogs.push(row.payload);
    else if (row.kind === "mealEntry") body.mealEntries.push({ mealLogId: row.mealLogId, entry: row.payload });
    else if (row.kind === "rating") body.ratings.push(row.payload);
    else if (row.kind === "recipe") body.recipes.push(row.payload);
    else body.deletions[row.target].push(row.id);
  }
  return body;
}

// A delete of something that is already gone has reached its goal.
const alreadyGone = (row: OutboxRow, r: SyncOpResult) => row.kind === "delete" && r.status === "rejected" && /nicht gefunden/i.test(r.message ?? "");

export async function settle(rows: readonly OutboxRow[], results: readonly SyncOpResult[]): Promise<number> {
  const pool = [...results];
  const failed: FailedRow[] = [];
  const done: number[] = [];
  for (const row of rows) {
    const i = pool.findIndex((r) => r.kind === resultKind(row) && r.id === row.id);
    if (i < 0) continue; // no answer for it: stays queued
    const [r] = pool.splice(i, 1);
    if (r!.status === "rejected" && !alreadyGone(row, r!)) {
      const { seq: _seq, queuedAt: _q, ...op } = row;
      failed.push({ ...op, reason: r!.message ?? "Vom Server abgelehnt", failedAt: new Date().toISOString() } as FailedRow);
    }
    done.push(row.seq!);
  }
  await db.transaction("rw", db.outbox, db.failed, async () => {
    await db.outbox.bulkDelete(done);
    if (failed.length) await db.failed.bulkAdd(failed);
  });
  return done.length;
}

const BATCH = 150;

async function pushOutbox(fetchImpl: typeof fetch): Promise<void> {
  for (;;) {
    const rows = await db.outbox.orderBy("seq").limit(BATCH).toArray();
    if (rows.length === 0) return;
    rows.forEach((r) => inFlight.add(r.seq!));
    let settled = 0;
    try {
      const post = async (batch: readonly OutboxRow[]) =>
        (await apiJson<{ results: SyncOpResult[] }>("/nutrition/sync", { method: "POST", body: JSON.stringify(buildPushBody(batch)) }, fetchImpl)).results;
      let results: SyncOpResult[];
      try {
        results = await post(rows);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 400) throw error;
        // One malformed op fails the whole batch's validation: send them one by one, so only
        // that op ends up in "failed" and the rest of the queue moves on.
        results = [];
        for (const row of rows) {
          try {
            results.push(...(await post([row])));
          } catch (e) {
            if (!(e instanceof ApiError) || e.status !== 400) throw e;
            results.push({ kind: resultKind(row), id: row.id, status: "rejected", message: e.message });
          }
        }
      }
      settled = await settle(rows, results);
    } finally {
      rows.forEach((r) => inFlight.delete(r.seq!));
    }
    if (rows.length < BATCH || settled === 0) return; // nothing answered: try again next sync
  }
}

// ─── Pull ───────────────────────────────────────────────────────────────────────────────────────

export async function applyPull(pull: SyncPull): Promise<void> {
  // Rows the user has deleted locally while the delete is still queued must not come back.
  const pendingDeletes = new Set((await db.outbox.where("kind").equals("delete").toArray()).map((r) => r.id));
  const live = <T extends { id: string }>(rows: T[]) => rows.filter((r) => !pendingDeletes.has(r.id));

  const logDates = new Map(pull.mealLogs.map((l) => [l.id, l.date]));
  const missing = [...new Set(pull.mealEntries.map((e) => e.mealLogId).filter((id) => !logDates.has(id)))];
  (await db.mealLogs.bulkGet(missing)).forEach((l) => l && logDates.set(l.id, l.date));
  const entries: (MealEntryDto & { date: string })[] = [];
  for (const e of live(pull.mealEntries)) {
    const date = logDates.get(e.mealLogId);
    if (date) entries.push({ ...e, date });
  }

  await db.transaction("rw", [db.mealLogs, db.mealEntries, db.ratings, db.recipes, db.foods, db.meta], async () => {
    await db.mealLogs.bulkPut(live(pull.mealLogs));
    await db.mealEntries.bulkPut(entries);
    const ratings = live(pull.ratings);
    // One rating per day: a newer one from another device replaces the local one.
    for (const r of ratings) await db.ratings.where("date").equals(r.date).and((x) => x.id !== r.id).delete();
    await db.ratings.bulkPut(ratings);
    await db.recipes.bulkPut(live(pull.recipes));

    await db.mealEntries.bulkDelete(pull.deleted.mealEntries);
    if (pull.deleted.mealLogs.length) {
      await db.mealLogs.bulkDelete(pull.deleted.mealLogs);
      await db.mealEntries.where("mealLogId").anyOf(pull.deleted.mealLogs).delete();
    }
    await db.ratings.bulkDelete(pull.deleted.ratings);
    await db.recipes.bulkDelete(pull.deleted.recipes);
    await db.foods.bulkDelete(pull.deleted.foods);

    for (const f of pull.foods) await cacheFood(f);
    // Own measures of shared (BLS/OFF) foods: merged into the cached copy, if there is one.
    for (const u of pull.foodUnits) {
      const food = await db.foods.get(u.foodId);
      if (food && !food.units.some((x) => x.id === u.id)) await db.foods.put({ ...food, units: [...food.units, { id: u.id, label: u.label, baseAmount: u.baseAmount, own: true }] });
    }
    if (pull.deleted.foodUnits.length) {
      const gone = new Set(pull.deleted.foodUnits);
      await db.foods.toCollection().modify((f) => {
        f.units = f.units.filter((u) => !gone.has(u.id));
      });
    }
    if (pull.settings) await setMeta("settings", pull.settings);
    await setMeta("serverTime", pull.serverTime);
  });
}

async function pull(fetchImpl: typeof fetch): Promise<void> {
  const since = await getMeta<string>("serverTime");
  const query = since ? `?updatedSince=${encodeURIComponent(since)}` : "";
  await applyPull(await apiJson<SyncPull>(`/nutrition/sync${query}`, {}, fetchImpl));
}

async function refreshTargets(fetchImpl: typeof fetch): Promise<void> {
  await setMeta("targets", await apiJson<TodayTargets>("/nutrition/targets/today", {}, fetchImpl));
}

// ─── Scheduling ─────────────────────────────────────────────────────────────────────────────────

let running: Promise<void> | null = null;
let again = false;

/** Push, then pull, then the day's targets. Concurrent calls share one run (plus one follow-up). */
export function syncNow(fetchImpl: typeof fetch = fetch): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    setState({ syncing: true });
    try {
      do {
        again = false;
        await pushOutbox(fetchImpl);
        await pull(fetchImpl);
      } while (again);
      await refreshTargets(fetchImpl);
      setState({ online: true, lastSyncAt: new Date().toISOString(), authLost: false });
    } catch (error) {
      if (error instanceof OfflineError) setState({ online: false });
      else if (error instanceof ApiError && error.status === 401) setState({ authLost: true });
      else if (!(error instanceof ApiError)) throw error;
    } finally {
      running = null;
      setState({ syncing: false });
    }
  })();
  return running;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** After a local change: sync soon, but let a burst of taps settle into one request. */
export function requestSync(delayMs = 600): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow().catch(() => undefined);
  }, delayMs);
}

export function startSyncLoop(): () => void {
  const onOnline = () => {
    setState({ online: true });
    void syncNow().catch(() => undefined);
  };
  const onOffline = () => setState({ online: false });
  const onVisible = () => document.visibilityState === "visible" && requestSync(0);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  const interval = setInterval(() => navigator.onLine && requestSync(0), 60_000);
  void syncNow().catch(() => undefined);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(interval);
  };
}

// ─── Failed ops ─────────────────────────────────────────────────────────────────────────────────

export async function retryFailed(row: FailedRow): Promise<void> {
  const { seq: _seq, reason: _r, failedAt: _f, ...op } = row;
  await db.transaction("rw", db.outbox, db.failed, async () => {
    await db.failed.delete(row.seq!);
    await db.outbox.add({ ...op, queuedAt: new Date().toISOString() } as OutboxRow);
  });
  requestSync(0);
}

/** Gives up on a rejected change; what it created locally goes too, so the screen matches the server. */
export async function discardFailed(row: FailedRow): Promise<void> {
  await db.transaction("rw", [db.failed, db.mealLogs, db.mealEntries, db.ratings, db.recipes, db.meta], async () => {
    await db.failed.delete(row.seq!);
    if (row.kind === "mealEntry") await db.mealEntries.delete(row.id);
    if (row.kind === "mealLog") {
      await db.mealLogs.delete(row.id);
      await db.mealEntries.where("mealLogId").equals(row.id).delete();
    }
    if (row.kind === "rating") await db.ratings.delete(row.id);
    // A rejected recipe update may still exist on the server: the next full pull brings it back.
    if (row.kind === "recipe") {
      await db.recipes.delete(row.id);
      await db.meta.delete("serverTime");
    }
  });
  requestSync(0);
}
