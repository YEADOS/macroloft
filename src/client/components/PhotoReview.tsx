import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { kcalFromMacros } from "@shared/nutrition";
import {
  apiCreateFood,
  apiLogFood,
  apiSaveScanPhoto,
  type EstimateItem,
  type MealEstimate,
} from "../lib/api";
import { kcal, g } from "../lib/format";

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (s: string) => Number(s) || 0;

/**
 * One editable component of the estimate. Numeric fields are strings so a
 * half-typed value ("" or "1.") doesn't fight the input, exactly like the New
 * Food form. Macros stay per 100 g; `quantityG` is what gets logged.
 */
interface Row {
  id: number;
  include: boolean;
  open: boolean;
  name: string;
  brand?: string;
  /** Countable pieces: unit is set together with count + unitGrams, or not at all. */
  unit?: string;
  count: string;
  unitGrams: number;
  quantityG: string;
  /** Per 100 g. Empty kcal means "derive it from the macros". */
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  /** Micros ride along untouched — the AI's values, or absent. */
  micros: { satFatG?: number; sugarsG?: number; fibreG?: number; sodiumMg?: number };
  note?: string;
  /** What the model originally claimed, shown verbatim so edits are visible as edits. */
  claim: string;
}

const optional = (v?: number) => (v == null ? "" : String(v));

function toRow(item: EstimateItem, id: number): Row {
  const countable = item.unit != null && item.count != null && item.unitGrams != null;
  return {
    id,
    include: true,
    open: false,
    name: item.name,
    brand: item.brand,
    unit: countable ? item.unit : undefined,
    count: countable ? String(item.count) : "",
    unitGrams: countable ? item.unitGrams! : item.quantityG,
    quantityG: String(item.quantityG),
    kcal: optional(item.energyKcal),
    protein: String(item.proteinG),
    carbs: String(item.carbsG),
    fat: String(item.fatG),
    micros: {
      satFatG: item.satFatG,
      sugarsG: item.sugarsG,
      fibreG: item.fibreG,
      sodiumMg: item.sodiumMg,
    },
    note: item.note,
    claim: countable
      ? `AI counted ${g(item.count!)} × ${item.unit} at ${g(item.unitGrams!)} g each`
      : `AI estimated ${g(item.quantityG)} g in total`,
  };
}

/** Energy + macros for the portion currently in the row, not per 100 g. */
function portionTotals(r: Row) {
  const scale = num(r.quantityG) / 100;
  const per100Kcal = r.kcal ? num(r.kcal) : kcalFromMacros(num(r.protein), num(r.carbs), num(r.fat));
  return {
    energyKcal: per100Kcal * scale,
    proteinG: num(r.protein) * scale,
    carbsG: num(r.carbs) * scale,
    fatG: num(r.fat) * scale,
  };
}

const MACRO_FIELDS = [
  ["kcal", "kcal"],
  ["protein", "Protein g"],
  ["carbs", "Carbs g"],
  ["fat", "Fat g"],
] as const;

/**
 * Confirm-before-save screen for an itemised photo estimate. Every component is
 * a row the user can rename, recount, reweigh or drop; pressing log creates one
 * custom food and one diary entry per included row, through the same
 * POST /foods + POST /diary/entries the manual path uses.
 *
 * The items go in as one group: they all carry the same `mealLogId`, so the
 * diary draws the slice of cake as one block instead of four loose rows, and
 * the photo they came from is filed under the same id.
 */
export default function PhotoReview({
  estimate,
  photo,
  slot,
  date,
  onDone,
  onDiscard,
}: {
  estimate: MealEstimate;
  /** The (downscaled) photo that was estimated, kept with the logged group. */
  photo?: { base64: string; mimeType: string };
  slot: string;
  date: string;
  onDone: () => void;
  onDiscard: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => estimate.items.map(toRow));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True once the entries are in the diary — only ever seen when the photo
  // upload afterwards failed, so re-logging would double everything up.
  const [logged, setLogged] = useState(false);
  // Stable for the life of this review, so a retry after a half-failed log
  // rejoins the same group and overwrites its photo rather than forking one.
  const [mealLogId] = useState(() => crypto.randomUUID());
  const qc = useQueryClient();

  const patch = (id: number, next: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...next } : r)));

  // Count and grams stay in lockstep: stepping the count rescales the weight at
  // the same grams-per-piece; typing a weight re-derives grams-per-piece for the
  // count on screen. Either way the row keeps saying what it counted.
  const setCount = (r: Row, next: number) => {
    const count = Math.max(1, Math.round(next));
    patch(r.id, { count: String(count), quantityG: String(r1(count * r.unitGrams)) });
  };
  const setGrams = (r: Row, value: string) => {
    const count = num(r.count);
    patch(r.id, {
      quantityG: value,
      unitGrams: r.unit && count > 0 ? r1(num(value) / count) : r.unitGrams,
    });
  };

  const included = rows.filter((r) => r.include);
  const total = included.reduce(
    (acc, r) => {
      const t = portionTotals(r);
      return {
        energyKcal: acc.energyKcal + t.energyKcal,
        proteinG: acc.proteinG + t.proteinG,
        carbsG: acc.carbsG + t.carbsG,
        fatG: acc.fatG + t.fatG,
      };
    },
    { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  /** What the diary block will be called — the dish, not the components. */
  const groupName = estimate.name?.trim() || "Photo scan";

  const logAll = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const r of included) {
        const quantityG = num(r.quantityG);
        const food = await apiCreateFood({
          name: r.name.trim(),
          brand: r.brand || undefined,
          energyKcal: r.kcal ? num(r.kcal) : undefined,
          proteinG: num(r.protein),
          carbsG: num(r.carbs),
          fatG: num(r.fat),
          ...r.micros,
          // The piece, not the plate — so re-logging "1 wrap" later is one tap.
          servings: [
            r.unit
              ? { name: r.unit, grams: r1(r.unitGrams) }
              : { name: "serving", grams: quantityG },
          ],
        });
        await apiLogFood({ foodId: food.id, quantityG, slot, date, mealLogId, mealName: groupName });
      }
      setLogged(true);
      for (const k of ["search", "recent", "food"]) qc.invalidateQueries({ queryKey: [k] });
      // The photo comes last: it's the nice-to-have, and losing it must never
      // cost the user the log they just confirmed.
      if (photo)
        await apiSaveScanPhoto({
          mealLogId,
          imageBase64: photo.base64,
          mimeType: photo.mimeType,
          date,
        });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canLog = included.length > 0 && included.every((r) => r.name.trim() && num(r.quantityG) > 0);

  return (
    <div className="space-y-3">
      <div
        className="border rule p-3"
        style={{
          borderColor: "var(--accent)",
          background: "color-mix(in oklab, var(--accent) 8%, transparent)",
        }}
      >
        <div className="plaque" style={{ color: "var(--accent)" }}>
          AI estimate · {estimate.items.length} item{estimate.items.length === 1 ? "" : "s"}
        </div>
        <div className="text-sm">{estimate.name ?? "Check each item before logging."}</div>
        {estimate.note && (
          <div className="mt-1 font-mono text-[11px] text-muted">{estimate.note}</div>
        )}
        <div className="mt-1 font-mono text-[11px] text-muted">
          Logged as one group — {groupName}
          {photo ? ", with the photo kept" : ""}.
        </div>
      </div>

      {error && (
        <div className="border rule p-3 font-mono text-xs" style={{ color: "var(--accent-2)" }}>
          {logged ? `Items logged, but the photo wasn't saved: ${error}` : error}
        </div>
      )}

      {rows.map((r) => {
        const t = portionTotals(r);
        return (
          <div
            key={r.id}
            className={`border rule bg-surface p-3 ${r.include ? "" : "opacity-45"}`}
          >
            <div className="flex items-start gap-2">
              <button
                onClick={() => patch(r.id, { include: !r.include })}
                aria-label={r.include ? `Skip ${r.name}` : `Include ${r.name}`}
                className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center border rule font-mono text-sm"
                style={
                  r.include
                    ? { borderColor: "var(--accent)", color: "var(--accent)" }
                    : { color: "var(--text-muted)" }
                }
              >
                {r.include ? "✓" : "○"}
              </button>
              <input
                value={r.name}
                onChange={(e) => patch(r.id, { name: e.target.value })}
                className="min-w-0 flex-1 text-base"
              />
            </div>

            <div className="mt-2 font-mono text-[11px] text-muted">{r.claim}</div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {r.unit && (
                <div className="inline-flex items-center border rule">
                  <button
                    onClick={() => setCount(r, num(r.count) - 1)}
                    disabled={num(r.count) <= 1}
                    aria-label={`One fewer ${r.unit}`}
                    className="h-11 w-11 font-mono text-lg text-muted disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="min-w-[6.5rem] px-1 text-center font-mono text-xs">
                    {g(num(r.count))} {r.unit}
                    {num(r.count) === 1 ? "" : "s"}
                  </span>
                  <button
                    onClick={() => setCount(r, num(r.count) + 1)}
                    aria-label={`One more ${r.unit}`}
                    className="h-11 w-11 font-mono text-lg text-muted"
                  >
                    +
                  </button>
                </div>
              )}
              <label className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={r.quantityG}
                  onChange={(e) => setGrams(r, e.target.value)}
                  className="w-24 font-mono"
                />
                <span className="plaque">g total</span>
              </label>
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-3">
              <div className="font-mono text-[11px] text-muted">
                P{g(t.proteinG)} C{g(t.carbsG)} F{g(t.fatG)}
              </div>
              <div className="font-mono text-sm">{kcal(t.energyKcal)} kcal</div>
            </div>

            {r.note && <div className="mt-1 font-mono text-[11px] text-muted">{r.note}</div>}

            <button
              onClick={() => patch(r.id, { open: !r.open })}
              className="mt-2 plaque py-2 hover:text-ink"
            >
              {r.open ? "▾ Hide macros" : "▸ Edit macros per 100 g"}
            </button>
            {r.open && (
              <div className="grid grid-cols-2 gap-3">
                {MACRO_FIELDS.map(([key, label]) => (
                  <label key={key} className="flex flex-col gap-1">
                    <span className="plaque">
                      {label} {key === "kcal" ? "(optional)" : ""}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={r[key]}
                      onChange={(e) => patch(r.id, { [key]: e.target.value } as Partial<Row>)}
                      className="font-mono"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-baseline justify-between border-t rule pt-3">
        <div className="plaque">
          Total · {included.length} item{included.length === 1 ? "" : "s"}
        </div>
        <div className="text-right">
          <div className="font-mono text-lg">{kcal(total.energyKcal)} kcal</div>
          <div className="font-mono text-[11px] text-muted">
            P{g(total.proteinG)} C{g(total.carbsG)} F{g(total.fatG)}
          </div>
        </div>
      </div>

      <button
        disabled={busy || (!logged && !canLog)}
        onClick={logged ? onDone : logAll}
        className="glow w-full py-2.5 font-display text-sm font-bold uppercase tracking-wider disabled:opacity-40"
        style={{ background: "var(--accent)", color: "#181614" }}
      >
        {logged
          ? "Done"
          : busy
            ? "Logging…"
            : `Log ${included.length} item${included.length === 1 ? "" : "s"} to ${slot}`}
      </button>
      {!logged && (
        <button
          onClick={onDiscard}
          disabled={busy}
          className="w-full border rule py-2.5 font-mono text-xs text-muted active:bg-raised md:hover:text-ink"
        >
          Discard & take another photo
        </button>
      )}
    </div>
  );
}
