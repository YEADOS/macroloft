import { useEffect, useState } from "react";
import { apiSetGoals, useGoals } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { kcalFromMacros } from "@shared/nutrition";

export default function Goals() {
  const { data } = useGoals();
  const qc = useQueryClient();
  const [form, setForm] = useState({ kcal: "", protein: "", carbs: "", fat: "", weight: "", rate: "" });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The stored rate is signed; the form holds its magnitude plus a direction.
  const [dir, setDir] = useState<"lose" | "gain">("lose");

  useEffect(() => {
    if (data) {
      setDir((data.weeklyRateKg ?? 0) > 0 ? "gain" : "lose");
      setForm({
        kcal: String(data.energyKcal ?? ""),
        protein: data.proteinG?.toString() ?? "",
        carbs: data.carbsG?.toString() ?? "",
        fat: data.fatG?.toString() ?? "",
        weight: data.goalWeightKg?.toString() ?? "",
        rate: data.weeklyRateKg == null ? "" : Math.abs(data.weeklyRateKg).toString(),
      });
    }
  }, [data]);

  const macroKcal =
    form.protein || form.carbs || form.fat
      ? kcalFromMacros(Number(form.protein) || 0, Number(form.carbs) || 0, Number(form.fat) || 0)
      : null;

  const field = (label: string, key: keyof typeof form, placeholder = "") => (
    <label className="flex flex-col gap-1">
      <span className="plaque">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => { setForm({ ...form, [key]: e.target.value }); setSaved(false); }}
        className="font-mono"
      />
    </label>
  );

  return (
    <div className="max-w-lg">
      <header className="mb-6">
        <div className="plaque">Targets</div>
        <h1 className="font-display text-3xl font-black tracking-tight">The Blueprint</h1>
      </header>

      <div className="space-y-5">
        <section className="border-b rule pb-5">
          <h2 className="plaque mb-3">Energy & macros · daily</h2>
          <div className="grid grid-cols-2 gap-3">
            {field("Calories (kcal)", "kcal")}
            {field("Protein (g)", "protein", "optional")}
            {field("Carbs (g)", "carbs", "optional")}
            {field("Fat (g)", "fat", "optional")}
          </div>
          {macroKcal !== null && (
            <div className="mt-2 font-mono text-xs text-muted">
              macros add up to ≈ {Math.round(macroKcal)} kcal
              {form.kcal && Math.abs(macroKcal - Number(form.kcal)) > 100 && (
                <span style={{ color: "var(--accent-2)" }}> — {Math.round(macroKcal - Number(form.kcal))} off your calorie target</span>
              )}
            </div>
          )}
        </section>

        <section className="border-b rule pb-5">
          <h2 className="plaque mb-3">Weight</h2>
          <div className="grid grid-cols-2 gap-3">
            {field("Goal weight (kg)", "weight", "optional")}
            <div className="flex flex-col gap-1">
              <span className="plaque">Rate (kg/week)</span>
              {/* Direction is a toggle, not a minus sign: the mobile decimal
                  keypad has no "−", so a negative rate was untypable there. */}
              <div className="flex gap-1">
                {(["lose", "gain"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => { setDir(d); setSaved(false); }}
                    className={`border rule px-2.5 py-1.5 font-mono text-xs ${
                      dir === d ? "bg-raised !text-ink" : "text-muted hover:bg-raised"
                    }`}
                  >
                    {d === "lose" ? "− lose" : "+ gain"}
                  </button>
                ))}
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={form.rate}
                  placeholder="0.5"
                  onChange={(e) => { setForm({ ...form, rate: e.target.value }); setSaved(false); }}
                  className="w-full font-mono"
                />
              </div>
              {Number(form.rate) > 0 && (
                <span className="font-mono text-[11px] text-muted">
                  {dir === "lose" ? "−" : "+"}
                  {form.rate} kg/week
                </span>
              )}
            </div>
          </div>
        </section>

        {error && <div className="font-mono text-xs" style={{ color: "var(--accent-2)" }}>{error}</div>}

        <button
          disabled={!Number(form.kcal)}
          onClick={async () => {
            setError(null);
            try {
              await apiSetGoals({
                energyKcal: Number(form.kcal),
                proteinG: form.protein ? Number(form.protein) : undefined,
                carbsG: form.carbs ? Number(form.carbs) : undefined,
                fatG: form.fat ? Number(form.fat) : undefined,
                goalWeightKg: form.weight ? Number(form.weight) : undefined,
                weeklyRateKg: form.rate
                  ? Math.abs(Number(form.rate)) * (dir === "lose" ? -1 : 1)
                  : undefined,
              });
              setSaved(true);
              qc.invalidateQueries();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
          className="glow w-full py-2.5 font-display text-sm font-bold uppercase tracking-wider disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#181614" }}
        >
          {saved ? "Saved ✓" : "Set targets from today"}
        </button>
        <p className="font-mono text-[11px] text-muted">
          Targets apply from today forward — past days keep the targets that were
          active at the time.
        </p>
      </div>
    </div>
  );
}
