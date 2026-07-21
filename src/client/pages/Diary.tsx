import { useState } from "react";
import { SLOTS, type Slot } from "@shared/nutrition";
import { apiDeleteEntry, apiUpdateEntry, useDay, type Entry } from "../lib/api";
import { humanDate, kcal, g, shiftDate, todayStr } from "../lib/format";
import { useQueryClient } from "@tanstack/react-query";
import DayGauge from "../components/DayGauge";
import AddSheet from "../components/AddSheet";
import Plant from "../components/Plant";

function EntryRow({ entry, onChanged }: { entry: Entry; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [grams, setGrams] = useState(entry.quantityG?.toString() ?? "");

  return (
    <div className="group flex items-baseline justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm">{entry.label ?? entry.foodName ?? "…"}</div>
        <div className="font-mono text-[11px] text-muted">
          {entry.kind === "food" && !editing && `${g(entry.quantityG ?? 0)}g · `}
          P{g(entry.proteinG)} C{g(entry.carbsG)} F{g(entry.fatG)}
        </div>
        {editing && (
          <span className="ml-2 inline-flex items-center gap-1">
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && Number(grams) > 0) {
                  await apiUpdateEntry(entry.id, { quantityG: Number(grams) });
                  setEditing(false);
                  onChanged();
                }
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-20 !py-0.5 font-mono text-xs"
            />
            <span className="font-mono text-[11px] text-muted">g ⏎</span>
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {entry.kind === "food" && (
          <button
            onClick={() => setEditing(!editing)}
            className="row-action plaque px-2 py-1.5 hover:!text-ink"
          >
            edit
          </button>
        )}
        <button
          onClick={async () => {
            if (!confirming) return setConfirming(true);
            await apiDeleteEntry(entry.id);
            onChanged();
          }}
          onBlur={() => setConfirming(false)}
          className="row-action plaque px-2 py-1.5 hover:!text-[var(--accent-2)]"
          style={confirming ? { color: "var(--accent-2)" } : undefined}
          aria-label={confirming ? "Confirm delete" : "Delete entry"}
        >
          {confirming ? "delete?" : "✕"}
        </button>
        <span className="ml-2 font-mono text-sm">{kcal(entry.energyKcal)}</span>
      </div>
    </div>
  );
}

export default function Diary() {
  const [date, setDate] = useState(todayStr());
  const [adding, setAdding] = useState<Slot | null>(null);
  const day = useDay(date);
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["day", date] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    qc.invalidateQueries({ queryKey: ["recent"] });
  };

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <div className="plaque">Diary</div>
          <h1 className="font-display text-3xl font-black tracking-tight">
            {humanDate(date)}
          </h1>
        </div>
        <div className="flex items-center gap-1 font-mono text-sm">
          <button onClick={() => setDate(shiftDate(date, -1))} className="border rule px-3 py-1.5 hover:bg-raised">‹</button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="!py-1.5 text-xs"
          />
          <button onClick={() => setDate(shiftDate(date, 1))} className="border rule px-3 py-1.5 hover:bg-raised">›</button>
        </div>
      </header>

      {day.data && <DayGauge day={day.data} />}

      {day.data && (
        <div className="mt-2">
          {SLOTS.map((slot) => {
            const entries = day.data!.slots[slot];
            const t = day.data!.slotTotals[slot];
            return (
              <section key={slot} className="border-b rule py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="plaque">{slot}</h2>
                  <div className="flex items-baseline gap-3">
                    {entries.length > 0 && (
                      <span className="font-mono text-xs text-muted">
                        P{g(t.proteinG)} C{g(t.carbsG)} F{g(t.fatG)} ·{" "}
                        <span className="text-ink">{kcal(t.energyKcal)}</span>
                      </span>
                    )}
                    <button
                      onClick={() => setAdding(slot)}
                      className="border rule px-2.5 py-0.5 font-mono text-sm text-amber hover:glow"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="mt-1 divide-y divide-[var(--line)]/50">
                  {entries.map((e) => (
                    <EntryRow key={e.id} entry={e} onChanged={refresh} />
                  ))}
                </div>
              </section>
            );
          })}

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
