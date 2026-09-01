import { useMemo } from "react";
import type { Entry } from "../lib/api";
import { kcal } from "../lib/format";

/** One timeline block: a lone entry, or several entries logged together. */
interface TimelineBlock {
  key: string;
  label: string;
  time: string; // "HH:MM" of the earliest entry
  minutes: number; // minutes since local midnight
  energyKcal: number;
  entries: Entry[];
}

const PX_PER_HOUR = 64;
const MIN_BLOCK_H = 46;
const GAP = 6;

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Group by mealLogId (a meal / photo scan is one block), else one per entry. */
function buildBlocks(entries: Entry[]): TimelineBlock[] {
  const byMeal = new Map<string, TimelineBlock>();
  const blocks: TimelineBlock[] = [];
  for (const e of entries) {
    if (!e.mealLogId) {
      blocks.push({
        key: `e${e.id}`,
        label: e.foodName ?? e.label ?? "Entry",
        time: e.time,
        minutes: toMinutes(e.time),
        energyKcal: e.energyKcal,
        entries: [e],
      });
      continue;
    }
    const open = byMeal.get(e.mealLogId);
    if (open) {
      open.entries.push(e);
      open.energyKcal += e.energyKcal;
      if (toMinutes(e.time) < open.minutes) {
        open.minutes = toMinutes(e.time);
        open.time = e.time;
      }
      continue;
    }
    const block: TimelineBlock = {
      key: `m${e.mealLogId}`,
      label: e.mealName ?? "Meal",
      time: e.time,
      minutes: toMinutes(e.time),
      energyKcal: e.energyKcal,
      entries: [e],
    };
    byMeal.set(e.mealLogId, block);
    blocks.push(block);
  }
  return blocks.sort((a, b) => a.minutes - b.minutes);
}

export default function DiaryTimeline({
  entries,
  onPick,
}: {
  entries: Entry[];
  /** A block with a single food entry can be tapped to edit it. */
  onPick: (entry: Entry) => void;
}) {
  const blocks = useMemo(() => buildBlocks(entries), [entries]);
  const dayTotal = useMemo(
    () => Math.round(blocks.reduce((s, b) => s + b.energyKcal, 0) * 10) / 10,
    [blocks],
  );
  // Cumulative kcal eaten by the top of a given hour — shown down the axis so
  // each hour reads "by now you'd had N calories".
  const kcalByHour = (h: number) =>
    Math.round(blocks.reduce((s, b) => (b.minutes <= h * 60 ? s + b.energyKcal : s), 0) * 10) / 10;

  if (blocks.length === 0)
    return (
      <div className="mt-8 py-12 text-center font-mono text-sm text-muted">
        Nothing logged yet — food you add today lands here on its own time.
      </div>
    );

  // The whole day, midnight to midnight — you scroll the full scale.
  const startHour = 0;
  const endHour = 24;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const topFor = (minutes: number) => ((minutes - startHour * 60) / 60) * PX_PER_HOUR;

  // Position by real time, but never let two blocks overlap — nudge later ones
  // down. Keeps the day's proportions while staying readable when meals cluster.
  let cursor = -Infinity;
  const placed = blocks.map((b) => {
    const top = Math.max(topFor(b.minutes), cursor + GAP);
    cursor = top + MIN_BLOCK_H;
    return { block: b, top };
  });
  const axisHeight = (endHour - startHour) * PX_PER_HOUR;
  const bodyHeight = Math.max(axisHeight, cursor) + GAP;

  return (
    <div className="mt-3">
      <div
        className="sticky top-0 z-10 mb-2 flex items-baseline justify-between border-b rule py-2"
        style={{ background: "color-mix(in oklab, var(--bg) 92%, transparent)", backdropFilter: "blur(8px)" }}
      >
        <span className="plaque">Timeline · cumulative kcal by hour</span>
        <span className="font-mono text-sm">
          <span className="text-base text-ink">{kcal(dayTotal)}</span>
          <span className="text-muted"> kcal · day</span>
        </span>
      </div>

      <div className="relative" style={{ height: bodyHeight }}>
        {/* Hour gridlines: the time, and the cumulative kcal eaten by that hour. */}
        {hours.map((h) => {
          const soFar = kcalByHour(h);
          return (
            <div
              key={h}
              className="absolute inset-x-0 flex items-start"
              style={{ top: (h - startHour) * PX_PER_HOUR }}
            >
              <span className="w-12 shrink-0 -translate-y-2 pr-2 text-right font-mono leading-tight text-muted">
                <span className="block text-[11px]">{String(h % 24).padStart(2, "0")}:00</span>
                {soFar > 0 && <span className="block text-[10px] opacity-70">{kcal(soFar)}</span>}
              </span>
              <span className="mt-[1px] h-px flex-1 bg-[var(--line)] opacity-60" />
            </div>
          );
        })}

        {/* Food blocks, positioned by time */}
        {placed.map(({ block, top }) => {
          const single = block.entries.length === 1 && block.entries[0]!.kind === "food";
          return (
            <div
              key={block.key}
              className="absolute"
              style={{ top, left: "3rem", right: 0, minHeight: MIN_BLOCK_H }}
            >
              <button
                onClick={() => single && onPick(block.entries[0]!)}
                disabled={!single}
                className={`flex w-full items-center gap-3 border rule bg-surface px-3 py-2 text-left ${
                  single ? "active:bg-raised md:hover:bg-raised" : "cursor-default"
                }`}
                style={{ minHeight: MIN_BLOCK_H }}
              >
                <span className="w-11 shrink-0 font-mono text-[11px] text-muted">{block.time}</span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {block.label}
                  {block.entries.length > 1 && (
                    <span className="text-muted"> · {block.entries.length} items</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-sm">{kcal(block.energyKcal)}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
