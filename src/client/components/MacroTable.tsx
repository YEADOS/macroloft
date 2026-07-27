import { g } from "../lib/format";
import type { Totals } from "../lib/api";

/** Which trio of numbers the diary-style columns show. */
export type NutrMode = "macros" | "nutrients";

export type MacroSource = Pick<
  Totals,
  "proteinG" | "carbsG" | "fatG" | "fibreG" | "sugarsG" | "sodiumMg"
>;

export function macroCells(
  t: MacroSource,
  mode: NutrMode,
): [string, string, string, string][] {
  return mode === "macros"
    ? [
        ["P", g(t.proteinG), "var(--chart-protein)", "g"],
        ["C", g(t.carbsG), "var(--chart-carbs)", "g"],
        ["F", g(t.fatG), "var(--chart-fat)", "g"],
      ]
    : [
        ["FB", g(t.fibreG), "var(--line)", "g"],
        ["SU", g(t.sugarsG), "var(--line)", "g"],
        ["NA", `${Math.round(t.sodiumMg)}`, "var(--line)", "mg"],
      ];
}

/** Per-entry numbers: one row of values, aligned under the section's column headers. */
export function MacroCells({ t, mode }: { t: MacroSource; mode: NutrMode }) {
  return (
    <span className="grid grid-cols-3 gap-x-3 text-right font-mono text-xs">
      {macroCells(t, mode).map(([label, value]) => (
        <span key={label} className="min-w-[2.5rem]">
          {value}
        </span>
      ))}
    </span>
  );
}

/** One header row per section, above the first entry: P/C/F (or FB/SU/NA) + kcal. */
export function MacroHeader({ mode }: { mode: NutrMode }) {
  const labels = mode === "macros" ? ["P", "C", "F"] : ["FB", "SU", "NA"];
  return (
    <div className="flex items-center justify-end gap-3 pb-1.5 font-mono text-[9px] uppercase tracking-wider text-muted">
      <span className="grid grid-cols-3 gap-x-3 text-right">
        {labels.map((l) => (
          <span key={l} className="min-w-[2.5rem]">
            {l}
          </span>
        ))}
      </span>
      <span className="w-11 text-right">kcal</span>
    </div>
  );
}

/** Section totals: the legend-style strip — colored swatch, label, number. */
export function SlotTotals({ t, mode }: { t: MacroSource; mode: NutrMode }) {
  return (
    <span className="inline-flex items-center gap-4 border rule bg-surface px-3.5 py-1.5 font-mono text-[11px] text-muted">
      {macroCells(t, mode).map(([label, value, color, unit]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2" style={{ background: color }} />
          <span className="uppercase">{label}</span>
          <span className="font-medium text-ink">
            {value}
            <span className="font-normal text-muted">{unit}</span>
          </span>
        </span>
      ))}
    </span>
  );
}
