import { beforeAll, describe, expect, test } from "bun:test";

process.env.DB_PATH = `${process.env.TMPDIR ?? "/tmp"}/macroloft-test-${Date.now()}.db`;

const { db } = await import("../db/client");
const { ensureFts } = await import("../db/fts");
const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
const foods = await import("./foods");
const diary = await import("./diary");
const mealsSvc = await import("./meals");
const goalsSvc = await import("./goals");
const weight = await import("./weight");
const insights = await import("./insights");
const { kcalFromMacros } = await import("../../shared/nutrition");

beforeAll(() => {
  migrate(db, { migrationsFolder: `${import.meta.dir}/../../../drizzle` });
  ensureFts();
});

describe("nutrition math", () => {
  test("atwater factors", () => {
    expect(kcalFromMacros(10, 20, 5)).toBe(10 * 4 + 20 * 4 + 5 * 9);
  });
});

describe("foods", () => {
  test("create custom food computes kcal from macros", () => {
    const f = foods.createCustomFood({
      name: "Whey Scoop",
      proteinG: 80,
      carbsG: 5,
      fatG: 6,
      servings: [{ name: "1 scoop", grams: 30 }],
    });
    expect(f.energyKcal).toBe(80 * 4 + 5 * 4 + 6 * 9);
    expect(f.servings).toHaveLength(1);
  });

  test("fts search finds by partial name", () => {
    const hits = foods.searchFoods("whey sc");
    expect(hits.map((h) => h.name)).toContain("Whey Scoop");
  });

  test("search matches across a brand's spacing", () => {
    // OFF carries the same brand as both "Sun Rice" and "SunRice"; a run-together
    // query must reach either spelling.
    foods.createCustomFood({ name: "Jasmine Rice", brand: "Sun Rice", proteinG: 4, carbsG: 42, fatG: 1 });
    const hits = foods.searchFoods("sunrice jasmine");
    expect(hits.map((h) => h.brand)).toContain("Sun Rice");
  });

  test("search collapses duplicate name+brand rows", () => {
    const { sqlite } = require("../db/client");
    for (let i = 0; i < 3; i++)
      sqlite.run(
        `INSERT INTO foods (source, source_id, name, brand, energy_kcal, protein_g, fat_g, carbs_g, created_at, updated_at)
         VALUES ('off','DUP${i}','Duplicated Yoghurt','Dupebrand',100,10,1,10,0,0)`,
      );
    const hits = foods.searchFoods("duplicated yoghurt");
    expect(hits.filter((h) => h.name === "Duplicated Yoghurt")).toHaveLength(1);
  });

  test("non-custom foods are read-only", () => {
    // simulate an imported food
    const { sqlite } = require("../db/client");
    sqlite.run(
      `INSERT INTO foods (source, source_id, name, energy_kcal, protein_g, fat_g, carbs_g, created_at, updated_at)
       VALUES ('afcd','TEST1','Test Import Food',100,10,1,10,0,0)`,
    );
    const imported = foods.searchFoods("test import")[0]!;
    expect(() => foods.updateCustomFood(imported.id, { name: "nope" })).toThrow(/read-only/);
    expect(() => foods.deleteCustomFood(imported.id)).toThrow(/cannot be deleted/);
  });
});

describe("diary", () => {
  test("log by serving name snapshots scaled nutrients", () => {
    const whey = foods.searchFoods("whey scoop")[0]!;
    const entry = diary.logFood({
      foodId: whey.id,
      serving: { name: "1 scoop", count: 2 },
      slot: "breakfast",
      date: "2026-07-01",
    });
    expect(entry.quantityG).toBe(60);
    expect(entry.proteinG).toBeCloseTo(48, 1); // 80g/100g * 60g
  });

  test("unknown serving name errors helpfully", () => {
    const whey = foods.searchFoods("whey scoop")[0]!;
    expect(() =>
      diary.logFood({ foodId: whey.id, serving: { name: "1 cup" }, slot: "lunch" }),
    ).toThrow(/1 scoop/);
  });

  test("quick entry auto-computes kcal", () => {
    const e = diary.logQuick({
      proteinG: 30,
      carbsG: 40,
      fatG: 10,
      slot: "lunch",
      date: "2026-07-01",
    });
    expect(e.energyKcal).toBe(30 * 4 + 40 * 4 + 10 * 9);
  });

  test("quantity edit rescales the snapshot, not the food", () => {
    const whey = foods.searchFoods("whey scoop")[0]!;
    const e = diary.logFood({ foodId: whey.id, quantityG: 100, slot: "dinner", date: "2026-07-02" });
    const updated = diary.updateEntry(e.id, { quantityG: 50 });
    expect(updated.proteinG).toBeCloseTo(40, 1);
    expect(updated.energyKcal).toBeCloseTo(e.energyKcal / 2, 1);
  });

  test("getDay groups by slot and computes remaining vs goals", () => {
    goalsSvc.setGoals({ energyKcal: 2000, proteinG: 150, effectiveDate: "2026-06-01" });
    const day = diary.getDay("2026-07-01");
    expect(day.slots.breakfast!.length).toBe(1);
    expect(day.slots.lunch!.length).toBe(1);
    expect(day.remaining!.energyKcal).toBeCloseTo(2000 - day.totals.energyKcal, 1);
  });

  test("getDay carries per-slot totals and food names", () => {
    const day = diary.getDay("2026-07-01");
    expect(day.slots.breakfast![0]!.foodName).toBe("Whey Scoop");
    expect(day.slotTotals.breakfast!.energyKcal).toBeCloseTo(
      day.slots.breakfast![0]!.energyKcal,
      1,
    );
    expect(day.slotTotals.snacks!.energyKcal).toBe(0);
  });

  test("recent foods return the last quantity used, newest first", () => {
    const whey = foods.searchFoods("whey scoop")[0]!;
    diary.logFood({ foodId: whey.id, quantityG: 45, slot: "snacks", date: "2026-07-03" });
    const recent = foods.recentFoods(10);
    expect(recent[0]!.food.id).toBe(whey.id);
    expect(recent[0]!.lastQuantityG).toBe(45);
    expect(recent[0]!.timesLogged).toBeGreaterThan(1);
    // slot-scoped recents only see that slot's history
    expect(foods.recentFoods(10, "snacks")[0]!.lastQuantityG).toBe(45);
  });
});

describe("diary sections (slots)", () => {
  const slots = require("./slots") as typeof import("./slots");

  test("defaults are seeded in order", () => {
    expect(slots.listSlots().map((s) => s.name)).toEqual([
      "breakfast",
      "lunch",
      "dinner",
      "snacks",
    ]);
  });

  test("logging to an unknown section lists the valid ones", () => {
    const whey = foods.searchFoods("whey scoop")[0]!;
    expect(() =>
      diary.logFood({ foodId: whey.id, quantityG: 30, slot: "elevenses", date: "2026-07-04" }),
    ).toThrow(/breakfast, lunch, dinner, snacks/);
  });

  test("permanent custom section appears on every day; one-off only when used", () => {
    slots.createSlot("drinks", true);
    slots.createSlot("cheat", false);
    const empty = diary.getDay("2026-07-10");
    expect(empty.slotList.map((s) => s.name)).toContain("drinks");
    expect(empty.slotList.map((s) => s.name)).not.toContain("cheat");
    const whey = foods.searchFoods("whey scoop")[0]!;
    diary.logFood({ foodId: whey.id, quantityG: 30, slot: "cheat", date: "2026-07-10" });
    const used = diary.getDay("2026-07-10");
    expect(used.slotList.map((s) => s.name)).toContain("cheat");
    expect(used.slots.cheat!.length).toBe(1);
  });

  test("slot names are matched case-insensitively and canonicalised", () => {
    const whey = foods.searchFoods("whey scoop")[0]!;
    const e = diary.logFood({ foodId: whey.id, quantityG: 30, slot: "Drinks", date: "2026-07-10" });
    expect(e.slot).toBe("drinks");
  });

  test("moving an entry to another section", () => {
    const whey = foods.searchFoods("whey scoop")[0]!;
    const e = diary.logFood({ foodId: whey.id, quantityG: 30, slot: "lunch", date: "2026-07-11" });
    const moved = diary.updateEntry(e.id, { slot: "dinner" });
    expect(moved.slot).toBe("dinner");
    expect(moved.energyKcal).toBe(e.energyKcal);
  });

  test("deleting a section in use is refused; empty one deletes", () => {
    const cheat = slots.listSlots().find((s) => s.name === "cheat")!;
    expect(() => slots.deleteSlot(cheat.id)).toThrow(/entr/);
    const spare = slots.createSlot("spare", true);
    slots.deleteSlot(spare.id);
    expect(slots.listSlots().map((s) => s.name)).not.toContain("spare");
  });

  test("duplicate section names are rejected", () => {
    expect(() => slots.createSlot("Drinks")).toThrow(/already exists/);
  });
});

describe("meals", () => {
  test("create, log with scale, entries share meal_log_id", () => {
    const whey = foods.searchFoods("whey scoop")[0]!;
    const meal = mealsSvc.createMeal("Shake", [{ foodId: whey.id, quantityG: 60 }]);
    expect(meal.totals.proteinG).toBeCloseTo(48, 1);
    const entries = diary.logMeal(meal.id, "snacks", "2026-07-03", 0.5);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.quantityG).toBe(30);
    expect(entries[0]!.mealLogId).toBeTruthy();
  });
});

describe("goals history", () => {
  test("dated goals: past dates keep old targets", () => {
    goalsSvc.setGoals({ energyKcal: 1800, effectiveDate: "2026-07-10" });
    expect(goalsSvc.getGoals("2026-07-05")!.energyKcal).toBe(2000);
    expect(goalsSvc.getGoals("2026-07-15")!.energyKcal).toBe(1800);
    // carried over from previous goal row
    expect(goalsSvc.getGoals("2026-07-15")!.proteinG).toBe(150);
  });
});

describe("weight", () => {
  test("same-day log upserts; trend is 7-day moving average", () => {
    weight.logWeight(90, "2026-07-01");
    weight.logWeight(89, "2026-07-01"); // overwrite
    weight.logWeight(88, "2026-07-02");
    const h = weight.getWeightHistory("2026-07-01", "2026-07-02");
    expect(h.entries).toHaveLength(2);
    expect(h.entries[0]!.weightKg).toBe(89);
    expect(h.entries[1]!.trendKg).toBeCloseTo(88.5, 1);
    expect(h.changeOverRangeKg).toBeCloseTo(-1, 1);
  });
});

describe("insights", () => {
  test("summary aggregates days, split, adherence", () => {
    const s = insights.getSummary("2026-07-01", "2026-07-05");
    expect(s.loggedDays).toBeGreaterThanOrEqual(3);
    expect(s.totalDays).toBe(5);
    const split = s.macroSplit!;
    expect(split.proteinPct + split.carbsPct + split.fatPct).toBeGreaterThanOrEqual(99);
    expect(s.targets!.energyKcal).toBe(2000); // targets active at range end
  });
});
