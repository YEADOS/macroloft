import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const foods = sqliteTable(
  "foods",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source", { enum: ["afcd", "off", "custom"] }).notNull(),
    sourceId: text("source_id"),
    barcode: text("barcode"),
    name: text("name").notNull(),
    brand: text("brand"),
    energyKj: real("energy_kj"),
    energyKcal: real("energy_kcal").notNull(),
    proteinG: real("protein_g").notNull(),
    fatG: real("fat_g").notNull(),
    satFatG: real("sat_fat_g"),
    carbsG: real("carbs_g").notNull(),
    sugarsG: real("sugars_g"),
    fibreG: real("fibre_g"),
    sodiumMg: real("sodium_mg"),
    microsJson: text("micros_json"),
    usageCount: integer("usage_count").notNull().default(0),
    lastUsedAt: integer("last_used_at"),
    isDeleted: integer("is_deleted").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("foods_source_source_id").on(t.source, t.sourceId),
    index("foods_barcode").on(t.barcode),
  ],
);

export const foodServings = sqliteTable(
  "food_servings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    foodId: integer("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    grams: real("grams").notNull(),
  },
  (t) => [index("food_servings_food_id").on(t.foodId)],
);

export const meals = sqliteTable("meals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  notes: text("notes"),
  isDeleted: integer("is_deleted").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const mealItems = sqliteTable(
  "meal_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mealId: integer("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    foodId: integer("food_id")
      .notNull()
      .references(() => foods.id),
    quantityG: real("quantity_g").notNull(),
  },
  (t) => [index("meal_items_meal_id").on(t.mealId)],
);

export const diaryEntries = sqliteTable(
  "diary_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(), // YYYY-MM-DD local
    slot: text("slot", {
      enum: ["breakfast", "lunch", "dinner", "snacks"],
    }).notNull(),
    kind: text("kind", { enum: ["food", "quick"] }).notNull(),
    foodId: integer("food_id").references(() => foods.id),
    mealLogId: text("meal_log_id"),
    quantityG: real("quantity_g"),
    label: text("label"),
    // Snapshots at log time — never recomputed from foods afterwards.
    energyKcal: real("energy_kcal").notNull(),
    proteinG: real("protein_g").notNull(),
    carbsG: real("carbs_g").notNull(),
    fatG: real("fat_g").notNull(),
    satFatG: real("sat_fat_g"),
    sugarsG: real("sugars_g"),
    fibreG: real("fibre_g"),
    sodiumMg: real("sodium_mg"),
    loggedAt: integer("logged_at").notNull(),
  },
  (t) => [index("diary_entries_date").on(t.date)],
);

export const goals = sqliteTable(
  "goals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    effectiveDate: text("effective_date").notNull(),
    energyKcal: real("energy_kcal").notNull(),
    proteinG: real("protein_g"),
    carbsG: real("carbs_g"),
    fatG: real("fat_g"),
    goalWeightKg: real("goal_weight_kg"),
    weeklyRateKg: real("weekly_rate_kg"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("goals_effective_date").on(t.effectiveDate)],
);

export const weighIns = sqliteTable(
  "weigh_ins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    weightKg: real("weight_kg").notNull(),
    note: text("note"),
  },
  (t) => [uniqueIndex("weigh_ins_date").on(t.date)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Food = typeof foods.$inferSelect;
export type NewFood = typeof foods.$inferInsert;
export type FoodServing = typeof foodServings.$inferSelect;
export type Meal = typeof meals.$inferSelect;
export type MealItem = typeof mealItems.$inferSelect;
export type DiaryEntry = typeof diaryEntries.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type WeighIn = typeof weighIns.$inferSelect;
