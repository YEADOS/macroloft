import { round1 } from "../../shared/nutrition";
import { entriesForRange, sumEntries, type DayTotals } from "./diary";
import { getGoals } from "./goals";
import { getWeightHistory } from "./weight";
import { today } from "./settings";

export type Period = "week" | "month" | "30d" | "90d";

export function periodToRange(period: Period): { start: string; end: string } {
  const end = today();
  const d = new Date(end + "T00:00:00Z");
  switch (period) {
    case "week":
      d.setUTCDate(d.getUTCDate() - 6);
      break;
    case "month":
      d.setUTCDate(1);
      break;
    case "30d":
      d.setUTCDate(d.getUTCDate() - 29);
      break;
    case "90d":
      d.setUTCDate(d.getUTCDate() - 89);
      break;
  }
  return { start: d.toISOString().slice(0, 10), end };
}

export interface DailyRow extends DayTotals {
  date: string;
  entryCount: number;
}

export interface Summary {
  start: string;
  end: string;
  days: DailyRow[]; // only days with entries
  loggedDays: number;
  totalDays: number;
  averages: DayTotals | null; // over logged days
  targets: {
    energyKcal: number;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
  } | null;
  adherence: {
    avgVsTargetKcal: number;
    daysOverTarget: number;
    daysUnderTarget: number;
  } | null;
  macroSplit: { proteinPct: number; carbsPct: number; fatPct: number } | null;
  currentStreak: number; // consecutive logged days ending today/yesterday
  weight: ReturnType<typeof getWeightHistory>;
}

export function getSummary(start: string, end: string): Summary {
  const entries = entriesForRange(start, end);
  const byDate = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }
  const days: DailyRow[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, es]) => ({ date, entryCount: es.length, ...sumEntries(es) }));

  const loggedDays = days.length;
  const totalDays =
    Math.round(
      (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000,
    ) + 1;

  let averages: DayTotals | null = null;
  if (loggedDays > 0) {
    const sum = days.reduce(
      (acc, d) => ({
        energyKcal: acc.energyKcal + d.energyKcal,
        proteinG: acc.proteinG + d.proteinG,
        carbsG: acc.carbsG + d.carbsG,
        fatG: acc.fatG + d.fatG,
        fibreG: acc.fibreG + d.fibreG,
        sodiumMg: acc.sodiumMg + d.sodiumMg,
      }),
      { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0, sodiumMg: 0 },
    );
    averages = Object.fromEntries(
      Object.entries(sum).map(([k, v]) => [k, round1(v / loggedDays)]),
    ) as unknown as DayTotals;
  }

  const goal = getGoals(end);
  const targets = goal
    ? {
        energyKcal: goal.energyKcal,
        proteinG: goal.proteinG,
        carbsG: goal.carbsG,
        fatG: goal.fatG,
      }
    : null;

  const adherence =
    goal && averages
      ? {
          avgVsTargetKcal: round1(averages.energyKcal - goal.energyKcal),
          daysOverTarget: days.filter((d) => d.energyKcal > goal.energyKcal).length,
          daysUnderTarget: days.filter((d) => d.energyKcal <= goal.energyKcal).length,
        }
      : null;

  let macroSplit: Summary["macroSplit"] = null;
  if (averages) {
    const p = averages.proteinG * 4;
    const c = averages.carbsG * 4;
    const f = averages.fatG * 9;
    const total = p + c + f;
    if (total > 0)
      macroSplit = {
        proteinPct: Math.round((p / total) * 100),
        carbsPct: Math.round((c / total) * 100),
        fatPct: Math.round((f / total) * 100),
      };
  }

  // Streak: consecutive logged days ending today (or yesterday, so an
  // unfinished today doesn't break it). Counts beyond the queried range.
  let currentStreak = 0;
  {
    const cursor = new Date(today() + "T00:00:00Z");
    const logged = (d: string) =>
      byDate.has(d) || entriesForRange(d, d).length > 0;
    if (!logged(cursor.toISOString().slice(0, 10)))
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    while (logged(cursor.toISOString().slice(0, 10))) {
      currentStreak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }

  return {
    start,
    end,
    days,
    loggedDays,
    totalDays,
    averages,
    targets,
    adherence,
    macroSplit,
    currentStreak,
    weight: getWeightHistory(start, end),
  };
}
