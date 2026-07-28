import { desc, eq, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { pepsiDays } from "../db/schema";
import { today } from "./settings";

export interface PepsiStats {
  /** The day these numbers are anchored to (local YYYY-MM-DD). */
  date: string;
  /** Cans on `date`. */
  count: number;
  /** Cans ever. */
  total: number;
  /** Days that had at least one can. */
  days: number;
  /** The biggest single day, or null before the first can. */
  best: { date: string; count: number } | null;
  /** Consecutive days with at least one can, ending on `date`. */
  streak: number;
}

/** The day before a local YYYY-MM-DD, without touching timezones. */
function prevDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function getPepsiStats(date?: string): PepsiStats {
  const d = date ?? today();
  const agg = db
    .select({
      total: sql<number>`coalesce(sum(${pepsiDays.count}), 0)`,
      days: sql<number>`count(*)`,
    })
    .from(pepsiDays)
    .get();
  const best = db
    .select({ date: pepsiDays.date, count: pepsiDays.count })
    .from(pepsiDays)
    .orderBy(desc(pepsiDays.count), desc(pepsiDays.date))
    .limit(1)
    .get();

  // Walk back day by day from `date` — the table only holds days with cans, so
  // the first gap ends the run.
  const back = db
    .select({ date: pepsiDays.date })
    .from(pepsiDays)
    .where(lte(pepsiDays.date, d))
    .orderBy(desc(pepsiDays.date))
    .limit(400)
    .all();
  let streak = 0;
  let cursor = d;
  for (const row of back) {
    if (row.date !== cursor) break;
    streak++;
    cursor = prevDate(cursor);
  }

  return {
    date: d,
    count: db.select().from(pepsiDays).where(eq(pepsiDays.date, d)).get()?.count ?? 0,
    total: agg?.total ?? 0,
    days: agg?.days ?? 0,
    best: best ?? null,
    streak,
  };
}

/**
 * Adds (or, with a negative delta, takes back) cans on a day. The count floors
 * at zero and an emptied day drops its row, so "days with a can" stays honest.
 */
export function addPepsi(delta = 1, date?: string): PepsiStats {
  const d = date ?? today();
  const current = db.select().from(pepsiDays).where(eq(pepsiDays.date, d)).get()?.count ?? 0;
  const next = Math.max(0, current + delta);
  if (next === 0) {
    db.delete(pepsiDays).where(eq(pepsiDays.date, d)).run();
  } else {
    db.insert(pepsiDays)
      .values({ date: d, count: next, updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: pepsiDays.date,
        set: { count: next, updatedAt: Date.now() },
      })
      .run();
  }
  return getPepsiStats(d);
}
