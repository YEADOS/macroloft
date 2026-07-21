import { desc, lte } from "drizzle-orm";
import { db } from "../db/client";
import { goals, type Goal } from "../db/schema";
import { today } from "./settings";

/** The targets in effect on `date`: latest goal row with effective_date <= date. */
export function getGoals(date?: string): Goal | null {
  const d = date ?? today();
  return (
    db
      .select()
      .from(goals)
      .where(lte(goals.effectiveDate, d))
      .orderBy(desc(goals.effectiveDate), desc(goals.id))
      .limit(1)
      .get() ?? null
  );
}

export interface SetGoalsInput {
  energyKcal: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  goalWeightKg?: number;
  weeklyRateKg?: number;
  effectiveDate?: string;
}

export function setGoals(input: SetGoalsInput): Goal {
  const current = getGoals(input.effectiveDate);
  return db
    .insert(goals)
    .values({
      effectiveDate: input.effectiveDate ?? today(),
      energyKcal: input.energyKcal,
      proteinG: input.proteinG ?? current?.proteinG ?? null,
      carbsG: input.carbsG ?? current?.carbsG ?? null,
      fatG: input.fatG ?? current?.fatG ?? null,
      goalWeightKg: input.goalWeightKg ?? current?.goalWeightKg ?? null,
      weeklyRateKg: input.weeklyRateKg ?? current?.weeklyRateKg ?? null,
      createdAt: Date.now(),
    })
    .returning()
    .get();
}
