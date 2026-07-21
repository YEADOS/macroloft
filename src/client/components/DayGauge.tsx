import { useEffect, useRef, useState } from "react";
import type { Day } from "../lib/api";
import { kcal, g } from "../lib/format";
import { funEquivalent, shuffledOrder } from "../lib/equivalents";

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
      {/* stacked on mobile (wrap made short labels inline and long ones not), inline on md+ */}
      <div className="flex flex-col md:flex-row md:items-baseline md:justify-between md:gap-x-2">
        <span className="plaque" style={{ color }}>
          {label}
        </span>
        <span className="font-mono text-sm font-semibold">
          {g(eaten)}
          <span className="text-[11px] font-normal text-muted">
            {target ? `/${g(target)}g` : "g"}
          </span>
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

function NutrientTile({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="flex-1 border-t rule pt-1.5">
      <div className="plaque">{label}</div>
      <div className="font-mono text-sm font-semibold">
        {label === "Sodium" ? Math.round(value).toLocaleString() : g(value)}
        <span className="text-[11px] font-normal text-muted">{unit}</span>
      </div>
    </div>
  );
}

function FunUnits({ remaining, over }: { remaining: number; over: boolean }) {
  const [line, setLine] = useState<string | null>(null);
  const order = useRef<number[]>([]);
  const step = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const next = () => {
    if (step.current >= order.current.length) {
      order.current = shuffledOrder();
      step.current = 0;
    }
    setLine(funEquivalent(remaining, order.current[step.current]!));
    step.current++;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setLine(null), 6000);
  };

  return (
    <>
      <button
        type="button"
        onClick={next}
        aria-label="Show remaining calories as fun units"
        className="block text-left font-display text-7xl font-black leading-none tracking-tight md:text-8xl"
        style={{ color: over ? "var(--accent-2)" : "var(--text)" }}
      >
        {kcal(Math.abs(remaining))}
      </button>
      {line && (
        <div
          role="status"
          className="fun-units mt-2 inline-block border rule bg-raised px-3 py-2"
        >
          <div className="plaque">{over ? "Over by" : "That's"}</div>
          <div className="font-mono text-sm">{line}</div>
        </div>
      )}
    </>
  );
}

export default function DayGauge({
  day,
  mode = "macros",
}: {
  day: Day;
  mode?: "macros" | "nutrients";
}) {
  const target = day.goals?.energyKcal ?? null;
  const eaten = day.totals.energyKcal;
  const remaining = target !== null ? target - eaten : null;
  const over = remaining !== null && remaining < 0;
  const pct = target ? Math.min(100, (eaten / target) * 100) : 0;

  return (
    <section className="border-b rule pb-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="plaque">{over ? "Over target" : "Remaining"}</div>
          {remaining !== null ? (
            <FunUnits remaining={remaining} over={over} />
          ) : (
            <div className="font-display text-7xl font-black leading-none tracking-tight md:text-8xl">
              {kcal(eaten)}
            </div>
          )}
        </div>
        <div className="pb-1 text-right font-mono text-xs text-muted">
          <div>
            <span className="text-sm font-semibold text-ink">{kcal(eaten)}</span> eaten
          </div>
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

      {mode === "macros" ? (
        <div className="mt-6 flex gap-6">
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
      ) : (
        <div className="mt-5 flex gap-4">
          <NutrientTile label="Fibre" value={day.totals.fibreG} unit="g" />
          <NutrientTile label="Sugars" value={day.totals.sugarsG} unit="g" />
          <NutrientTile label="Sat fat" value={day.totals.satFatG} unit="g" />
          <NutrientTile label="Sodium" value={day.totals.sodiumMg} unit="mg" />
        </div>
      )}
    </section>
  );
}
