import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { mealItems, meals, type Meal } from "../db/schema";
import { per100, round1 } from "../../shared/nutrition";
import { getFood } from "./foods";

export interface MealItemInput {
  foodId: number;
  quantityG: number;
}

export interface MealWithItems extends Meal {
  items: { id: number; foodId: number; foodName: string; quantityG: number }[];
  totals: { energyKcal: number; proteinG: number; carbsG: number; fatG: number };
}

function mealTotals(items: MealItemInput[]) {
  const t = { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const item of items) {
    const food = getFood(item.foodId);
    if (!food) continue;
    t.energyKcal += per100(food.energyKcal, item.quantityG);
    t.proteinG += per100(food.proteinG, item.quantityG);
    t.carbsG += per100(food.carbsG, item.quantityG);
    t.fatG += per100(food.fatG, item.quantityG);
  }
  return {
    energyKcal: round1(t.energyKcal),
    proteinG: round1(t.proteinG),
    carbsG: round1(t.carbsG),
    fatG: round1(t.fatG),
  };
}

export function getMeal(id: number): MealWithItems | null {
  const meal = db.select().from(meals).where(eq(meals.id, id)).get();
  if (!meal || meal.isDeleted) return null;
  const items = db.select().from(mealItems).where(eq(mealItems.mealId, id)).all();
  return {
    ...meal,
    items: items.map((i) => ({
      id: i.id,
      foodId: i.foodId,
      foodName: getFood(i.foodId)?.name ?? `food #${i.foodId}`,
      quantityG: i.quantityG,
    })),
    totals: mealTotals(items),
  };
}

export function listMeals(): MealWithItems[] {
  return db
    .select()
    .from(meals)
    .where(eq(meals.isDeleted, 0))
    .all()
    .map((m) => getMeal(m.id)!)
    .filter(Boolean);
}

export function createMeal(name: string, items: MealItemInput[], notes?: string): MealWithItems {
  for (const item of items) {
    if (!getFood(item.foodId))
      throw new Error(`no food with id ${item.foodId}; use search_foods first`);
  }
  const now = Date.now();
  const meal = db
    .insert(meals)
    .values({ name, notes: notes ?? null, createdAt: now, updatedAt: now })
    .returning()
    .get();
  for (const item of items) {
    db.insert(mealItems)
      .values({ mealId: meal.id, foodId: item.foodId, quantityG: item.quantityG })
      .run();
  }
  return getMeal(meal.id)!;
}

export function updateMeal(
  id: number,
  patch: { name?: string; notes?: string; items?: MealItemInput[] },
): MealWithItems {
  const existing = getMeal(id);
  if (!existing) throw new Error(`no meal with id ${id}`);
  db.update(meals)
    .set({
      name: patch.name ?? existing.name,
      notes: patch.notes !== undefined ? patch.notes : existing.notes,
      updatedAt: Date.now(),
    })
    .where(eq(meals.id, id))
    .run();
  if (patch.items) {
    for (const item of patch.items) {
      if (!getFood(item.foodId)) throw new Error(`no food with id ${item.foodId}`);
    }
    db.delete(mealItems).where(eq(mealItems.mealId, id)).run();
    for (const item of patch.items) {
      db.insert(mealItems)
        .values({ mealId: id, foodId: item.foodId, quantityG: item.quantityG })
        .run();
    }
  }
  return getMeal(id)!;
}

export function deleteMeal(id: number) {
  if (!getMeal(id)) throw new Error(`no meal with id ${id}`);
  db.update(meals).set({ isDeleted: 1, updatedAt: Date.now() }).where(eq(meals.id, id)).run();
}
