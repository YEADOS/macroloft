import { useQueryClient } from "@tanstack/react-query";
import { apiAddPepsi, usePepsi, type PepsiStats } from "@client/lib/api";
import { todayStr } from "@client/lib/format";

// Cut out from the Open Food Facts front photo of product 7044610876290
// (Pepsi Max 330 ml), CC BY-SA — same data source the food importers use.
const CAN = "/pepsi_max.png";

/**
 * One tally, two faces: the desktop rail keeps a permanent can under the nav,
 * the diary shelf lines today's cans up on a timber rail. Both talk to the same
 * `/api/pepsi` day counter — Pepsi Max is zero-energy, so nothing here touches
 * the diary's nutrient math.
 */
function usePepsiTally(date?: string) {
  const qc = useQueryClient();
  const q = usePepsi(date);
  const bump = async (delta: number) => {
    const stats = await apiAddPepsi(delta, date);
    qc.setQueryData(["pepsi", date ?? "today"], stats);
    // The rail (today) and the diary shelf (viewed day) can be on screen together.
    qc.invalidateQueries({ queryKey: ["pepsi"] });
  };
  return { stats: q.data, bump };
}

/** "128 all-time · 4-day run" — the flavour line both variants share. */
function tallyLine(s: PepsiStats): string {
  const bits = [`${s.total} all-time`];
  if (s.streak >= 2) bits.push(`${s.streak}-day run`);
  else if (s.best && s.best.count > 1) bits.push(`best ${s.best.count}`);
  return bits.join(" · ");
}

/** Desktop: a can bolted to the rail under the nav links. */
export function PepsiRail() {
  // The same local date the diary logs against, so rail and shelf never disagree.
  const { stats, bump } = usePepsiTally(todayStr());
  if (!stats) return null;

  return (
    <div className="mt-8 border-t rule px-1 pt-5">
      <div className="plaque">Pepsi Max</div>
      <div className="mt-3 flex items-end gap-3">
        <button
          onClick={() => bump(1)}
          title="Crack one open"
          aria-label="Add a Pepsi Max"
          className="shrink-0 transition-transform active:scale-90 hover:-translate-y-0.5"
        >
          <img src={CAN} alt="" className="h-20 w-auto drop-shadow-md" />
        </button>
        <div className="min-w-0">
          <div className="font-mono text-3xl leading-none tabular-nums">{stats.count}</div>
          <div className="plaque mt-1">today</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-muted">{tallyLine(stats)}</span>
        <button
          onClick={() => bump(-1)}
          disabled={stats.count === 0}
          title="Take one back"
          aria-label="Remove a Pepsi Max"
          className="border rule px-2 py-0.5 font-mono text-[11px] text-muted disabled:opacity-30 hover:text-ink"
        >
          −
        </button>
      </div>
    </div>
  );
}

/**
 * Mobile: today's cans lined up on a timber shelf under the day gauge — the
 * count is the row itself, so a glance says "three cans in" without reading a
 * number. Explicit + / − buttons (never a hidden swipe) do the counting.
 */
export function PepsiShelf({ date }: { date: string }) {
  const { stats, bump } = usePepsiTally(date);
  if (!stats) return null;

  const shown = Math.min(stats.count, 10);
  const overflow = stats.count - shown;

  return (
    <div className="mt-5 md:hidden">
      <div className="flex items-baseline justify-between gap-2">
        <span className="plaque">Pepsi Max</span>
        <span className="font-mono text-[10px] text-muted">{tallyLine(stats)}</span>
      </div>

      <div className="mt-2 flex items-end gap-3">
        {/* the shelf: cans stand on a timber rule */}
        <div
          className="flex min-h-[56px] min-w-0 flex-1 items-end gap-1.5 overflow-hidden border-b-2"
          style={{ borderColor: "var(--timber)" }}
        >
          {stats.count === 0 ? (
            <img src={CAN} alt="" aria-hidden className="h-11 w-auto shrink-0 opacity-20 grayscale" />
          ) : (
            Array.from({ length: shown }, (_, i) => (
              <img
                key={i}
                src={CAN}
                alt=""
                aria-hidden
                className="can-drop h-11 w-auto shrink-0"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              />
            ))
          )}
          {overflow > 0 && (
            <span className="shrink-0 pb-1 font-mono text-xs text-muted">+{overflow}</span>
          )}
          <span className="ml-auto shrink-0 pb-1 pl-2 font-mono text-sm tabular-nums text-muted">
            {stats.count === 0 ? "none" : `${stats.count} ${stats.count === 1 ? "can" : "cans"}`}
          </span>
        </div>

        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={() => bump(-1)}
            disabled={stats.count === 0}
            aria-label="Remove a Pepsi Max"
            className="min-h-[44px] border rule px-3.5 font-mono text-sm text-muted disabled:opacity-30 active:bg-raised"
          >
            −
          </button>
          <button
            onClick={() => bump(1)}
            aria-label="Add a Pepsi Max"
            className="min-h-[44px] border rule px-3.5 font-mono text-sm text-amber active:bg-raised"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
