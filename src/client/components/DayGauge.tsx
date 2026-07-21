import type { Day } from "../lib/api";
import { kcal, g } from "../lib/format";

function MacroBar({
  label,
  eaten,
  target,
  color,
}: {
  label: string;
  eaten: number;
  target: number | null;
  color: string;
}) {
  const pct = target ? Math.min(100, (eaten / target) * 100) : 0;
  return (
    <div className="flex-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="plaque">{label}</span>
        <span className="font-mono text-[11px]">
          {g(eaten)}
          {target ? <span className="text-muted">/{g(target)}g</span> : "g"}
        </span>
      </div>
      <div className="mt-1.5 h-[3px] w-full" style={{ background: "var(--line)" }}>
        {target && (
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, background: color }}
          />
        )}
      </div>
    </div>
  );
}

export default function DayGauge({ day }: { day: Day }) {
  const target = day.goals?.energyKcal ?? null;
  const eaten = day.totals.energyKcal;
  const remaining = target !== null ? target - eaten : null;
  const over = remaining !== null && remaining < 0;
  const pct = target ? Math.min(100, (eaten / target) * 100) : 0;

  return (
    <section className="border-b rule pb-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="plaque">{over ? "Over target" : "Remaining"}</div>
          <div
            className="font-display text-7xl font-black leading-none tracking-tight md:text-8xl"
            style={{ color: over ? "var(--accent-2)" : "var(--text)" }}
          >
            {remaining !== null ? kcal(Math.abs(remaining)) : kcal(eaten)}
          </div>
        </div>
        <div className="pb-1 text-right font-mono text-xs text-muted">
          <div>{kcal(eaten)} eaten</div>
          {target !== null && <div>{kcal(target)} target</div>}
        </div>
      </div>

      {/* boiler-gauge rule */}
      <div className="mt-4 h-[5px] w-full" style={{ background: "var(--line)" }}>
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: over ? "var(--accent-2)" : "var(--accent)",
            boxShadow: over
              ? "none"
              : "0 0 10px color-mix(in oklab, var(--accent) 55%, transparent)",
          }}
        />
      </div>

      <div className="mt-5 flex gap-6">
        <MacroBar
          label="Protein"
          eaten={day.totals.proteinG}
          target={day.goals?.proteinG ?? null}
          color="var(--chart-protein)"
        />
        <MacroBar
          label="Carbs"
          eaten={day.totals.carbsG}
          target={day.goals?.carbsG ?? null}
          color="var(--chart-carbs)"
        />
        <MacroBar
          label="Fat"
          eaten={day.totals.fatG}
          target={day.goals?.fatG ?? null}
          color="var(--chart-fat)"
        />
      </div>
    </section>
  );
}
