// Unit converters for the workbench page. Pure functions + a declarative table
// so adding a pair is one entry, not another bespoke form.
import { KJ_PER_KCAL } from "@shared/nutrition";

/** International avoirdupois pound, exact. */
export const KG_PER_LB = 0.45359237;
/** International inch, exact. */
export const MM_PER_INCH = 25.4;

export type Unit = {
  /** short code shown next to the field, e.g. "kJ" */
  code: string;
  /** field label, e.g. "Kilojoules" */
  name: string;
};

export type Conversion = {
  key: string;
  label: string;
  from: Unit;
  to: Unit;
  /** `to` value = `from` value × factor */
  factor: number;
  note: string;
};

export const CONVERSIONS: Conversion[] = [
  {
    key: "energy",
    label: "Energy",
    from: { code: "kJ", name: "Kilojoules" },
    to: { code: "kcal", name: "Calories" },
    factor: 1 / KJ_PER_KCAL,
    note: `1 kcal (1 Cal) = ${KJ_PER_KCAL} kJ. AU labels lead with kJ; this app counts kcal.`,
  },
  {
    key: "mass",
    label: "Body weight",
    from: { code: "lb", name: "Pounds" },
    to: { code: "kg", name: "Kilograms" },
    factor: KG_PER_LB,
    note: "1 lb = 0.45359237 kg. 1 stone = 14 lb.",
  },
  {
    key: "length",
    label: "Length",
    from: { code: "in", name: "Inches" },
    to: { code: "mm", name: "Millimetres" },
    factor: MM_PER_INCH,
    note: "1 in = 25.4 mm exactly.",
  },
];

/**
 * Reads a typed field. Tolerates thousands separators, spaces and a bare "-"
 * or "." mid-typing (which parse as nothing rather than NaN).
 */
export function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Precision that suits the magnitude: small results need decimals (100 mm =
 * 3.94 in), big ones don't (2000 kJ = 478 kcal). No separators — the result
 * lands in an editable field and has to parse back.
 */
export function formatConverted(n: number): string {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  const decimals = abs === 0 ? 0 : abs < 10 ? 2 : abs < 100 ? 1 : 0;
  const rounded = Number(n.toFixed(decimals));
  return String(rounded);
}

/** Converts a typed value across a pair; `reverse` goes to → from. */
export function convert(
  text: string,
  conv: Conversion,
  reverse: boolean,
): string {
  const n = parseNumber(text);
  if (n === null) return "";
  return formatConverted(reverse ? n / conv.factor : n * conv.factor);
}
