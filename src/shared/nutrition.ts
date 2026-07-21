// Atwater factors, kcal per gram.
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export const KJ_PER_KCAL = 4.184;

export function kcalFromMacros(proteinG: number, carbsG: number, fatG: number): number {
  return (
    proteinG * KCAL_PER_G.protein +
    carbsG * KCAL_PER_G.carbs +
    fatG * KCAL_PER_G.fat
  );
}

export function kjToKcal(kj: number): number {
  return kj / KJ_PER_KCAL;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Scale a per-100g nutrient value to a quantity in grams. Null passes through. */
export function per100<T extends number | null>(value: T, quantityG: number): T {
  if (value === null) return value;
  return round1((value as number) * (quantityG / 100)) as T;
}

export interface MacroTotals {
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  satFatG: number | null;
  sugarsG: number | null;
  fibreG: number | null;
  sodiumMg: number | null;
}

/** Seeded on first run; the live list is the diary_slots table (custom sections allowed). */
export const DEFAULT_SLOTS = ["breakfast", "lunch", "dinner", "snacks"] as const;
export type Slot = string;
