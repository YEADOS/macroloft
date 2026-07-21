import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as foods from "../services/foods";
import * as diary from "../services/diary";
import * as mealsSvc from "../services/meals";
import * as goalsSvc from "../services/goals";
import * as weight from "../services/weight";
import * as insights from "../services/insights";
import * as slotsSvc from "../services/slots";

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Local calendar date YYYY-MM-DD; omit for today");
const slot = z
  .string()
  .describe(
    "Diary section name (case-insensitive). Defaults: breakfast, lunch, dinner, snacks — the user may have custom sections; list_slots shows the current set. Unknown names are rejected with the valid list.",
  );

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** Stateless: a fresh server per request keeps /mcp session-free. */
export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "macroloft", version: "0.1.0" });

  server.registerTool(
    "search_foods",
    {
      description:
        "Search the food database (Australian AFCD + Open Food Facts + custom foods) by name/brand. Returns per-100g macros, ids ready for log_food, and named servings. Use this before log_food when you don't have a food id.",
      inputSchema: { query: z.string(), limit: z.number().int().min(1).max(50).optional() },
    },
    ({ query, limit }) => json(foods.searchFoods(query, limit ?? 10)),
  );

  server.registerTool(
    "recent_foods",
    {
      description:
        "Foods logged most recently, newest first, with the quantity used last time and how often they've been logged. Use this instead of search_foods when the user says something like 'the usual', 'same as yesterday', or names a food they eat regularly — it gives you the food id and their typical portion in one call. Optionally scope to a meal slot.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
        slot: slot.optional().describe("Only foods logged in this slot"),
      },
    },
    ({ limit, slot: s }) => json(foods.recentFoods(limit ?? 20, s)),
  );

  server.registerTool(
    "get_food",
    {
      description: "Full detail for one food (including micronutrients and servings) by id or barcode.",
      inputSchema: { id: z.number().int().optional(), barcode: z.string().optional() },
    },
    ({ id, barcode }) => {
      const food =
        id != null ? foods.getFood(id) : barcode ? foods.getFoodByBarcode(barcode) : null;
      if (!food) throw new Error(id != null ? `no food with id ${id}` : `no product with barcode ${barcode ?? "(none given)"}`);
      return json(food);
    },
  );

  server.registerTool(
    "create_food",
    {
      description:
        "Create a custom food. Nutrients are per 100 g. energyKcal is auto-computed from macros (4/4/9) when omitted. Optionally add named servings (e.g. '1 scoop' = 30 g).",
      inputSchema: {
        name: z.string(),
        brand: z.string().optional(),
        barcode: z.string().optional(),
        energyKcal: z.number().nonnegative().optional(),
        proteinG: z.number().nonnegative(),
        carbsG: z.number().nonnegative(),
        fatG: z.number().nonnegative(),
        satFatG: z.number().nonnegative().optional(),
        sugarsG: z.number().nonnegative().optional(),
        fibreG: z.number().nonnegative().optional(),
        sodiumMg: z.number().nonnegative().optional(),
        servings: z.array(z.object({ name: z.string(), grams: z.number().positive() })).optional(),
      },
    },
    (input) => json(foods.createCustomFood(input)),
  );

  server.registerTool(
    "log_food",
    {
      description:
        "Log a food to the diary. Give quantityG in grams, or a serving name from the food's servings (with optional count). Returns the entry plus fresh day totals/remaining so you can confirm without another call.",
      inputSchema: {
        foodId: z.number().int(),
        quantityG: z.number().positive().optional(),
        serving: z.object({ name: z.string(), count: z.number().positive().optional() }).optional(),
        slot,
        date: dateStr.optional(),
      },
    },
    (input) => {
      const entry = diary.logFood(input);
      return json({ entry, day: diary.getDay(entry.date) });
    },
  );

  server.registerTool(
    "log_quick",
    {
      description:
        "Quick-log macros without a food: protein/carbs/fat in grams, optional label ('pub lunch'). kcal auto-computed (4/4/9) unless given (e.g. alcohol). Returns entry + day totals.",
      inputSchema: {
        proteinG: z.number().nonnegative(),
        carbsG: z.number().nonnegative(),
        fatG: z.number().nonnegative(),
        energyKcal: z.number().nonnegative().optional(),
        label: z.string().optional(),
        slot,
        date: dateStr.optional(),
      },
    },
    (input) => {
      const entry = diary.logQuick(input);
      return json({ entry, day: diary.getDay(entry.date) });
    },
  );

  server.registerTool(
    "log_meal",
    {
      description:
        "Log a saved meal (from list_meals) — expands into individual diary entries. scale multiplies all quantities (0.5 = half portion). Returns entries + day totals.",
      inputSchema: {
        mealId: z.number().int(),
        slot,
        date: dateStr.optional(),
        scale: z.number().positive().optional(),
      },
    },
    ({ mealId, slot: s, date, scale }) => {
      const entries = diary.logMeal(mealId, s, date, scale ?? 1);
      return json({ entries, day: diary.getDay(entries[0]!.date) });
    },
  );

  server.registerTool(
    "update_entry",
    {
      description:
        "Edit a diary entry: change quantityG (nutrients rescale), slot, date, or label. Get entry ids from get_day.",
      inputSchema: {
        entryId: z.number().int(),
        quantityG: z.number().positive().optional(),
        slot: slot.optional(),
        date: dateStr.optional(),
        label: z.string().optional(),
      },
    },
    ({ entryId, ...patch }) => {
      const entry = diary.updateEntry(entryId, patch);
      return json({ entry, day: diary.getDay(entry.date) });
    },
  );

  server.registerTool(
    "delete_entry",
    {
      description: "Delete a diary entry by id (from get_day).",
      inputSchema: { entryId: z.number().int() },
    },
    ({ entryId }) => {
      diary.deleteEntry(entryId);
      return json({ deleted: entryId });
    },
  );

  server.registerTool(
    "get_day",
    {
      description:
        "The full diary for a day: entries grouped by slot, day totals, active targets, and remaining calories/macros. The main 'how am I doing today' tool.",
      inputSchema: { date: dateStr.optional() },
    },
    ({ date }) => json(diary.getDay(date)),
  );

  server.registerTool(
    "list_slots",
    {
      description:
        "List the diary's sections (slots) in display order. Permanent sections appear every day; one-off sections only on days where they have entries.",
      inputSchema: {},
    },
    () => json(slotsSvc.listSlots()),
  );

  server.registerTool(
    "create_slot",
    {
      description:
        "Create a new diary section (e.g. 'drinks', 'pre-workout'). permanent=true (default) shows it every day; false makes it a one-off that only appears on days it's used.",
      inputSchema: { name: z.string(), permanent: z.boolean().optional() },
    },
    ({ name, permanent }) => json(slotsSvc.createSlot(name, permanent ?? true)),
  );

  server.registerTool(
    "list_meals",
    { description: "List saved meals with their items and computed totals.", inputSchema: {} },
    () => json(mealsSvc.listMeals()),
  );

  server.registerTool(
    "create_meal",
    {
      description: "Save a reusable meal: a named list of {foodId, quantityG} items.",
      inputSchema: {
        name: z.string(),
        items: z.array(z.object({ foodId: z.number().int(), quantityG: z.number().positive() })).min(1),
        notes: z.string().optional(),
      },
    },
    ({ name, items, notes }) => json(mealsSvc.createMeal(name, items, notes)),
  );

  server.registerTool(
    "update_meal",
    {
      description: "Update a saved meal's name, notes, or items (items replace the full list).",
      inputSchema: {
        mealId: z.number().int(),
        name: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(z.object({ foodId: z.number().int(), quantityG: z.number().positive() })).optional(),
      },
    },
    ({ mealId, ...patch }) => json(mealsSvc.updateMeal(mealId, patch)),
  );

  server.registerTool(
    "delete_meal",
    { description: "Delete a saved meal (past diary entries are unaffected).", inputSchema: { mealId: z.number().int() } },
    ({ mealId }) => {
      mealsSvc.deleteMeal(mealId);
      return json({ deleted: mealId });
    },
  );

  server.registerTool(
    "get_goals",
    {
      description: "The calorie/macro/weight targets active on a date (default today).",
      inputSchema: { date: dateStr.optional() },
    },
    ({ date }) => json(goalsSvc.getGoals(date)),
  );

  server.registerTool(
    "set_goals",
    {
      description:
        "Set new targets from effectiveDate (default today) onward. Omitted fields carry over from the current goals; history before effectiveDate keeps its old targets.",
      inputSchema: {
        energyKcal: z.number().positive(),
        proteinG: z.number().nonnegative().optional(),
        carbsG: z.number().nonnegative().optional(),
        fatG: z.number().nonnegative().optional(),
        goalWeightKg: z.number().positive().optional(),
        weeklyRateKg: z.number().optional(),
        effectiveDate: dateStr.optional(),
      },
    },
    (input) => json(goalsSvc.setGoals(input)),
  );

  server.registerTool(
    "log_weight",
    {
      description: "Log a weigh-in (kg). One per day — logging again for the same date overwrites.",
      inputSchema: { weightKg: z.number().positive(), date: dateStr.optional(), note: z.string().optional() },
    },
    ({ weightKg, date, note }) => json(weight.logWeight(weightKg, date, note)),
  );

  server.registerTool(
    "get_weight_history",
    {
      description: "Weigh-ins for a date range with 7-day trend, change over range, and delta to goal weight.",
      inputSchema: { start: dateStr, end: dateStr },
    },
    ({ start, end }) => json(weight.getWeightHistory(start, end)),
  );

  server.registerTool(
    "get_summary",
    {
      description:
        "Range insights: per-day totals, averages, adherence vs targets, macro split, logging streak, and weight trend. Use period ('week' = last 7 days, 'month' = calendar month to date, '30d', '90d') or explicit start/end. The 'how am I tracking this month' tool.",
      inputSchema: {
        period: z.enum(["week", "month", "30d", "90d"]).optional(),
        start: dateStr.optional(),
        end: dateStr.optional(),
      },
    },
    ({ period, start, end }) => {
      const range = period
        ? insights.periodToRange(period)
        : start && end
          ? { start, end }
          : (() => {
              throw new Error("give a period or both start and end");
            })();
      return json(insights.getSummary(range.start, range.end));
    },
  );

  return server;
}
