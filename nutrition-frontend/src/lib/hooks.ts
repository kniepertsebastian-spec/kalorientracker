import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useContext, useEffect, useState } from "react";
import { db } from "./db";
import { localDayKey } from "./day";
import type { MealEntryDto, MealType, RatingDto, TodayTargets } from "./types";

export interface AppCtx {
  humor: boolean;
  timeZone: string;
  userName: string | null;
  badge: string;
  toast: (message: string, action?: { label: string; run: () => void }) => void;
}

export const AppContext = createContext<AppCtx>({
  humor: true,
  timeZone: "Europe/Berlin",
  userName: null,
  badge: "Kapitel 2",
  toast: () => undefined,
});

export const useApp = () => useContext(AppContext);

/** Today's date key in the user's time zone; rolls over at midnight while the app stays open. */
export function useToday(timeZone: string): string {
  const [today, setToday] = useState(() => localDayKey(new Date(), timeZone));
  useEffect(() => {
    setToday(localDayKey(new Date(), timeZone));
    const t = setInterval(() => setToday(localDayKey(new Date(), timeZone)), 60_000);
    return () => clearInterval(t);
  }, [timeZone]);
  return today;
}

export function useTargets(): TodayTargets | null | undefined {
  return useLiveQuery(async () => ((await db.meta.get("targets"))?.value as TodayTargets | undefined) ?? null, []);
}

export type DayEntry = MealEntryDto & { date: string; mealType: MealType };

/** Entries of a date range with their meal slot, oldest first. */
export function useEntries(from: string, to: string): DayEntry[] | undefined {
  return useLiveQuery(async () => {
    const entries = await db.mealEntries.where("date").between(from, to, true, true).toArray();
    const logs = new Map((await db.mealLogs.where("date").between(from, to, true, true).toArray()).map((l) => [l.id, l.mealType]));
    return entries
      .map((e) => ({ ...e, mealType: logs.get(e.mealLogId) ?? ("SNACK" as MealType) }))
      .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  }, [from, to]);
}

export function useRatings(from: string, to: string): RatingDto[] | undefined {
  return useLiveQuery(() => db.ratings.where("date").between(from, to, true, true).toArray(), [from, to]);
}

export function useOutboxCount(): number {
  return useLiveQuery(() => db.outbox.count(), []) ?? 0;
}

export function useFailed() {
  return useLiveQuery(() => db.failed.toArray(), []) ?? [];
}
