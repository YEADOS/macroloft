import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import * as foods from "../services/foods";
import { foodInputSchema, servingInputSchema } from "../services/foods";
import * as diary from "../services/diary";
import * as mealsSvc from "../services/meals";
import * as goalsSvc from "../services/goals";
import * as weight from "../services/weight";
import * as insights from "../services/insights";
import * as slots from "../services/slots";
import * as vision from "../services/vision";
import { maskedAiConfig, setAiConfig } from "../services/ai/config";

export const api = new Hono();

api.onError((err, c) => c.json({ error: err.message }, 400));

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
// Validated against the diary_slots table in services, not an enum.
const slot = z.string().min(1);

// The food shape lives in the foods service so REST, MCP, and AI vision all
// validate through one schema.
const servingSchema = servingInputSchema;
const foodBody = foodInputSchema;

// --- foods ---
api.get("/foods/search", (c) => {
  const q = c.req.query("q") ?? "";
  const limit = Math.min(Number(c.req.query("limit") ?? 10), 50);
  return c.json(foods.searchFoods(q, limit));
});
api.get("/foods/recent", (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 50);
  const s = c.req.query("slot");
  return c.json(foods.recentFoods(limit, s || undefined));
});
api.get("/foods/barcode/:code", (c) => {
  const food = foods.getFoodByBarcode(c.req.param("code"));
  return food ? c.json(food) : c.json({ error: "no product with that barcode" }, 404);
});
api.get("/foods/:id", (c) => {
  const food = foods.getFood(Number(c.req.param("id")));
  return food ? c.json(food) : c.json({ error: "not found" }, 404);
});
api.post("/foods", zValidator("json", foodBody), (c) =>
  c.json(foods.createCustomFood(c.req.valid("json")), 201),
);
api.post("/foods/:id/servings", zValidator("json", servingSchema), (c) => {
  const { name, grams } = c.req.valid("json");
  return c.json(foods.addServing(Number(c.req.param("id")), name, grams), 201);
});
api.patch("/foods/:id", zValidator("json", foodBody.partial()), (c) =>
  c.json(foods.updateCustomFood(Number(c.req.param("id")), c.req.valid("json"))),
);
api.delete("/foods/:id", (c) => {
  foods.deleteCustomFood(Number(c.req.param("id")));
  return c.body(null, 204);
});

// --- diary ---
api.get("/diary/:date", (c) => c.json(diary.getDay(dateStr.parse(c.req.param("date")))));
api.post(
  "/diary/entries",
  zValidator(
    "json",
    z.object({
      foodId: z.number().int(),
      quantityG: z.number().positive().optional(),
      serving: z.object({ name: z.string(), count: z.number().positive().optional() }).optional(),
      slot,
      date: dateStr.optional(),
    }),
  ),
  (c) => {
    const entry = diary.logFood(c.req.valid("json"));
    return c.json({ entry, day: diary.getDay(entry.date) }, 201);
  },
);
api.post(
  "/diary/quick",
  zValidator(
    "json",
    z.object({
      proteinG: z.number().nonnegative(),
      carbsG: z.number().nonnegative(),
      fatG: z.number().nonnegative(),
      energyKcal: z.number().nonnegative().optional(),
      label: z.string().optional(),
      slot,
      date: dateStr.optional(),
    }),
  ),
  (c) => {
    const entry = diary.logQuick(c.req.valid("json"));
    return c.json({ entry, day: diary.getDay(entry.date) }, 201);
  },
);
api.post(
  "/diary/meal",
  zValidator(
    "json",
    z.object({
      mealId: z.number().int(),
      slot,
      date: dateStr.optional(),
      scale: z.number().positive().optional(),
    }),
  ),
  (c) => {
    const { mealId, slot: s, date, scale } = c.req.valid("json");
    const entries = diary.logMeal(mealId, s, date, scale ?? 1);
    return c.json({ entries, day: diary.getDay(entries[0]!.date) }, 201);
  },
);
api.patch(
  "/diary/entries/:id",
  zValidator(
    "json",
    z.object({
      quantityG: z.number().positive().optional(),
      slot: slot.optional(),
      date: dateStr.optional(),
      label: z.string().optional(),
    }),
  ),
  (c) => {
    const entry = diary.updateEntry(Number(c.req.param("id")), c.req.valid("json"));
    return c.json({ entry, day: diary.getDay(entry.date) });
  },
);
api.delete("/diary/entries/:id", (c) => {
  diary.deleteEntry(Number(c.req.param("id")));
  return c.body(null, 204);
});

// --- diary sections (slots) ---
api.get("/slots", (c) => c.json(slots.listSlots()));
api.post(
  "/slots",
  zValidator("json", z.object({ name: z.string().min(1), permanent: z.boolean().optional() })),
  (c) => {
    const { name, permanent } = c.req.valid("json");
    return c.json(slots.createSlot(name, permanent ?? true), 201);
  },
);
api.patch(
  "/slots/:id",
  zValidator("json", z.object({ permanent: z.boolean().optional() })),
  (c) => c.json(slots.updateSlot(Number(c.req.param("id")), c.req.valid("json"))),
);
api.delete("/slots/:id", (c) => {
  slots.deleteSlot(Number(c.req.param("id")));
  return c.body(null, 204);
});

// --- meals ---
const mealItemsSchema = z
  .array(z.object({ foodId: z.number().int(), quantityG: z.number().positive() }))
  .min(1);
api.get("/meals", (c) => c.json(mealsSvc.listMeals()));
api.post(
  "/meals",
  zValidator(
    "json",
    z.object({ name: z.string().min(1), items: mealItemsSchema, notes: z.string().optional() }),
  ),
  (c) => {
    const { name, items, notes } = c.req.valid("json");
    return c.json(mealsSvc.createMeal(name, items, notes), 201);
  },
);
api.patch(
  "/meals/:id",
  zValidator(
    "json",
    z.object({ name: z.string().min(1).optional(), items: mealItemsSchema.optional(), notes: z.string().optional() }),
  ),
  (c) => c.json(mealsSvc.updateMeal(Number(c.req.param("id")), c.req.valid("json"))),
);
api.delete("/meals/:id", (c) => {
  mealsSvc.deleteMeal(Number(c.req.param("id")));
  return c.body(null, 204);
});

// --- goals ---
api.get("/goals", (c) => c.json(goalsSvc.getGoals(c.req.query("date"))));
api.put(
  "/goals",
  zValidator(
    "json",
    z.object({
      energyKcal: z.number().positive(),
      proteinG: z.number().nonnegative().optional(),
      carbsG: z.number().nonnegative().optional(),
      fatG: z.number().nonnegative().optional(),
      goalWeightKg: z.number().positive().optional(),
      weeklyRateKg: z.number().optional(),
      effectiveDate: dateStr.optional(),
    }),
  ),
  (c) => c.json(goalsSvc.setGoals(c.req.valid("json"))),
);

// --- weight ---
api.get("/weight", (c) => {
  const end = c.req.query("end") ?? insights.periodToRange("30d").end;
  const start = c.req.query("start") ?? insights.periodToRange("30d").start;
  return c.json(weight.getWeightHistory(start, end));
});
api.put(
  "/weight",
  zValidator(
    "json",
    z.object({ weightKg: z.number().positive(), date: dateStr.optional(), note: z.string().optional() }),
  ),
  (c) => {
    const { weightKg, date, note } = c.req.valid("json");
    return c.json(weight.logWeight(weightKg, date, note));
  },
);

// --- ai (photo estimation + provider config) ---
api.post(
  "/ai/estimate",
  zValidator(
    "json",
    z.object({
      imageBase64: z.string().min(1),
      mimeType: z
        .string()
        .regex(/^image\/(jpeg|png|webp|gif)$/, "expected image/jpeg, image/png, image/webp or image/gif"),
    }),
  ),
  async (c) => {
    const { imageBase64, mimeType } = c.req.valid("json");
    return c.json(await vision.estimateFoodFromPhoto(imageBase64, mimeType));
  },
);
api.get("/ai/config", (c) => c.json(maskedAiConfig()));
api.put(
  "/ai/config",
  zValidator(
    "json",
    z.object({
      enabled: z.boolean().optional(),
      provider: z.enum(["openai-compatible", "anthropic"]).optional(),
      baseUrl: z.string().optional(),
      model: z.string().optional(),
      apiKey: z.string().optional(),
      timeoutMs: z.number().int().positive().optional(),
    }),
  ),
  (c) => {
    setAiConfig(c.req.valid("json"));
    return c.json(maskedAiConfig());
  },
);
api.post("/ai/test", async (c) => c.json(await vision.testConnection()));

// --- insights ---
api.get("/summary", (c) => {
  const period = c.req.query("period") as insights.Period | undefined;
  const range = period
    ? insights.periodToRange(period)
    : { start: dateStr.parse(c.req.query("start")), end: dateStr.parse(c.req.query("end")) };
  return c.json(insights.getSummary(range.start, range.end));
});
