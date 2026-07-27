import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  apiCreateMeal,
  apiDeleteMeal,
  apiUpdateMeal,
  useFoodSearch,
  useRecentFoods,
  type Entry,
  type Food,
  type MealSummary,
  type Serving,
} from "../lib/api";
import { kcal, g } from "../lib/format";
import { MacroCells, MacroHeader, SlotTotals, type NutrMode } from "./MacroTable";

/** One ingredient in the draft: per-100g nutrients plus how much of it is in the meal. */
export interface BuilderItem {
  foodId: number;
  name: string;
  brand?: string | null;
  quantityG: number;
  per100: {
    energyKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fibreG: number;
    sugarsG: number;
    sodiumMg: number;
  };
  /** Named portions, when we have them (foods picked from search). */
  servings?: Serving[];
}

export function itemFromFood(food: Food, quantityG?: number): BuilderItem {
  return {
    foodId: food.id,
    name: food.name,
    brand: food.brand,
    // Start from the product's own serving where it has one — 100 g is almost
    // never the portion you mean.
    quantityG: quantityG ?? food.servings[0]?.grams ?? 100,
    per100: {
      energyKcal: food.energyKcal,
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatG: food.fatG,
      fibreG: food.fibreG ?? 0,
      sugarsG: food.sugarsG ?? 0,
      sodiumMg: food.sodiumMg ?? 0,
    },
    servings: food.servings,
  };
}

/**
 * Diary entry → draft ingredient. Entries snapshot nutrients at the logged
 * quantity, so we divide back out to per 100 g rather than refetching the food.
 * Returns null for quick entries, which have no food to point a meal item at.
 */
export function itemFromEntry(entry: Entry): BuilderItem | null {
  if (entry.kind !== "food" || entry.foodId == null || !entry.quantityG) return null;
  const scale = 100 / entry.quantityG;
  return {
    foodId: entry.foodId,
    name: entry.foodName ?? entry.label ?? `food #${entry.foodId}`,
    brand: entry.brand,
    quantityG: entry.quantityG,
    per100: {
      energyKcal: entry.energyKcal * scale,
      proteinG: entry.proteinG * scale,
      carbsG: entry.carbsG * scale,
      fatG: entry.fatG * scale,
      fibreG: (entry.fibreG ?? 0) * scale,
      sugarsG: (entry.sugarsG ?? 0) * scale,
      sodiumMg: (entry.sodiumMg ?? 0) * scale,
    },
  };
}

interface Row extends Omit<BuilderItem, "quantityG"> {
  /** Kept as text so the field can be cleared while typing. */
  qty: string;
}

const scaled = (row: Row) => {
  const s = (Number(row.qty) || 0) / 100;
  return {
    energyKcal: row.per100.energyKcal * s,
    proteinG: row.per100.proteinG * s,
    carbsG: row.per100.carbsG * s,
    fatG: row.per100.fatG * s,
    fibreG: row.per100.fibreG * s,
    sugarsG: row.per100.sugarsG * s,
    sodiumMg: row.per100.sodiumMg * s,
  };
};

/** Inline editor opened by tapping an ingredient row: amount, portions, remove. */
function RowEditor({
  row,
  onQty,
  onRemove,
  onClose,
}: {
  row: Row;
  onQty: (qty: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mb-2 border rule bg-surface p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="plaque">Grams</span>
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            value={row.qty}
            onChange={(e) => onQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onClose()}
            className="w-24 font-mono text-sm"
          />
        </label>
        <div className="ml-auto text-right font-mono text-xs text-muted">
          <div className="text-base text-ink">{kcal(scaled(row).energyKcal)} kcal</div>
          {row.brand ?? " "}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(row.servings ?? []).map((s) => (
          <button
            key={s.id}
            onClick={() => onQty(String(s.grams))}
            className={`border rule px-2.5 py-1 font-mono text-xs ${
              Number(row.qty) === s.grams ? "bg-raised !text-ink" : "text-muted active:bg-raised"
            }`}
          >
            {s.name} · {g(s.grams)}g
          </button>
        ))}
        {[50, 100, 150, 200, 250].map((n) => (
          <button
            key={n}
            onClick={() => onQty(String(n))}
            className={`border rule px-2.5 py-1 font-mono text-xs ${
              Number(row.qty) === n ? "bg-raised !text-ink" : "text-muted active:bg-raised"
            }`}
          >
            {n}g
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-1.5">
        <button
          onClick={onRemove}
          className="border rule px-3 py-2 font-mono text-xs text-muted hover:text-[var(--accent-2)]"
        >
          ✕ Remove
        </button>
        <button onClick={onClose} className="border rule px-3 py-2 font-mono text-xs text-muted">
          Done
        </button>
      </div>
    </div>
  );
}

/** Saved meal → draft ingredients, so editing starts from exactly what's stored. */
export function itemsFromMeal(meal: MealSummary): BuilderItem[] {
  return meal.items.map((i) => ({
    foodId: i.foodId,
    name: i.foodName,
    brand: i.brand,
    quantityG: i.quantityG,
    per100: {
      energyKcal: i.per100.energyKcal,
      proteinG: i.per100.proteinG,
      carbsG: i.per100.carbsG,
      fatG: i.per100.fatG,
      fibreG: i.per100.fibreG ?? 0,
      sugarsG: i.per100.sugarsG ?? 0,
      sodiumMg: i.per100.sodiumMg ?? 0,
    },
  }));
}

/**
 * Build or edit a saved meal — used on the Foods page, in the add sheet's
 * "My meals" tab, and from a diary selection. Rows read like diary entries:
 * per-item macros under the same column headers, section-style totals.
 * Pass `meal` to edit an existing one (PATCH) instead of creating a new one.
 */
export default function MealBuilder({
  meal,
  initialName = "",
  initialItems = [],
  mode = "macros",
  onSaved,
  onCancel,
  onDeleted,
}: {
  meal?: MealSummary;
  initialName?: string;
  initialItems?: BuilderItem[];
  mode?: NutrMode;
  onSaved: (meal: MealSummary) => void;
  onCancel: () => void;
  /** Only offered while editing — the row's own ✕ handles the list case. */
  onDeleted?: () => void;
}) {
  const editing = meal != null;
  const [name, setName] = useState(meal?.name ?? initialName);
  const [rows, setRows] = useState<Row[]>(() =>
    (meal ? itemsFromMeal(meal) : initialItems).map(({ quantityG, ...rest }) => ({
      ...rest,
      qty: String(quantityG),
    })),
  );
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = useFoodSearch(q);
  const recent = useRecentFoods();
  const qc = useQueryClient();

  const totals = rows.reduce(
    (t, row) => {
      const s = scaled(row);
      return {
        energyKcal: t.energyKcal + s.energyKcal,
        proteinG: t.proteinG + s.proteinG,
        carbsG: t.carbsG + s.carbsG,
        fatG: t.fatG + s.fatG,
        fibreG: t.fibreG + s.fibreG,
        sugarsG: t.sugarsG + s.sugarsG,
        sodiumMg: t.sodiumMg + s.sodiumMg,
      };
    },
    { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0, sugarsG: 0, sodiumMg: 0 },
  );

  const usable = rows.filter((r) => Number(r.qty) > 0);
  const add = (food: Food, quantityG?: number) => {
    setRows((rs) => [...rs, itemFromFoodRow(food, quantityG)]);
    setOpenRow(null);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ["meals"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const items = usable.map((r) => ({ foodId: r.foodId, quantityG: Number(r.qty) }));
      const saved = meal
        ? await apiUpdateMeal(meal.id, { name: name.trim(), items })
        : await apiCreateMeal({ name: name.trim(), items });
      onSaved(saved);
    });

  return (
    <div className="border rule bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="plaque">{editing ? "Edit meal" : "New meal"}</span>
        <button
          onClick={onCancel}
          className="-mr-1 px-2 py-1.5 font-mono text-xs text-muted active:text-ink md:hover:text-ink"
        >
          ✕ {editing ? "Close" : "Cancel"}
        </button>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Meal name — e.g. Breakfast bowl"
        className="mt-2 w-full"
      />

      {rows.length > 0 && (
        <>
          <div className="mt-4 flex items-center justify-between gap-3 pb-2">
            <span className="font-mono text-sm font-semibold text-amber">
              {kcal(totals.energyKcal)}{" "}
              <span className="text-[11px] font-normal text-muted">kcal</span>
            </span>
            <SlotTotals t={totals} mode={mode} />
          </div>
          <MacroHeader mode={mode} />
          <div className="divide-y divide-[var(--line)]/50">
            {rows.map((row, i) => (
              <div key={`${row.foodId}-${i}`}>
                <button
                  onClick={() => setOpenRow(openRow === i ? null : i)}
                  className={`flex min-h-[48px] w-full items-center justify-between gap-3 py-2.5 text-left active:bg-raised ${
                    openRow === i ? "bg-raised/50" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm">{row.name}</div>
                    <div className="font-mono text-[11px] text-muted">{g(Number(row.qty) || 0)} g</div>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-3">
                    <MacroCells t={scaled(row)} mode={mode} />
                    <span className="w-11 text-right font-mono text-sm">
                      {kcal(scaled(row).energyKcal)}
                    </span>
                  </div>
                </button>
                {openRow === i && (
                  <RowEditor
                    row={row}
                    onQty={(qty) =>
                      setRows((rs) => rs.map((r, j) => (j === i ? { ...r, qty } : r)))
                    }
                    onRemove={() => {
                      setRows((rs) => rs.filter((_, j) => j !== i));
                      setOpenRow(null);
                    }}
                    onClose={() => setOpenRow(null)}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 border-t rule pt-3">
        <span className="plaque">Add ingredient</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search foods…"
          className="mt-1.5 w-full text-base"
        />
        <div className="mt-1 max-h-72 overflow-y-auto">
          {q.trim().length >= 2 ? (
            <>
              {search.data?.map((f) => <PickRow key={f.id} food={f} onPick={add} />)}
              {search.data?.length === 0 && (
                <div className="py-6 text-center font-mono text-xs text-muted">
                  Nothing found — create it from the diary's New Food tab first.
                </div>
              )}
            </>
          ) : (
            <>
              <div className="plaque py-1.5">Recent</div>
              {recent.data?.map((r) => (
                <PickRow
                  key={r.food.id}
                  food={r.food}
                  portionG={r.lastQuantityG}
                  onPick={(f) => add(f, r.lastQuantityG)}
                />
              ))}
              {recent.data?.length === 0 && (
                <div className="py-6 text-center font-mono text-xs text-muted">
                  Search to find ingredients.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 font-mono text-xs" style={{ color: "var(--accent-2)" }}>
          {error}
        </div>
      )}

      <button
        disabled={busy || !name.trim() || usable.length === 0}
        onClick={save}
        className="glow mt-4 w-full py-2.5 font-display text-sm font-bold uppercase tracking-wider disabled:opacity-40"
        style={{ background: "var(--accent)", color: "#181614" }}
      >
        {busy
          ? "Saving…"
          : editing
            ? "Save changes"
            : `Save meal${usable.length ? ` · ${usable.length} ingredient${usable.length === 1 ? "" : "s"}` : ""}`}
      </button>

      {editing && onDeleted && (
        <div className="mt-3 flex justify-end gap-1.5">
          {confirmingDelete ? (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await apiDeleteMeal(meal.id);
                    onDeleted();
                  })
                }
                className="border rule px-3 py-2 font-mono text-xs"
                style={{ color: "var(--accent-2)", borderColor: "var(--accent-2)" }}
              >
                Delete “{meal.name}”
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="border rule px-3 py-2 font-mono text-xs text-muted"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="border rule px-3 py-2 font-mono text-xs text-muted md:hover:text-[var(--accent-2)]"
            >
              ✕ Delete meal
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const itemFromFoodRow = (food: Food, quantityG?: number): Row => {
  const { quantityG: qg, ...rest } = itemFromFood(food, quantityG);
  return { ...rest, qty: String(qg) };
};

function PickRow({
  food,
  portionG,
  onPick,
}: {
  food: Food;
  portionG?: number;
  onPick: (f: Food) => void;
}) {
  const scale = portionG != null ? portionG / 100 : 1;
  return (
    <button
      onClick={() => onPick(food)}
      className="flex min-h-[44px] w-full items-baseline justify-between gap-3 border-b rule py-2.5 text-left active:bg-raised md:hover:bg-raised"
    >
      <div className="min-w-0">
        <div className="truncate text-sm">{food.name}</div>
        <div className="truncate font-mono text-[11px] text-muted">
          {food.brand ? `${food.brand} · ` : ""}P{g(food.proteinG * scale)} C
          {g(food.carbsG * scale)} F{g(food.fatG * scale)}
          {portionG != null ? ` / ${g(portionG)}g` : " /100g"}
        </div>
      </div>
      <span className="shrink-0 font-mono text-sm">{kcal(food.energyKcal * scale)}</span>
    </button>
  );
}
