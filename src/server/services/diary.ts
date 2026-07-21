import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { diaryEntries, mealItems, meals, type DiaryEntry, type Goal } from "../db/schema";
import { kcalFromMacros, per100, round1, SLOTS, type Slot } from "../../shared/nutrition";
import { bumpUsage, getFood } from "./foods";
import { getGoals } from "./goals";
import { today } from "./settings";

export interface LogFoodInput {
  foodId: number;
  quantityG?: number;
  serving?: { name: string; count?: number };
  slot: Slot;
  date?: string;
}

function resolveQuantity(input: LogFoodInput, servings: { name: string; grams: number }[]): number {
  if (input.quantityG != null) return input.quantityG;
  if (input.serving) {
    const match = servings.find(
      (s) => s.name.toLowerCase() === input.serving!.name.toLowerCase(),
    );
    if (!match)
      throw new Error(
        `no serving named "${input.serving.name}"; available: ${
          servings.map((s) => s.name).join(", ") || "none — pass quantityG in grams"
        }`,
      );
    return match.grams * (input.serving.count ?? 1);
  }
  throw new Error("provide quantityG (grams) or a serving name");
}

export function logFood(input: LogFoodInput): DiaryEntry {
  const food = getFood(input.foodId);
  if (!food) throw new Error(`no food with id ${input.foodId}; use search_foods first`);
  const quantityG = resolveQuantity(input, food.servings);
  const entry = db
    .insert(diaryEntries)
    .values({
      date: input.date ?? today(),
      slot: input.slot,
      kind: "food",
      foodId: food.id,
      quantityG,
      energyKcal: per100(food.energyKcal, quantityG),
      proteinG: per100(food.proteinG, quantityG),
      carbsG: per100(food.carbsG, quantityG),
      fatG: per100(food.fatG, quantityG),
      satFatG: per100(food.satFatG, quantityG),
      sugarsG: per100(food.sugarsG, quantityG),
      fibreG: per100(food.fibreG, quantityG),
      sodiumMg: per100(food.sodiumMg, quantityG),
      loggedAt: Date.now(),
    })
    .returning()
    .get();
  bumpUsage(food.id);
  return entry;
}

export interface LogQuickInput {
  proteinG: number;
  carbsG: number;
  fatG: number;
  energyKcal?: number;
  label?: string;
  slot: Slot;
  date?: string;
}

export function logQuick(input: LogQuickInput): DiaryEntry {
  return db
    .insert(diaryEntries)
    .values({
      date: input.date ?? today(),
      slot: input.slot,
      kind: "quick",
      label: input.label ?? null,
      energyKcal:
        input.energyKcal ??
        round1(kcalFromMacros(input.proteinG, input.carbsG, input.fatG)),
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
      loggedAt: Date.now(),
    })
    .returning()
    .get();
}

export function logMeal(
  mealId: number,
  slot: Slot,
  date?: string,
  scale = 1,
): DiaryEntry[] {
  const meal = db.select().from(meals).where(eq(meals.id, mealId)).get();
  if (!meal || meal.isDeleted)
    throw new Error(`no meal with id ${mealId}; use list_meals`);
  const items = db.select().from(mealItems).where(eq(mealItems.mealId, mealId)).all();
  if (items.length === 0) throw new Error(`meal "${meal.name}" has no items`);
  const mealLogId = crypto.randomUUID();
  const entries: DiaryEntry[] = [];
  for (const item of items) {
    const entry = logFood({
      foodId: item.foodId,
      quantityG: round1(item.quantityG * scale),
      slot,
      date,
    });
    db.update(diaryEntries)
      .set({ mealLogId })
      .where(eq(diaryEntries.id, entry.id))
      .run();
    entries.push({ ...entry, mealLogId });
  }
  return entries;
}

export interface UpdateEntryInput {
  quantityG?: number;
  slot?: Slot;
  date?: string;
  label?: string;
}

export function updateEntry(id: number, patch: UpdateEntryInput): DiaryEntry {
  const entry = db.select().from(diaryEntries).where(eq(diaryEntries.id, id)).get();
  if (!entry) throw new Error(`no diary entry with id ${id}`);
  const set: Partial<DiaryEntry> = {};
  if (patch.slot) set.slot = patch.slot;
  if (patch.date) set.date = patch.date;
  if (patch.label !== undefined) set.label = patch.label;
  if (patch.quantityG != null) {
    if (entry.kind !== "food" || entry.quantityG == null || entry.foodId == null)
      throw new Error("quantity only applies to food entries");
    // Rescale the existing snapshot rather than re-reading the food row, so
    // history stays consistent even if the food has since changed.
    const ratio = patch.quantityG / entry.quantityG;
    set.quantityG = patch.quantityG;
    set.energyKcal = round1(entry.energyKcal * ratio);
    set.proteinG = round1(entry.proteinG * ratio);
    set.carbsG = round1(entry.carbsG * ratio);
    set.fatG = round1(entry.fatG * ratio);
    set.satFatG = entry.satFatG === null ? null : round1(entry.satFatG * ratio);
    set.sugarsG = entry.sugarsG === null ? null : round1(entry.sugarsG * ratio);
    set.fibreG = entry.fibreG === null ? null : round1(entry.fibreG * ratio);
    set.sodiumMg = entry.sodiumMg === null ? null : round1(entry.sodiumMg * ratio);
  }
  return db
    .update(diaryEntries)
    .set(set)
    .where(eq(diaryEntries.id, id))
    .returning()
    .get();
}

export function deleteEntry(id: number) {
  const existing = db.select().from(diaryEntries).where(eq(diaryEntries.id, id)).get();
  if (!existing) throw new Error(`no diary entry with id ${id}`);
  db.delete(diaryEntries).where(eq(diaryEntries.id, id)).run();
}

export interface DayTotals {
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fibreG: number;
  sodiumMg: number;
}

/** A diary row plus the food's display name, resolved for read paths only. */
export interface EntryWithFood extends DiaryEntry {
  foodName: string | null;
  brand: string | null;
}

function withFoodNames(entries: DiaryEntry[]): EntryWithFood[] {
  const cache = new Map<number, { name: string; brand: string | null } | null>();
  return entries.map((e) => {
    if (e.foodId == null) return { ...e, foodName: null, brand: null };
    if (!cache.has(e.foodId)) {
      const f = getFood(e.foodId);
      cache.set(e.foodId, f ? { name: f.name, brand: f.brand } : null);
    }
    const f = cache.get(e.foodId);
    return { ...e, foodName: f?.name ?? null, brand: f?.brand ?? null };
  });
}

export interface DaySummary {
  date: string;
  slots: Record<Slot, EntryWithFood[]>;
  totals: DayTotals;
  slotTotals: Record<Slot, DayTotals>;
  goals: Goal | null;
  remaining: { energyKcal: number; proteinG: number | null; carbsG: number | null; fatG: number | null } | null;
}

export function entriesForRange(start: string, end: string): DiaryEntry[] {
  return db
    .select()
    .from(diaryEntries)
    .where(and(gte(diaryEntries.date, start), lte(diaryEntries.date, end)))
    .all();
}

export function sumEntries(entries: DiaryEntry[]): DayTotals {
  const t: DayTotals = { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0, sodiumMg: 0 };
  for (const e of entries) {
    t.energyKcal += e.energyKcal;
    t.proteinG += e.proteinG;
    t.carbsG += e.carbsG;
    t.fatG += e.fatG;
    t.fibreG += e.fibreG ?? 0;
    t.sodiumMg += e.sodiumMg ?? 0;
  }
  for (const k of Object.keys(t) as (keyof DayTotals)[]) t[k] = round1(t[k]);
  return t;
}

export function getDay(date?: string): DaySummary {
  const d = date ?? today();
  const entries = entriesForRange(d, d);
  const slots = Object.fromEntries(SLOTS.map((s) => [s, [] as EntryWithFood[]])) as Record<Slot, EntryWithFood[]>;
  for (const e of withFoodNames(entries)) slots[e.slot as Slot].push(e);
  const totals = sumEntries(entries);
  const slotTotals = Object.fromEntries(
    SLOTS.map((s) => [s, sumEntries(slots[s])]),
  ) as Record<Slot, DayTotals>;
  const g = getGoals(d);
  return {
    date: d,
    slots,
    totals,
    slotTotals,
    goals: g,
    remaining: g
      ? {
          energyKcal: round1(g.energyKcal - totals.energyKcal),
          proteinG: g.proteinG === null ? null : round1(g.proteinG - totals.proteinG),
          carbsG: g.carbsG === null ? null : round1(g.carbsG - totals.carbsG),
          fatG: g.fatG === null ? null : round1(g.fatG - totals.fatG),
        }
      : null,
  };
}
