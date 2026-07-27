import { useState } from "react";
import { CONVERSIONS, convert, type Conversion, type Unit } from "../lib/convert";

function Field({
  unit,
  value,
  onChange,
}: {
  unit: Unit;
  value: string;
  onChange?: (v: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="plaque">{unit.name}</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="0"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full min-w-0 font-mono text-lg"
        />
        <span className="font-mono text-xs text-muted">{unit.code}</span>
      </div>
    </label>
  );
}

/**
 * One pair, both directions. A single `raw` string plus which side it was typed
 * into keeps this loop-free: the other side is always derived, never stored.
 */
function Converter({ conv }: { conv: Conversion }) {
  const [raw, setRaw] = useState("");
  const [side, setSide] = useState<"from" | "to">("from");

  const type = (next: string, from: "from" | "to") => {
    setSide(from);
    setRaw(next);
  };

  const result = convert(raw, conv, side === "to");
  const left = side === "from" ? raw : result;
  const right = side === "from" ? result : raw;

  return (
    <section className="border-b rule py-6 first:pt-0">
      <div className="mb-3 flex items-center justify-between">
        <div className="plaque">{conv.label}</div>
        {raw !== "" && (
          <button
            onClick={() => type("", "from")}
            className="-my-2 -mr-3 px-3 py-2 font-mono text-xs text-muted active:text-ink md:hover:text-ink"
          >
            clear
          </button>
        )}
      </div>

      <div className="flex items-end gap-3">
        <Field unit={conv.from} value={left} onChange={(v) => type(v, "from")} />
        <span className="pb-2.5 font-mono text-sm text-timber">⇄</span>
        <Field unit={conv.to} value={right} onChange={(v) => type(v, "to")} />
      </div>

      <p className="mt-2.5 font-mono text-[11px] text-muted">{conv.note}</p>
    </section>
  );
}

export default function Convert() {
  return (
    <div className="max-w-lg">
      <header className="mb-7">
        <div className="plaque">Convert</div>
        <h1 className="font-display text-3xl font-black tracking-tight">The Workbench</h1>
      </header>

      {CONVERSIONS.map((c) => (
        <Converter key={c.key} conv={c} />
      ))}
    </div>
  );
}
