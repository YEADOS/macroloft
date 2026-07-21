import { useState } from "react";
import {
  apiCreateMeal,
  apiDeleteMeal,
  useFoodSearch,
  useMeals,
  type Food,
} from "../lib/api";
import { kcal, g } from "../lib/format";
import { useQueryClient } from "@tanstack/react-query";
import Plant from "../components/Plant";

interface DraftItem {
  food: Food;
  quantityG: number;
}

export default function Foods() {
  const [q, setQ] = useState("");
  const search = useFoodSearch(q);
  const meals = useMeals();
  const qc = useQueryClient();

  const [building, setBuilding] = useState(false);
  const [mealName, setMealName] = useState("");
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const draftTotals = draft.reduce(
    (t, d) => ({
      kcal: t.kcal + (d.food.energyKcal * d.quantityG) / 100,
      p: t.p + (d.food.proteinG * d.quantityG) / 100,
      c: t.c + (d.food.carbsG * d.quantityG) / 100,
      f: t.f + (d.food.fatG * d.quantityG) / 100,
    }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );

  return (
    <div>
      <header className="mb-6">
        <div className="plaque">Foods</div>
        <h1 className="font-display text-3xl font-black tracking-tight">
          Pantry & Meals
        </h1>
      </header>

      {/* meal builder */}
      <section className="border-b rule pb-6">
        <div className="flex items-baseline justify-between">
          <h2 className="plaque">Saved meals</h2>
          <button
            onClick={() => { setBuilding(!building); setError(null); }}
            className="border rule px-3 py-1 font-mono text-sm text-amber"
          >
            {building ? "cancel" : "+ new meal"}
          </button>
        </div>

        {building && (
          <div className="mt-3 border rule bg-surface p-4">
            <input
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              placeholder="Meal name — e.g. Breakfast bowl"
              className="w-full"
            />
            {draft.map((d, i) => (
              <div key={i} className="mt-2 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">{d.food.name}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={d.quantityG}
                  onChange={(e) => {
                    const next = [...draft];
                    next[i] = { ...d, quantityG: Number(e.target.value) || 0 };
                    setDraft(next);
                  }}
                  className="w-20 !py-1 font-mono text-xs"
                />
                <span className="font-mono text-[11px] text-muted">g</span>
                <button
                  onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                  className="plaque hover:!text-[var(--accent-2)]"
                >
                  ✕
                </button>
              </div>
            ))}
            {draft.length > 0 && (
              <div className="mt-3 font-mono text-xs text-muted">
                {kcal(draftTotals.kcal)} kcal · P{g(draftTotals.p)} C{g(draftTotals.c)} F{g(draftTotals.f)}
              </div>
            )}
            <div className="mt-2 font-mono text-[11px] text-muted">
              search below and tap a food to add it ↓
            </div>
            {error && (
              <div className="mt-2 font-mono text-xs" style={{ color: "var(--accent-2)" }}>{error}</div>
            )}
            <button
              disabled={!mealName || draft.length === 0}
              onClick={async () => {
                try {
                  await apiCreateMeal({
                    name: mealName,
                    items: draft.map((d) => ({ foodId: d.food.id, quantityG: d.quantityG })),
                  });
                  setBuilding(false);
                  setMealName("");
                  setDraft([]);
                  qc.invalidateQueries({ queryKey: ["meals"] });
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
              className="glow mt-3 w-full py-2 font-display text-sm font-bold uppercase tracking-wider disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#181614" }}
            >
              Save meal
            </button>
          </div>
        )}

        <div className="mt-2">
          {meals.data?.length === 0 && !building && (
            <div className="flex items-center gap-4 py-4">
              <Plant className="h-16 w-16 shrink-0" />
              <span className="font-mono text-sm text-muted">
                No saved meals yet — combos of ingredients you eat often.
              </span>
            </div>
          )}
          {meals.data?.map((m) => (
            <div key={m.id} className="group flex items-baseline justify-between border-b rule py-3">
              <div>
                <div className="text-sm">{m.name}</div>
                <div className="font-mono text-[11px] text-muted">
                  {m.items.map((i) => `${i.foodName} ${g(i.quantityG)}g`).join(" · ")}
                </div>
              </div>
              <div className="flex items-baseline gap-3">
                <button
                  onClick={async () => {
                    await apiDeleteMeal(m.id);
                    qc.invalidateQueries({ queryKey: ["meals"] });
                  }}
                  className="row-action plaque px-2 py-1.5 hover:!text-[var(--accent-2)]"
                >
                  ✕
                </button>
                <span className="font-mono text-sm">{kcal(m.totals.energyKcal)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* food browser */}
      <section className="mt-6">
        <h2 className="plaque">Food database</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search AFCD + Australian supermarket foods…"
          className="mt-2 w-full"
        />
        <div className="mt-1">
          {search.data?.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                // Start from the product's own serving where it has one — 100 g
                // is almost never the portion you mean.
                if (building)
                  setDraft([...draft, { food: f, quantityG: f.servings[0]?.grams ?? 100 }]);
              }}
              className={`flex w-full items-baseline justify-between gap-3 border-b rule py-2.5 text-left ${
                building ? "hover:bg-raised" : "cursor-default"
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-sm">{f.name}</div>
                <div className="font-mono text-[11px] text-muted">
                  {f.brand ? `${f.brand} · ` : ""}
                  <span className="text-timber">{{ afcd: "AFCD", off: "OFF", custom: "MINE" }[f.source]}</span>
                  {" · "}P{g(f.proteinG)} C{g(f.carbsG)} F{g(f.fatG)} /100g
                </div>
              </div>
              <span className="shrink-0 font-mono text-sm">{kcal(f.energyKcal)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
