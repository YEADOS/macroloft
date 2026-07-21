import { and, asc, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { weighIns, type WeighIn } from "../db/schema";
import { round1 } from "../../shared/nutrition";
import { getGoals } from "./goals";
import { today } from "./settings";

export function logWeight(weightKg: number, date?: string, note?: string): WeighIn {
  return db
    .insert(weighIns)
    .values({ date: date ?? today(), weightKg, note: note ?? null })
    .onConflictDoUpdate({
      target: weighIns.date,
      set: { weightKg, note: note ?? null },
    })
    .returning()
    .get();
}

export interface WeightPoint extends WeighIn {
  /** Trailing 7-day moving average over logged entries. */
  trendKg: number;
}

export interface WeightHistory {
  entries: WeightPoint[];
  current: number | null;
  goalWeightKg: number | null;
  deltaToGoalKg: number | null;
  changeOverRangeKg: number | null;
}

export function getWeightHistory(start: string, end: string): WeightHistory {
  // Pull extra leading days so the moving average is warm at `start`.
  const lead = new Date(start + "T00:00:00Z");
  lead.setUTCDate(lead.getUTCDate() - 6);
  const leadStr = lead.toISOString().slice(0, 10);

  const all = db
    .select()
    .from(weighIns)
    .where(and(gte(weighIns.date, leadStr), lte(weighIns.date, end)))
    .orderBy(asc(weighIns.date))
    .all();

  const points: WeightPoint[] = all.map((w, i) => {
    const window = all.slice(Math.max(0, i - 6), i + 1);
    const trend = window.reduce((s, x) => s + x.weightKg, 0) / window.length;
    return { ...w, trendKg: round1(trend) };
  });

  const entries = points.filter((p) => p.date >= start);
  const current = entries.at(-1)?.weightKg ?? null;
  const goal = getGoals();
  const goalWeightKg = goal?.goalWeightKg ?? null;
  const first = entries[0]?.weightKg ?? null;
  return {
    entries,
    current,
    goalWeightKg,
    deltaToGoalKg:
      current !== null && goalWeightKg !== null ? round1(current - goalWeightKg) : null,
    changeOverRangeKg:
      current !== null && first !== null ? round1(current - first) : null,
  };
}
