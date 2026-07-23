import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  apiAddServing,
  apiBarcode,
  apiCreateFood,
  apiEstimatePhoto,
  apiLogFood,
  apiLogMeal,
  apiLogQuick,
  useAiConfig,
  useFoodSearch,
  useMeals,
  useRecentFoods,
  type Food,
  type FoodEstimate,
} from "../lib/api";
import { downscaleImage } from "../lib/image";
import { kcal, g } from "../lib/format";
import BarcodeScanner from "./BarcodeScanner";

type Tab = "search" | "quick" | "photo" | "meals" | "new";

const sourceTag = { afcd: "AFCD", off: "OFF", custom: "MINE" } as const;

function FoodRow({
  food,
  onPick,
  portionG,
}: {
  food: Food;
  onPick: (f: Food) => void;
  /** When set (recents), show this portion's energy instead of per-100g. */
  portionG?: number;
}) {
  const serving = food.servings[0];
  const scale = portionG != null ? portionG / 100 : 1;
  return (
    <button
      onClick={() => onPick(food)}
      className="flex w-full items-baseline justify-between gap-3 border-b rule py-3 text-left hover:bg-raised"
    >
      <div className="min-w-0">
        <div className="truncate text-sm">{food.name}</div>
        <div className="truncate font-mono text-[11px] text-muted">
          {food.brand ? `${food.brand} · ` : ""}
          <span className="text-timber">{sourceTag[food.source]}</span>
          {" · "}P{g(food.proteinG * scale)} C{g(food.carbsG * scale)} F{g(food.fatG * scale)}
          {portionG != null
            ? ` / ${g(portionG)}g`
            : serving
              ? ` /100g · ${serving.name}`
              : " /100g"}
        </div>
      </div>
      <div className="shrink-0 text-right font-mono text-sm">
        {kcal(food.energyKcal * scale)}
        {portionG != null && (
          <div className="text-[11px] text-muted">{g(portionG)}g</div>
        )}
      </div>
    </button>
  );
}

function QuantityPicker({
  food,
  onLog,
  onBack,
  busy,
  initialGrams,
}: {
  food: Food;
  onLog: (opts: { quantityG?: number; serving?: { name: string; count: number } }) => void;
  onBack: () => void;
  busy: boolean;
  /** Portion to pre-fill (from recents); falls back to the food's own serving. */
  initialGrams?: number;
}) {
  // Default to the product's serving when it has one — a packet's own portion
  // is nearly always what you want, and 100 g rarely is.
  const [servings, setServings] = useState(food.servings);
  const [servingIdx, setServingIdx] = useState<number>(
    initialGrams == null && food.servings.length > 0 ? 0 : -1,
  );
  const [grams, setGrams] = useState(String(initialGrams ?? 100));
  const [count, setCount] = useState("1");
  // "+ new serving" mini-form
  const [addingServing, setAddingServing] = useState(false);
  const [nsName, setNsName] = useState("");
  const [nsGrams, setNsGrams] = useState("");
  const [nsError, setNsError] = useState<string | null>(null);
  const qc = useQueryClient();
  const serving = servingIdx >= 0 ? servings[servingIdx] : undefined;
  const effectiveG = serving ? serving.grams * (Number(count) || 1) : Number(grams) || 0;
  const scale = effectiveG / 100;

  return (
    <div className="mt-4 border rule bg-surface p-4">
      <button
        onClick={onBack}
        className="-ml-1 mb-2 px-1 py-1 font-mono text-xs text-muted active:text-ink md:hover:text-ink"
      >
        ‹ Back to results
      </button>
      <div className="text-sm font-medium">{food.name}</div>
      {food.brand && <div className="font-mono text-[11px] text-muted">{food.brand}</div>}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {servings.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="plaque">Serving</span>
            <select
              value={addingServing ? -2 : servingIdx}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v === -2) return setAddingServing(true);
                setAddingServing(false);
                setServingIdx(v);
              }}
              className="max-w-[15rem] text-sm"
            >
              {servings.map((s, i) => (
                <option key={s.id} value={i}>
                  {s.name} — {g(s.grams)}g
                </option>
              ))}
              <option value={-1}>grams…</option>
              <option value={-2}>＋ new serving…</option>
            </select>
          </label>
        )}
        {servings.length === 0 && !addingServing && (
          <button
            onClick={() => setAddingServing(true)}
            className="border rule px-2.5 py-2 font-mono text-xs text-muted active:bg-raised md:hover:text-ink"
            title="Save a named portion for this food"
          >
            ＋ serving
          </button>
        )}
        {serving ? (
          <label className="flex flex-col gap-1">
            <span className="plaque">Count</span>
            <input
              type="number"
              inputMode="decimal"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="w-20 font-mono text-sm"
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="plaque">Grams</span>
            <input
              type="number"
              inputMode="decimal"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              className="w-24 font-mono text-sm"
              autoFocus
            />
          </label>
        )}
        <div className="ml-auto text-right font-mono text-xs text-muted">
          <div className="text-lg text-ink">{kcal(food.energyKcal * scale)} kcal</div>
          P{g(food.proteinG * scale)} C{g(food.carbsG * scale)} F{g(food.fatG * scale)}
        </div>
      </div>
      {addingServing && (
        <div className="mt-3 border rule bg-raised/40 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="plaque">Serving name</span>
              <input
                value={nsName}
                onChange={(e) => setNsName(e.target.value)}
                placeholder="1 rice cake"
                className="text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="plaque">Grams</span>
              <input
                type="number"
                inputMode="decimal"
                value={nsGrams}
                onChange={(e) => setNsGrams(e.target.value)}
                className="w-20 font-mono text-sm"
              />
            </label>
            <div className="flex gap-1.5">
              <button
                disabled={!nsName.trim() || !(Number(nsGrams) > 0)}
                onClick={async () => {
                  try {
                    const updated = await apiAddServing(food.id, {
                      name: nsName.trim(),
                      grams: Number(nsGrams),
                    });
                    setServings(updated.servings);
                    setServingIdx(
                      updated.servings.findIndex(
                        (s) => s.name.toLowerCase() === nsName.trim().toLowerCase(),
                      ),
                    );
                    setCount("1");
                    setAddingServing(false);
                    setNsName("");
                    setNsGrams("");
                    setNsError(null);
                    // Cached search/recent rows carry servings — refresh them.
                    for (const k of ["search", "recent", "food"])
                      qc.invalidateQueries({ queryKey: [k] });
                  } catch (e) {
                    setNsError((e as Error).message);
                  }
                }}
                className="px-4 py-2 font-display text-xs font-bold uppercase tracking-wider disabled:opacity-40"
                style={{ background: "var(--accent)", color: "#181614" }}
              >
                Save
              </button>
              <button
                onClick={() => { setAddingServing(false); setNsError(null); }}
                className="border rule px-3 py-2 font-mono text-xs text-muted"
              >
                Cancel
              </button>
            </div>
          </div>
          {nsError && (
            <div className="mt-2 font-mono text-xs" style={{ color: "var(--accent-2)" }}>
              {nsError}
            </div>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {serving
          ? ["0.5", "1", "1.5", "2", "3"].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`border rule px-2.5 py-1 font-mono text-xs ${
                  count === n ? "bg-raised !text-ink" : "text-muted hover:bg-raised"
                }`}
              >
                ×{n}
              </button>
            ))
          : [50, 100, 150, 200, 250].map((n) => (
              <button
                key={n}
                onClick={() => setGrams(String(n))}
                className={`border rule px-2.5 py-1 font-mono text-xs ${
                  Number(grams) === n ? "bg-raised !text-ink" : "text-muted hover:bg-raised"
                }`}
              >
                {n}g
              </button>
            ))}
        {serving && (
          <span className="self-center pl-1 font-mono text-xs text-muted">
            = {g(effectiveG)}g
          </span>
        )}
      </div>
      <button
        disabled={busy || effectiveG <= 0}
        onClick={() =>
          onLog(
            serving
              ? { serving: { name: serving.name, count: Number(count) || 1 } }
              : { quantityG: Number(grams) },
          )
        }
        className="glow mt-4 w-full py-2.5 font-display text-sm font-bold uppercase tracking-wider"
        style={{ background: "var(--accent)", color: "#181614" }}
      >
        {busy ? "Logging…" : "Log it"}
      </button>
    </div>
  );
}

export default function AddSheet({
  slot: initialSlot,
  slots,
  date,
  onDone,
  onClose,
}: {
  slot: string;
  slots: string[];
  date: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [slot, setSlot] = useState(initialSlot);
  const [tab, setTab] = useState<Tab>("search");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Food | null>(null);
  const [prefillG, setPrefillG] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Photo estimation → prefilled New Food form. aiNote drives the "AI estimate"
  // banner on the New Food tab (null = no banner).
  const [photoBusy, setPhotoBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const search = useFoodSearch(q);
  const recent = useRecentFoods();
  const meals = useMeals();
  const aiConfig = useAiConfig();
  const navigate = useNavigate();

  const pick = (f: Food, portionG?: number) => {
    setPrefillG(portionG ?? null);
    setPicked(f);
  };

  // quick tab state
  const [qp, setQp] = useState("");
  const [qc, setQc] = useState("");
  const [qf, setQf] = useState("");
  const [qlabel, setQlabel] = useState("");

  // new food tab state — macros are entered per 100 g or per serving; the DB
  // always stores per 100 g, so serving-basis inputs get converted on create.
  const [nf, setNf] = useState({
    name: "",
    brand: "",
    protein: "",
    carbs: "",
    fat: "",
    kcal: "",
    satfat: "",
    sugars: "",
    fibre: "",
    sodium: "",
    basis: "100g" as "100g" | "serving",
    servingG: "",
    itemsPer: "",
  });
  const perServing = nf.basis === "serving";
  const servingG = Number(nf.servingG) || 0;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Map a photo estimate onto the New Food form. The model returns per-100g
  // macros plus the plate's weight; we prefill in "serving" basis so the form
  // shows the photographed portion and its totals, and "Create & log 1 serving"
  // logs exactly that — no new save path, the form is the override UI.
  const applyEstimate = (est: FoodEstimate) => {
    const grams = est.food.servings?.[0]?.grams ?? 100;
    const perServing = (v?: number) =>
      v == null ? "" : String(Math.round(((v * grams) / 100) * 10) / 10);
    setNf({
      name: est.food.name ?? "",
      brand: est.food.brand ?? "",
      protein: perServing(est.food.proteinG),
      carbs: perServing(est.food.carbsG),
      fat: perServing(est.food.fatG),
      kcal: est.food.energyKcal != null ? perServing(est.food.energyKcal) : "",
      satfat: perServing(est.food.satFatG),
      sugars: perServing(est.food.sugarsG),
      fibre: perServing(est.food.fibreG),
      sodium: perServing(est.food.sodiumMg),
      basis: "serving",
      servingG: String(grams),
      itemsPer: "",
    });
    setAiNote(est.note ?? "");
    setTab("new");
  };

  const estimateFromFile = async (file: File) => {
    setPhotoBusy(true);
    setError(null);
    try {
      const { base64, mimeType } = await downscaleImage(file);
      applyEstimate(await apiEstimatePhoto(base64, mimeType));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-bg">
      <div className="mx-auto max-w-2xl px-4 py-5 pb-16">
        <div
          className="sticky top-0 z-10 -mx-4 flex items-center justify-between px-4 py-2"
          style={{ background: "color-mix(in oklab, var(--bg) 94%, transparent)", backdropFilter: "blur(8px)" }}
        >
          <div>
            <div className="plaque">Add to</div>
            <select
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              className="!border-0 !bg-transparent !p-0 font-display text-2xl font-black uppercase"
            >
              {(slots.length > 0 ? slots : [slot]).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button onClick={onClose} className="plaque -mr-2 px-2 py-3 hover:text-ink">✕ Close</button>
        </div>

        <div className="mt-2 flex gap-1 overflow-x-auto border-b rule">
          {(
            [
              ["search", "Search"],
              ["quick", "Quick macros"],
              ["photo", "Photo"],
              ["meals", "My meals"],
              ["new", "New food"],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => { setTab(t); setPicked(null); setPrefillG(null); setError(null); setAiNote(null); }}
              className={`plaque whitespace-nowrap border-b-2 px-3 py-2.5 ${
                tab === t ? "border-[var(--accent)] !text-ink" : "border-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-3 border rule p-3 font-mono text-xs" style={{ color: "var(--accent-2)" }}>
            {error}
          </div>
        )}

        {tab === "search" && (
          <div className="mt-4">
            <div className="flex gap-2">
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPicked(null); setPrefillG(null); }}
                placeholder="Search 100k+ foods…"
                className="w-full text-base"
                autoFocus
              />
              <button
                onClick={() => setScanning(true)}
                title="Scan barcode"
                className="shrink-0 border rule px-3 font-mono text-lg"
              >
                ▥
              </button>
            </div>
            {picked ? (
              <QuantityPicker
                key={picked.id}
                food={picked}
                busy={busy}
                initialGrams={prefillG ?? undefined}
                onBack={() => { setPicked(null); setPrefillG(null); }}
                onLog={(opts) => run(() => apiLogFood({ foodId: picked.id, ...opts, slot, date }))}
              />
            ) : q.trim().length >= 2 ? (
              <div className="mt-2">
                {search.data?.map((f) => (
                  <FoodRow key={f.id} food={f} onPick={pick} />
                ))}
                {search.data?.length === 0 && (
                  <div className="py-8 text-center font-mono text-sm text-muted">
                    Nothing found — try the New Food tab.
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2">
                <div className="plaque py-2">Recent</div>
                {recent.data?.map((r) => (
                  <FoodRow
                    key={r.food.id}
                    food={r.food}
                    portionG={r.lastQuantityG}
                    onPick={() => pick(r.food, r.lastQuantityG)}
                  />
                ))}
                {recent.data?.length === 0 && (
                  <div className="py-8 text-center font-mono text-sm text-muted">
                    Nothing logged here yet — search to add your first food.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "quick" && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["Protein g", qp, setQp],
                  ["Carbs g", qc, setQc],
                  ["Fat g", qf, setQf],
                ] as [string, string, (v: string) => void][]
              ).map(([label, val, set]) => (
                <label key={label} className="flex flex-col gap-1">
                  <span className="plaque">{label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    className="font-mono"
                  />
                </label>
              ))}
            </div>
            <label className="flex flex-col gap-1">
              <span className="plaque">Label (optional)</span>
              <input value={qlabel} onChange={(e) => setQlabel(e.target.value)} placeholder="pub lunch" />
            </label>
            <div className="font-mono text-sm text-muted">
              ≈ {kcal((Number(qp) || 0) * 4 + (Number(qc) || 0) * 4 + (Number(qf) || 0) * 9)} kcal
            </div>
            <button
              disabled={busy}
              onClick={() =>
                run(() =>
                  apiLogQuick({
                    proteinG: Number(qp) || 0,
                    carbsG: Number(qc) || 0,
                    fatG: Number(qf) || 0,
                    label: qlabel || undefined,
                    slot,
                    date,
                  }),
                )
              }
              className="glow w-full py-2.5 font-display text-sm font-bold uppercase tracking-wider"
              style={{ background: "var(--accent)", color: "#181614" }}
            >
              Log quick entry
            </button>
          </div>
        )}

        {tab === "photo" && (
          <div className="mt-4">
            {aiConfig.data && !aiConfig.data.enabled ? (
              <div className="border rule p-5 text-center">
                <div className="plaque mb-2">Photo estimation is off</div>
                <p className="font-mono text-xs text-muted">
                  Turn on AI photo estimation and set a provider to snap a meal and
                  auto-fill its macros.
                </p>
                <button
                  onClick={() => { onClose(); navigate("/settings"); }}
                  className="mt-4 border rule px-4 py-2 font-mono text-xs text-muted active:bg-raised md:hover:text-ink"
                >
                  Open Settings ›
                </button>
              </div>
            ) : (
              <>
                <label
                  className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rule py-12 text-center ${
                    photoBusy ? "opacity-60" : "cursor-pointer active:bg-raised md:hover:bg-raised"
                  }`}
                >
                  <span className="font-mono text-4xl" style={{ color: "var(--accent)" }}>
                    ☐
                  </span>
                  <div>
                    <div className="text-sm">{photoBusy ? "Estimating…" : "Snap a meal"}</div>
                    <div className="font-mono text-[11px] text-muted">
                      {photoBusy
                        ? "The model is reading your photo — this can take a few seconds."
                        : "Take a photo or pick one — you'll confirm the macros before saving."}
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={photoBusy}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) estimateFromFile(file);
                    }}
                  />
                </label>
                <p className="mt-3 font-mono text-[11px] text-muted">
                  Best for whole plates and packaged foods. It's an estimate — always
                  check the numbers on the next screen.
                </p>
              </>
            )}
          </div>
        )}

        {tab === "meals" && (
          <div className="mt-2">
            {meals.data?.length === 0 && (
              <div className="py-8 text-center font-mono text-sm text-muted">
                No saved meals yet — build one on the Foods page.
              </div>
            )}
            {meals.data?.map((m) => (
              <button
                key={m.id}
                disabled={busy}
                onClick={() => run(() => apiLogMeal({ mealId: m.id, slot, date }))}
                className="flex w-full items-baseline justify-between border-b rule py-3 text-left hover:bg-raised"
              >
                <div>
                  <div className="text-sm">{m.name}</div>
                  <div className="font-mono text-[11px] text-muted">
                    {m.items.length} items · P{g(m.totals.proteinG)} C{g(m.totals.carbsG)} F{g(m.totals.fatG)}
                  </div>
                </div>
                <div className="font-mono text-sm">{kcal(m.totals.energyKcal)}</div>
              </button>
            ))}
          </div>
        )}

        {tab === "new" && (
          <div className="mt-4 space-y-3">
            {aiNote !== null && (
              <div
                className="border rule p-3"
                style={{ borderColor: "var(--accent)", background: "color-mix(in oklab, var(--accent) 8%, transparent)" }}
              >
                <div className="plaque" style={{ color: "var(--accent)" }}>
                  AI estimate
                </div>
                <div className="text-sm">Check and edit the numbers before saving.</div>
                {aiNote && <div className="mt-1 font-mono text-[11px] text-muted">{aiNote}</div>}
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="plaque">Nutrients are</span>
              <div className="inline-flex border rule font-mono text-[11px]">
                {(
                  [
                    ["100g", "Per 100 g"],
                    ["serving", "Per serving"],
                  ] as const
                ).map(([b, label]) => (
                  <button
                    key={b}
                    onClick={() => setNf({ ...nf, basis: b })}
                    className={`px-3 py-1.5 ${nf.basis === b ? "bg-raised text-ink" : "text-muted"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {perServing && (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="plaque">Serving size (g)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={nf.servingG}
                    onChange={(e) => setNf({ ...nf, servingG: e.target.value })}
                    className="font-mono"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="plaque">Items per serving (optional)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={nf.itemsPer}
                    onChange={(e) => setNf({ ...nf, itemsPer: e.target.value })}
                    placeholder="e.g. 3 rice cakes"
                    className="font-mono"
                  />
                </label>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 flex flex-col gap-1">
                <span className="plaque">Name</span>
                <input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="plaque">Brand (optional)</span>
                <input value={nf.brand} onChange={(e) => setNf({ ...nf, brand: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="plaque">kcal (optional)</span>
                <input type="number" inputMode="decimal" value={nf.kcal} onChange={(e) => setNf({ ...nf, kcal: e.target.value })} className="font-mono" />
              </label>
              {(
                [
                  ["Protein g", "protein"],
                  ["Carbs g", "carbs"],
                  ["Fat g", "fat"],
                  ["Sat fat g", "satfat"],
                  ["Sugars g", "sugars"],
                  ["Fibre g", "fibre"],
                  ["Sodium mg", "sodium"],
                ] as const
              ).map(([label, key]) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="plaque">{label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={nf[key]}
                    onChange={(e) => setNf({ ...nf, [key]: e.target.value })}
                    className="font-mono"
                  />
                </label>
              ))}
            </div>
            <button
              disabled={busy || !nf.name || (perServing && servingG <= 0)}
              onClick={() =>
                run(async () => {
                  const r1 = (n: number) => Math.round(n * 10) / 10;
                  const factor = perServing ? 100 / servingG : 1;
                  const items = Math.floor(Number(nf.itemsPer)) || 0;
                  const servings = perServing
                    ? [
                        { name: "1 serving", grams: servingG },
                        ...(items >= 2 ? [{ name: "1 piece", grams: r1(servingG / items) }] : []),
                      ]
                    : undefined;
                  // Optional micros: send only when filled, scaled per 100 g
                  // by the same factor as the macros (sodium is mg, same scaling).
                  const micro = (v: string) =>
                    v ? r1(Number(v) * factor) : undefined;
                  const food = await apiCreateFood({
                    name: nf.name,
                    brand: nf.brand || undefined,
                    energyKcal: nf.kcal ? r1(Number(nf.kcal) * factor) : undefined,
                    proteinG: r1((Number(nf.protein) || 0) * factor),
                    carbsG: r1((Number(nf.carbs) || 0) * factor),
                    fatG: r1((Number(nf.fat) || 0) * factor),
                    satFatG: micro(nf.satfat),
                    sugarsG: micro(nf.sugars),
                    fibreG: micro(nf.fibre),
                    sodiumMg: micro(nf.sodium),
                    servings,
                  });
                  await apiLogFood({
                    foodId: food.id,
                    quantityG: perServing ? servingG : 100,
                    slot,
                    date,
                  });
                })
              }
              className="glow w-full py-2.5 font-display text-sm font-bold uppercase tracking-wider disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#181614" }}
            >
              {perServing ? "Create & log 1 serving" : "Create & log 100 g"}
            </button>
          </div>
        )}
      </div>

      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onScan={async (code) => {
            setScanning(false);
            try {
              const food = await apiBarcode(code);
              pick(food);
              setTab("search");
            } catch {
              setError(`Barcode ${code} not in the database — add it via New Food.`);
            }
          }}
        />
      )}
    </div>
  );
}
