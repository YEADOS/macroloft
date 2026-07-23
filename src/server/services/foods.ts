import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, sqlite } from "../db/client";
import { foods, foodServings, type Food, type FoodServing } from "../db/schema";
import { kcalFromMacros, round1 } from "../../shared/nutrition";

export interface FoodWithServings extends Food {
  servings: FoodServing[];
}

/**
 * Build an FTS5 MATCH expression. Every token is prefix-matched so partial
 * words work ("sunr jas"), and each is ORed against its squashed form so a
 * run-together query hits the `alt` column ("sunrice" → brand "Sun Rice").
 */
function ftsQuery(raw: string): string | null {
  const tokens = raw
    .toLowerCase()
    .replace(/["'*^:()-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"*`).join(" ");
}

// Lazy so the FTS table exists (ensureFts) before first prepare.
// Ranking tiers are specified in docs/FOOD-DATA.md — don't reorder them here
// without updating that doc and its acceptance checks.
let _searchStmt: ReturnType<typeof sqlite.query> | undefined;
const searchStmt = () =>
  (_searchStmt ??= sqlite.query(`
  SELECT f.id, lower(f.name) AS lname, lower(coalesce(f.brand, '')) AS lbrand,
         (SELECT count(*) FROM food_servings s WHERE s.food_id = f.id) AS n_servings
  FROM foods_fts
  JOIN foods f ON f.id = foods_fts.rowid
  WHERE foods_fts MATCH ?1 AND f.is_deleted = 0
  ORDER BY
    (f.usage_count > 0) DESC,
    f.usage_count DESC,
    CASE f.source WHEN 'custom' THEN 0 WHEN 'afcd' THEN 1 ELSE 2 END,
    (lower(f.name) = lower(?2)) DESC,
    bm25(foods_fts, 10.0, 6.0, 4.0)
  LIMIT ?3
`));

interface Candidate {
  id: number;
  lname: string;
  lbrand: string;
  n_servings: number;
}

export function searchFoods(query: string, limit = 10): FoodWithServings[] {
  const match = ftsQuery(query);
  if (!match) return [];
  // Over-fetch, then collapse OFF's many near-identical rows for the same
  // product so one brand can't fill the whole result list.
  const rows = searchStmt().all(
    match,
    query.trim(),
    Math.min(limit * 6, 300),
  ) as Candidate[];

  const seen = new Map<string, Candidate>();
  for (const r of rows) {
    const key = `${r.lname}|${r.lbrand}`;
    const kept = seen.get(key);
    // Within a duplicate group prefer the row that carries serving sizes.
    if (!kept) seen.set(key, r);
    else if (kept.n_servings === 0 && r.n_servings > 0) seen.set(key, r);
  }

  return [...seen.values()]
    .slice(0, limit)
    .map((r) => getFood(r.id))
    .filter((f): f is FoodWithServings => f !== null);
}

export interface RecentFood {
  food: FoodWithServings;
  lastQuantityG: number;
  timesLogged: number;
  lastUsedAt: number;
}

/**
 * Foods logged most recently, newest first, with the quantity used last time —
 * the "recents" list you re-log from without searching. Optionally scoped to a
 * meal slot, since breakfast repeats differently from dinner.
 */
export function recentFoods(limit = 20, slot?: string): RecentFood[] {
  const rows = sqlite
    .query(
      `SELECT e.food_id AS foodId, e.quantity_g AS lastQuantityG,
              e.logged_at AS lastUsedAt, c.n AS timesLogged
       FROM diary_entries e
       JOIN (
         SELECT food_id, max(logged_at) AS m, count(*) AS n
         FROM diary_entries
         WHERE kind = 'food' AND food_id IS NOT NULL
           AND (?2 IS NULL OR slot = ?2)
         GROUP BY food_id
       ) c ON c.food_id = e.food_id AND c.m = e.logged_at
       GROUP BY e.food_id
       ORDER BY e.logged_at DESC
       LIMIT ?1`,
    )
    .all(limit, slot ?? null) as {
    foodId: number;
    lastQuantityG: number | null;
    lastUsedAt: number;
    timesLogged: number;
  }[];

  return rows.flatMap((r) => {
    const food = getFood(r.foodId);
    if (!food) return [];
    return [
      {
        food,
        lastQuantityG: r.lastQuantityG ?? 100,
        timesLogged: r.timesLogged,
        lastUsedAt: r.lastUsedAt,
      },
    ];
  });
}

export function getFood(id: number): FoodWithServings | null {
  const food = db.select().from(foods).where(eq(foods.id, id)).get();
  if (!food || food.isDeleted) return null;
  const servings = db
    .select()
    .from(foodServings)
    .where(eq(foodServings.foodId, id))
    .all();
  return { ...food, servings };
}

export function getFoodByBarcode(barcode: string): FoodWithServings | null {
  const food = db
    .select()
    .from(foods)
    .where(and(eq(foods.barcode, barcode), eq(foods.isDeleted, 0)))
    .get();
  return food ? getFood(food.id) : null;
}

// The one true shape of a custom food, as Zod. REST (`POST /foods`), the MCP
// `create_food` tool, and the AI vision service all validate through this, so a
// model-produced draft can only reach the DB via the exact path
// createCustomFood already trusts. CreateFoodInput is derived from it.
export const servingInputSchema = z.object({
  name: z.string().min(1),
  grams: z.number().positive(),
});

export const foodInputSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  barcode: z.string().optional(),
  energyKcal: z.number().nonnegative().optional(), // computed from macros when omitted
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  satFatG: z.number().nonnegative().optional(),
  sugarsG: z.number().nonnegative().optional(),
  fibreG: z.number().nonnegative().optional(),
  sodiumMg: z.number().nonnegative().optional(),
  servings: z.array(servingInputSchema).optional(),
});

export type CreateFoodInput = z.infer<typeof foodInputSchema>;

export function createCustomFood(input: CreateFoodInput): FoodWithServings {
  const now = Date.now();
  const energyKcal =
    input.energyKcal ??
    round1(kcalFromMacros(input.proteinG, input.carbsG, input.fatG));
  const row = db
    .insert(foods)
    .values({
      source: "custom",
      name: input.name,
      brand: input.brand ?? null,
      barcode: input.barcode ?? null,
      energyKcal,
      energyKj: null,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
      satFatG: input.satFatG ?? null,
      sugarsG: input.sugarsG ?? null,
      fibreG: input.fibreG ?? null,
      sodiumMg: input.sodiumMg ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  for (const s of input.servings ?? []) {
    db.insert(foodServings)
      .values({ foodId: row.id, name: s.name, grams: s.grams })
      .run();
  }
  return getFood(row.id)!;
}

export function updateCustomFood(
  id: number,
  patch: Partial<CreateFoodInput>,
): FoodWithServings {
  const existing = getFood(id);
  if (!existing) throw new Error(`no food with id ${id}`);
  if (existing.source !== "custom")
    throw new Error(
      `food ${id} comes from the ${existing.source} database and is read-only; create a custom copy instead`,
    );
  const { servings, ...fields } = patch;
  db.update(foods)
    .set({ ...fields, updatedAt: Date.now() })
    .where(eq(foods.id, id))
    .run();
  if (servings) {
    db.delete(foodServings).where(eq(foodServings.foodId, id)).run();
    for (const s of servings) {
      db.insert(foodServings)
        .values({ foodId: id, name: s.name, grams: s.grams })
        .run();
    }
  }
  return getFood(id)!;
}

/**
 * Add a named serving to any food, including AFCD/OFF ones — servings are user
 * data layered on top; only the nutrient rows themselves are read-only.
 */
export function addServing(foodId: number, name: string, grams: number): FoodWithServings {
  const food = getFood(foodId);
  if (!food) throw new Error(`no food with id ${foodId}; use search_foods first`);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("serving name can't be empty");
  if (food.servings.some((s) => s.name.toLowerCase() === trimmed.toLowerCase()))
    throw new Error(`"${food.name}" already has a serving named "${trimmed}"`);
  db.insert(foodServings).values({ foodId, name: trimmed, grams }).run();
  return getFood(foodId)!;
}

export function deleteCustomFood(id: number) {
  const existing = getFood(id);
  if (!existing) throw new Error(`no food with id ${id}`);
  if (existing.source !== "custom")
    throw new Error(`food ${id} is from the ${existing.source} database and cannot be deleted`);
  db.update(foods)
    .set({ isDeleted: 1, updatedAt: Date.now() })
    .where(eq(foods.id, id))
    .run();
}

export function bumpUsage(foodId: number) {
  sqlite.run(
    "UPDATE foods SET usage_count = usage_count + 1, last_used_at = ? WHERE id = ?",
    [Date.now(), foodId],
  );
}
