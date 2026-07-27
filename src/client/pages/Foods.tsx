import { useState } from "react";
import { useFoodSearch, useMeals } from "../lib/api";
import { kcal, g } from "../lib/format";
import Plant from "../components/Plant";
import MealBuilder from "../components/MealBuilder";

export default function Foods() {
  const [q, setQ] = useState("");
  const search = useFoodSearch(q);
  const meals = useMeals();

  const [building, setBuilding] = useState(false);
  // Tapping a saved meal opens it in the builder — same rows, same editing.
  const [editing, setEditing] = useState<number | null>(null);
  const open = meals.data?.find((m) => m.id === editing);

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
          {!building && editing == null && (
            <button
              onClick={() => setBuilding(true)}
              className="border rule px-3 py-1.5 font-mono text-sm text-amber active:bg-raised md:hover:glow"
            >
              + new meal
            </button>
          )}
        </div>

        {building && (
          <div className="mt-3">
            <MealBuilder onSaved={() => setBuilding(false)} onCancel={() => setBuilding(false)} />
          </div>
        )}

        {open && (
          <div className="mt-3">
            <MealBuilder
              key={open.id}
              meal={open}
              onSaved={() => setEditing(null)}
              onCancel={() => setEditing(null)}
              onDeleted={() => setEditing(null)}
            />
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
            <button
              key={m.id}
              onClick={() => { setEditing(editing === m.id ? null : m.id); setBuilding(false); }}
              className={`flex min-h-[48px] w-full items-baseline justify-between gap-3 border-b rule py-3 text-left active:bg-raised md:hover:bg-raised ${
                editing === m.id ? "bg-raised/50" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="text-sm">{m.name}</div>
                <div className="truncate font-mono text-[11px] text-muted">
                  {m.items.map((i) => `${i.foodName} ${g(i.quantityG)}g`).join(" · ")}
                </div>
              </div>
              <div className="flex shrink-0 items-baseline gap-3">
                <span className="plaque">edit</span>
                <span className="font-mono text-sm">{kcal(m.totals.energyKcal)}</span>
              </div>
            </button>
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
            <div
              key={f.id}
              className="flex w-full items-baseline justify-between gap-3 border-b rule py-2.5 text-left"
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
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
