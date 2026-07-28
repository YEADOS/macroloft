import { useState } from "react";
import { DEFAULT_SLOTS } from "@shared/nutrition";
import {
  apiCreateSlot,
  apiDeleteEntry,
  apiDeleteMealLog,
  apiDeleteSlot,
  apiUpdateEntry,
  useDay,
  useFood,
  type DiarySlot,
  type Entry,
} from "../lib/api";
import { humanDate, kcal, g, shiftDate, todayStr } from "../lib/format";
import { useQueryClient } from "@tanstack/react-query";
import DayGauge from "../components/DayGauge";
import AddSheet from "../components/AddSheet";
import Plant from "../components/Plant";
import { MacroCells, MacroHeader, SlotTotals, type NutrMode } from "../components/MacroTable";
import MealBuilder, { itemFromEntry, type BuilderItem } from "../components/MealBuilder";
import { PepsiShelf } from "../components/PepsiCounter";

export type { NutrMode };

const isDefaultSlot = (name: string) => (DEFAULT_SLOTS as readonly string[]).includes(name);

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

/** Quick entries point at no food, so they can't become meal ingredients. */
const isSelectable = (e: Entry) => e.kind === "food" && e.foodId != null && !!e.quantityG;

function EntryRow({
  entry,
  slots,
  mode,
  onChanged,
  selecting,
  selected,
  onSelect,
}: {
  entry: Entry;
  slots: DiarySlot[];
  mode: NutrMode;
  onChanged: () => void;
  selecting: boolean;
  selected: boolean;
  /** `range` = shift-click: extend from the last picked row instead of toggling. */
  onSelect: (range: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectable = isSelectable(entry);
  return (
    <div>
      <button
        // Shift-click picks meal ingredients straight from the diary on desktop —
        // no need to flip the picker on first.
        onMouseDown={(e) => e.shiftKey && e.preventDefault()}
        onClick={(e) => {
          if (selecting || e.shiftKey) return selectable && onSelect(e.shiftKey);
          setOpen(!open);
        }}
        disabled={selecting && !selectable}
        className={`flex min-h-[48px] w-full items-center justify-between gap-3 py-2.5 text-left active:bg-raised ${
          open ? "bg-raised/50" : ""
        } ${selecting && !selectable ? "opacity-40" : ""}`}
      >
        {selecting && (
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center border rule font-mono text-xs leading-none"
            style={
              selected
                ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#181614" }
                : undefined
            }
          >
            {selected ? "✓" : ""}
          </span>
        )}
        <div className="min-w-0 flex-1">
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
      {open && !selecting && (
        <EntryEditor entry={entry} slots={slots} onClose={() => setOpen(false)} onChanged={onChanged} />
      )}
    </div>
  );
}

/**
 * Entries logged together from a saved meal stay a visible unit in the diary.
 * Grouping is by `mealLogId` rather than adjacency, so an entry that gets moved
 * or re-sorted still belongs to its meal.
 */
type Block =
  | { kind: "entry"; entry: Entry }
  | { kind: "meal"; key: string; name: string; entries: Entry[] };

function groupEntries(entries: Entry[]): Block[] {
  const blocks: Block[] = [];
  const byMeal = new Map<string, Extract<Block, { kind: "meal" }>>();
  for (const entry of entries) {
    const id = entry.mealLogId;
    if (!id) {
      blocks.push({ kind: "entry", entry });
      continue;
    }
    const open = byMeal.get(id);
    if (open) {
      open.entries.push(entry);
      continue;
    }
    const block = { kind: "meal" as const, key: id, name: entry.mealName ?? "Meal", entries: [entry] };
    byMeal.set(id, block);
    blocks.push(block);
  }
  return blocks;
}

/**
 * The meal wrapper: timber rule + indent, so the rows read as one logged meal.
 * The right padding pulls the numbers off the tinted edge — meal rows sit a
 * few pixels inside the section's columns on purpose.
 */
function MealGroup({
  name,
  entries,
  selecting,
  onDeleted,
  children,
}: {
  name: string;
  entries: Entry[];
  selecting: boolean;
  onDeleted: () => void;
  children: React.ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const total = entries.reduce((n, e) => n + e.energyKcal, 0);
  const mealLogId = entries[0]?.mealLogId;
  return (
    <div
      className="border-l-2 pb-1.5 pl-3 pr-2"
      style={{
        borderColor: "var(--timber)",
        background: "color-mix(in oklab, var(--surface-raised) 45%, transparent)",
      }}
    >
      <div className="flex items-center justify-between gap-2 pt-2">
        <span className="plaque min-w-0 truncate" style={{ color: "var(--timber)" }}>
          ▤ {name}
        </span>
        {confirming ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <button
              disabled={busy || !mealLogId}
              onClick={async () => {
                setBusy(true);
                try {
                  await apiDeleteMealLog(mealLogId!);
                  onDeleted();
                } finally {
                  setBusy(false);
                  setConfirming(false);
                }
              }}
              className="border rule px-2.5 py-1.5 font-mono text-[11px]"
              style={{ color: "var(--accent-2)", borderColor: "var(--accent-2)" }}
            >
              delete all {entries.length}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="border rule px-2.5 py-1.5 font-mono text-[11px] text-muted"
            >
              keep
            </button>
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-[11px] text-muted">
              {entries.length} item{entries.length === 1 ? "" : "s"} · {kcal(total)} kcal
            </span>
            {!selecting && (
              <button
                onClick={() => setConfirming(true)}
                title={`Remove all of ${name} from the diary`}
                className="-mr-1 px-1.5 py-1.5 font-mono text-[11px] text-muted md:hover:text-[var(--accent-2)]"
              >
                ✕
              </button>
            )}
          </span>
        )}
      </div>
      <div className="divide-y divide-[var(--line)]/50">{children}</div>
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
        className="mt-6 w-full border border-dashed rule py-3 font-mono text-xs text-muted hover:text-ink"
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
  // One-off sections created this session: keep each visible (while empty) only
  // on the day it was created for — that's the whole point of non-permanent.
  const [ephemeral, setEphemeral] = useState<{ slot: DiarySlot; forDate: string }[]>([]);
  // Pick logged entries → save them as a reusable meal. Selection is by entry id
  // and only lives while the picker is open.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  // Last row picked — the other end of a shift-click range.
  const [anchor, setAnchor] = useState<number | null>(null);
  const [mealDraft, setMealDraft] = useState<{ name: string; items: BuilderItem[] } | null>(null);
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
        ...ephemeral
          .filter((e) => e.forDate === date && !day.data!.slotList.some((s) => s.name === e.slot.name))
          .map((e) => e.slot),
      ]
    : [];

  /** Every selectable row of the day, in the order they're rendered. */
  const selectableIds = () =>
    slotList.flatMap((s) => (day.data?.slots[s.name] ?? []).filter(isSelectable).map((e) => e.id));

  const pick = (id: number, range: boolean) => {
    setSelecting(true);
    if (range && anchor != null && anchor !== id) {
      const ids = selectableIds();
      const from = ids.indexOf(anchor);
      const to = ids.indexOf(id);
      if (from >= 0 && to >= 0) {
        const span = ids.slice(Math.min(from, to), Math.max(from, to) + 1);
        setSelected((s) => [...new Set([...s, ...span])]);
        setAnchor(id);
        return;
      }
    }
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    setAnchor(id);
  };

  const row = (entry: Entry) => (
    <EntryRow
      key={entry.id}
      entry={entry}
      slots={slotList}
      mode={mode}
      onChanged={refresh}
      selecting={selecting}
      selected={selected.includes(entry.id)}
      onSelect={(range) => pick(entry.id, range)}
    />
  );

  const stopSelecting = () => {
    setSelecting(false);
    setSelected([]);
    setAnchor(null);
  };

  /** Selected entries, in diary order, with the slot they came from. */
  const selectedEntries = () =>
    slotList.flatMap((s) =>
      (day.data?.slots[s.name] ?? [])
        .filter((e) => selected.includes(e.id))
        .map((e) => ({ entry: e, slot: s.name })),
    );

  const buildFromSelection = () => {
    const picked = selectedEntries();
    const items = picked.map((p) => itemFromEntry(p.entry)).filter((i): i is BuilderItem => !!i);
    if (items.length === 0) return;
    // A selection inside one section is almost always "that meal" — name it so.
    const slots = new Set(picked.map((p) => p.slot));
    const name = (slots.size === 1 ? [...slots][0] : "") ?? "";
    setMealDraft({ name: name.charAt(0).toUpperCase() + name.slice(1), items });
    stopSelecting();
  };

  return (
    // Extra bottom room while the selection bar floats over the page.
    <div className={selecting ? "pb-20" : undefined}>
      <header className="mb-8 flex items-center justify-between gap-3">
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

      {/* Desktop keeps its can in the rail; mobile gets the shelf. */}
      <PepsiShelf date={date} />

      {day.data && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button
            title="Pick logged foods and save them as a meal — on a desktop, shift-click a row to start"
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            className={`border rule px-3 py-1.5 font-mono text-[11px] ${
              selecting ? "bg-raised text-ink" : "text-muted active:bg-raised md:hover:text-ink"
            }`}
          >
            {selecting ? "✕ Cancel select" : "☑ Select → meal"}
          </button>
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
        <div className="mt-3">
          {slotList.map((slot) => {
            const entries = day.data!.slots[slot.name] ?? [];
            const t = day.data!.slotTotals[slot.name];
            const removable = !isDefaultSlot(slot.name) && entries.length === 0 && slot.id > 0;
            return (
              <section key={slot.name} className="border-b rule py-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2.5 font-display text-base font-black uppercase tracking-wider">
                    {slot.name}
                    {removable && (
                      <button
                        onClick={async () => {
                          await apiDeleteSlot(slot.id);
                          setEphemeral((e) => e.filter((s) => s.slot.id !== slot.id));
                          refresh();
                        }}
                        title={`Remove ${slot.name}`}
                        className="font-sans text-[11px] font-normal normal-case tracking-normal text-muted hover:text-[var(--accent-2)]"
                      >
                        remove
                      </button>
                    )}
                  </h2>
                  {selecting ? (
                    (() => {
                      const ids = entries.filter(isSelectable).map((e) => e.id);
                      const allOn = ids.length > 0 && ids.every((id) => selected.includes(id));
                      return (
                        <button
                          disabled={ids.length === 0}
                          onClick={() =>
                            setSelected((s) =>
                              allOn
                                ? s.filter((id) => !ids.includes(id))
                                : [...new Set([...s, ...ids])],
                            )
                          }
                          className="border rule px-3 py-1.5 font-mono text-xs text-muted disabled:opacity-30 active:bg-raised md:hover:text-ink"
                        >
                          {allOn ? "none" : "all"}
                        </button>
                      );
                    })()
                  ) : (
                    <button
                      onClick={() => setAdding(slot.name)}
                      className="border rule px-3.5 py-1.5 font-mono text-sm text-amber active:bg-raised md:hover:glow"
                    >
                      +
                    </button>
                  )}
                </div>
                {entries.length > 0 && t && (
                  <div className="mt-3 flex items-center justify-between gap-3 pb-2">
                    <span className="font-mono text-sm font-semibold text-amber">
                      {kcal(t.energyKcal)}{" "}
                      <span className="text-[11px] font-normal text-muted">kcal</span>
                    </span>
                    <SlotTotals t={t} mode={mode} />
                  </div>
                )}
                <div className="mt-2 divide-y divide-[var(--line)]/50">
                  {entries.length > 0 && <MacroHeader mode={mode} />}
                  {groupEntries(entries).map((block) =>
                    block.kind === "entry" ? (
                      row(block.entry)
                    ) : (
                      <MealGroup
                        key={block.key}
                        name={block.name}
                        entries={block.entries}
                        selecting={selecting}
                        onDeleted={refresh}
                      >
                        {block.entries.map(row)}
                      </MealGroup>
                    ),
                  )}
                </div>
              </section>
            );
          })}

          <AddSection
            onCreated={(slot) => {
              if (!slot.permanent) setEphemeral((e) => [...e, { slot, forDate: date }]);
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

      {selecting && (
        <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 mt-4 md:bottom-6">
          <div
            className="flex items-center justify-between gap-3 border rule px-3 py-2"
            style={{
              background: "color-mix(in oklab, var(--surface) 96%, transparent)",
              backdropFilter: "blur(8px)",
            }}
          >
            <span className="font-mono text-xs text-muted">
              {selected.length === 0
                ? "Tap logged foods to pick ingredients"
                : `${selected.length} selected`}
              <span className="hidden md:inline"> · shift-click for a range</span>
            </span>
            <button
              disabled={selected.length === 0}
              onClick={buildFromSelection}
              className="px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#181614" }}
            >
              Create meal
            </button>
          </div>
        </div>
      )}

      {mealDraft && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-bg">
          <div className="mx-auto max-w-2xl px-4 py-5 pb-16">
            <div className="mb-3">
              <div className="plaque">From your diary</div>
              <h2 className="font-display text-2xl font-black uppercase tracking-tight">
                New meal
              </h2>
            </div>
            <MealBuilder
              initialName={mealDraft.name}
              initialItems={mealDraft.items}
              mode={mode}
              onSaved={() => setMealDraft(null)}
              onCancel={() => setMealDraft(null)}
            />
          </div>
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
