import { useState } from "react";
import { DEFAULT_SLOTS } from "@shared/nutrition";
import {
  apiCreateSlot,
  apiDeleteEntry,
  apiDeleteSlot,
  apiUpdateEntry,
  useDay,
  useFood,
  type DiarySlot,
  type Entry,
  type Totals,
} from "../lib/api";
import { humanDate, kcal, g, shiftDate, todayStr } from "../lib/format";
import { useQueryClient } from "@tanstack/react-query";
import DayGauge from "../components/DayGauge";
import AddSheet from "../components/AddSheet";
import Plant from "../components/Plant";

export type NutrMode = "macros" | "nutrients";

const isDefaultSlot = (name: string) => (DEFAULT_SLOTS as readonly string[]).includes(name);

/** The three per-row numbers: P/C/F in macro mode, fibre/sugars/sodium in nutrient mode. */
function MacroCells({
  t,
  mode,
  strong,
}: {
  t: Pick<Totals, "proteinG" | "carbsG" | "fatG" | "fibreG" | "sugarsG" | "sodiumMg">;
  mode: NutrMode;
  strong?: boolean;
}) {
  const cells: [string, string, string][] =
    mode === "macros"
      ? [
          ["P", g(t.proteinG), "var(--chart-protein)"],
          ["C", g(t.carbsG), "var(--chart-carbs)"],
          ["F", g(t.fatG), "var(--chart-fat)"],
        ]
      : [
          ["FB", g(t.fibreG), "var(--text-muted)"],
          ["SU", g(t.sugarsG), "var(--text-muted)"],
          ["NA", `${Math.round(t.sodiumMg)}`, "var(--text-muted)"],
        ];
  return (
    <span className={`inline-flex gap-2 font-mono ${strong ? "text-xs" : "text-[11px]"}`}>
      {cells.map(([label, value, color]) => (
        <span key={label} className="min-w-[2.4rem] text-right">
          <span style={{ color }}>{label}</span>
          <span className={strong ? "text-ink" : ""}>{value}</span>
        </span>
      ))}
    </span>
  );
}

/** Inline editor opened by tapping a row: quantity (grams or servings), move, delete. */
function EntryEditor({
  entry,
  slots,
  onClose,
  onChanged,
}: {
  entry: Entry;
  slots: DiarySlot[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const food = useFood(entry.kind === "food" ? entry.foodId : null);
  const servings = food.data?.servings ?? [];
  const [unit, setUnit] = useState(-1); // -1 = grams, else index into servings
  const [amount, setAmount] = useState(entry.quantityG?.toString() ?? "");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const serving = unit >= 0 ? servings[unit] : undefined;
  const newGrams = serving ? serving.grams * (Number(amount) || 0) : Number(amount) || 0;
  const ratio = entry.quantityG ? newGrams / entry.quantityG : 1;
  const changed = entry.quantityG != null && newGrams > 0 && newGrams !== entry.quantityG;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-2 border rule bg-surface p-3">
      {entry.kind === "food" && entry.quantityG != null && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="plaque">Amount</span>
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && changed)
                  act(() => apiUpdateEntry(entry.id, { quantityG: newGrams }));
                if (e.key === "Escape") onClose();
              }}
              className="w-24 font-mono text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="plaque">Unit</span>
            <select
              value={unit}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setUnit(idx);
                // Re-express the current portion in the new unit so kcal doesn't jump.
                const s = idx >= 0 ? servings[idx] : undefined;
                setAmount(
                  s
                    ? (Math.round(((entry.quantityG ?? 0) / s.grams) * 100) / 100).toString()
                    : (entry.quantityG ?? 0).toString(),
                );
              }}
              className="max-w-[11rem] text-sm"
            >
              <option value={-1}>grams</option>
              {servings.map((s, i) => (
                <option key={s.id} value={i}>
                  {s.name} ({g(s.grams)}g)
                </option>
              ))}
            </select>
          </label>
          <div className="ml-auto text-right font-mono text-xs text-muted">
            <div className="text-base text-ink">{kcal(entry.energyKcal * ratio)} kcal</div>
            {serving ? `= ${g(newGrams)}g` : " "}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="plaque">Section</span>
          <select
            value={entry.slot}
            disabled={busy}
            onChange={(e) => act(() => apiUpdateEntry(entry.id, { slot: e.target.value }))}
            className="text-sm capitalize"
          >
            {slots.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex gap-1.5">
          {confirming ? (
            <>
              <button
                disabled={busy}
                onClick={() => act(() => apiDeleteEntry(entry.id))}
                className="border rule px-3 py-2 font-mono text-xs"
                style={{ color: "var(--accent-2)", borderColor: "var(--accent-2)" }}
              >
                Delete
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="border rule px-3 py-2 font-mono text-xs text-muted"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setConfirming(true)}
                className="border rule px-3 py-2 font-mono text-xs text-muted hover:text-[var(--accent-2)]"
              >
                ✕ Delete
              </button>
              {changed ? (
                <button
                  disabled={busy}
                  onClick={() => act(() => apiUpdateEntry(entry.id, { quantityG: newGrams }))}
                  className="px-4 py-2 font-display text-xs font-bold uppercase tracking-wider"
                  style={{ background: "var(--accent)", color: "#181614" }}
                >
                  Save
                </button>
              ) : (
                <button onClick={onClose} className="border rule px-3 py-2 font-mono text-xs text-muted">
                  Close
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  slots,
  mode,
  onChanged,
}: {
  entry: Entry;
  slots: DiarySlot[];
  mode: NutrMode;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`flex min-h-[44px] w-full items-center justify-between gap-3 py-2 text-left active:bg-raised ${
          open ? "bg-raised/50" : ""
        }`}
      >
        <div className="min-w-0">
          <div className="truncate text-sm">{entry.label ?? entry.foodName ?? "…"}</div>
          <div className="font-mono text-[11px] text-muted">
            {entry.kind === "food" ? `${g(entry.quantityG ?? 0)} g` : "quick entry"}
          </div>
        </div>
        <div className="flex shrink-0 items-baseline gap-3">
          <MacroCells
            t={{
              proteinG: entry.proteinG,
              carbsG: entry.carbsG,
              fatG: entry.fatG,
              fibreG: entry.fibreG ?? 0,
              sugarsG: entry.sugarsG ?? 0,
              sodiumMg: entry.sodiumMg ?? 0,
            }}
            mode={mode}
          />
          <span className="w-11 text-right font-mono text-sm">{kcal(entry.energyKcal)}</span>
        </div>
      </button>
      {open && (
        <EntryEditor entry={entry} slots={slots} onClose={() => setOpen(false)} onChanged={onChanged} />
      )}
    </div>
  );
}

function AddSection({ onCreated }: { onCreated: (slot: DiarySlot) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [permanent, setPermanent] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full border border-dashed rule py-2.5 font-mono text-xs text-muted hover:text-ink"
      >
        + section
      </button>
    );

  return (
    <div className="mt-4 border rule bg-surface p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="plaque">New section</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="drinks"
            className="text-sm"
          />
        </label>
        <label className="flex items-center gap-2 py-2.5 font-mono text-xs text-muted">
          <input
            type="checkbox"
            checked={permanent}
            onChange={(e) => setPermanent(e.target.checked)}
            className="!p-0 h-4 w-4"
          />
          every day
        </label>
        <div className="flex gap-1.5">
          <button
            disabled={!name.trim()}
            onClick={async () => {
              try {
                const slot = await apiCreateSlot({ name: name.trim(), permanent });
                setOpen(false);
                setName("");
                setError(null);
                onCreated(slot);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
            className="px-4 py-2 font-display text-xs font-bold uppercase tracking-wider disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#181614" }}
          >
            Create
          </button>
          <button
            onClick={() => { setOpen(false); setError(null); }}
            className="border rule px-3 py-2 font-mono text-xs text-muted"
          >
            Cancel
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-2 font-mono text-xs" style={{ color: "var(--accent-2)" }}>{error}</div>
      )}
    </div>
  );
}

export default function Diary() {
  const [date, setDate] = useState(todayStr());
  const [adding, setAdding] = useState<string | null>(null);
  const [mode, setMode] = useState<NutrMode>(
    () => (localStorage.getItem("nutrMode") as NutrMode) ?? "macros",
  );
  // One-off sections created this session: keep them visible while empty.
  const [ephemeral, setEphemeral] = useState<DiarySlot[]>([]);
  const day = useDay(date);
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["day"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    qc.invalidateQueries({ queryKey: ["recent"] });
  };
  const setModePersist = (m: NutrMode) => {
    setMode(m);
    localStorage.setItem("nutrMode", m);
  };

  const slotList: DiarySlot[] = day.data
    ? [
        ...day.data.slotList,
        ...ephemeral.filter((e) => !day.data!.slotList.some((s) => s.name === e.name)),
      ]
    : [];

  return (
    <div>
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="plaque">Diary</div>
          <h1 className="truncate font-display text-3xl font-black tracking-tight">
            {humanDate(date)}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1 font-mono text-sm">
          <button
            onClick={() => setDate(shiftDate(date, -1))}
            className="border rule px-4 py-2 active:bg-raised md:hover:bg-raised"
          >
            ‹
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="!py-1.5 text-xs"
          />
          <button
            onClick={() => setDate(shiftDate(date, 1))}
            className="border rule px-4 py-2 active:bg-raised md:hover:bg-raised"
          >
            ›
          </button>
        </div>
      </header>

      {day.data && <DayGauge day={day.data} mode={mode} />}

      {day.data && (
        <div className="mt-3 flex justify-end">
          <div className="inline-flex border rule font-mono text-[11px]">
            {(
              [
                ["macros", "Macros"],
                ["nutrients", "Fibre · Sugar · Sodium"],
              ] as [NutrMode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setModePersist(m)}
                className={`px-3 py-1.5 ${
                  mode === m ? "bg-raised text-ink" : "text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {day.data && (
        <div className="mt-1">
          {slotList.map((slot) => {
            const entries = day.data!.slots[slot.name] ?? [];
            const t = day.data!.slotTotals[slot.name];
            const removable = !isDefaultSlot(slot.name) && entries.length === 0 && slot.id > 0;
            return (
              <section key={slot.name} className="border-b rule py-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="plaque flex items-center gap-2 !text-ink">
                    {slot.name}
                    {removable && (
                      <button
                        onClick={async () => {
                          await apiDeleteSlot(slot.id);
                          setEphemeral((e) => e.filter((s) => s.id !== slot.id));
                          refresh();
                        }}
                        title={`Remove ${slot.name}`}
                        className="font-mono text-[11px] text-muted hover:text-[var(--accent-2)]"
                      >
                        remove
                      </button>
                    )}
                  </h2>
                  <div className="flex items-center gap-3">
                    {entries.length > 0 && t && (
                      <span className="inline-flex items-baseline gap-3">
                        <MacroCells t={t} mode={mode} strong />
                        <span className="w-11 text-right font-mono text-sm font-semibold text-amber">
                          {kcal(t.energyKcal)}
                        </span>
                      </span>
                    )}
                    <button
                      onClick={() => setAdding(slot.name)}
                      className="border rule px-3.5 py-1.5 font-mono text-sm text-amber active:bg-raised md:hover:glow"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="mt-1 divide-y divide-[var(--line)]/50">
                  {entries.map((e) => (
                    <EntryRow key={e.id} entry={e} slots={slotList} mode={mode} onChanged={refresh} />
                  ))}
                </div>
              </section>
            );
          })}

          <AddSection
            onCreated={(slot) => {
              if (!slot.permanent) setEphemeral((e) => [...e, slot]);
              refresh();
            }}
          />

          {Object.values(day.data.slots).every((s) => s.length === 0) && (
            <div className="flex flex-col items-center py-10 text-center">
              <Plant className="h-28 w-28" />
              <div className="mt-3 font-mono text-sm text-muted">
                Nothing logged {humanDate(date).toLowerCase()} — hit + on a meal.
              </div>
            </div>
          )}
        </div>
      )}

      {adding && (
        <AddSheet
          slot={adding}
          slots={slotList.map((s) => s.name)}
          date={date}
          onClose={() => setAdding(null)}
          onDone={() => {
            setAdding(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
