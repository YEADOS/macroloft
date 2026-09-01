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
  apiReadLabel,
  useAiConfig,
  useFoodSearch,
  useMeals,
  useRecentFoods,
  type Food,
  type MealEstimate,
} from "../lib/api";
import { downscaleImage } from "../lib/image";
import { kcal, g } from "../lib/format";
import BarcodeScanner from "./BarcodeScanner";
import MealBuilder from "./MealBuilder";
import PhotoReview from "./PhotoReview";

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
  // Optional log time (local "HH:MM"); empty means "now", stamped server-side.
  const [time, setTime] = useState("");
  const [tab, setTab] = useState<Tab>("search");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Food | null>(null);
  const [prefillG, setPrefillG] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  // "My meals" doubles as the meal builder — the same tab you log a saved meal
  // from is where you make a new one.
  const [buildingMeal, setBuildingMeal] = useState(false);
  const [editingMealId, setEditingMealId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Photo estimation → itemised review list on the same tab. A non-null
  // estimate replaces the capture zone with PhotoReview.
  const [photoBusy, setPhotoBusy] = useState(false);
  const [estimate, setEstimate] = useState<MealEstimate | null>(null);
  // The photo that produced `estimate`, held so it can be saved with the group
  // once the user confirms — the downscaled bytes, not the original file.
  const [photo, setPhoto] = useState<{ base64: string; mimeType: string } | null>(null);
  // Optional user hint sent with the photo — ingredients the camera can't see
  // (honey on the rice cakes), cooking method, or portion.
  const [photoHint, setPhotoHint] = useState("");
  // Optional weighed total for the whole plate — pins the sum of item weights.
  const [photoWeight, setPhotoWeight] = useState("");
  // Label scan (New food tab): the AI read fires straight off the capture, so
  // there's no held-photo state — just a spinner while it's reading.
  const [labelBusy, setLabelBusy] = useState(false);
  const search = useFoodSearch(q);
  const recent = useRecentFoods();
  const meals = useMeals();
  const editingMeal = meals.data?.find((m) => m.id === editingMealId);
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
    servingsPerPack: "",
    itemsPer: "",
    // How much of the food was actually eaten (g / mL) — what gets logged.
    // Defaults to one serving when a label is scanned; a partial pour (a third
    // of a 425 mL can) is just a smaller number here.
    hadG: "",
  });
  const perServing = nf.basis === "serving";
  const servingG = Number(nf.servingG) || 0;
  // What actually gets logged: the "I had" amount, or one serving / 100 g.
  const hadG = Number(nf.hadG) || 0;
  const logG = hadG > 0 ? hadG : perServing || servingG > 0 ? servingG || 100 : 100;

  // Switching the 100 g ⇄ serving basis rescales the entered macros so the
  // numbers on screen stay truthful for the basis now selected (needs a serving
  // size to convert; without one it's just a relabel).
  const switchBasis = (b: "100g" | "serving") =>
    setNf((prev) => {
      if (prev.basis === b) return prev;
      const s = Number(prev.servingG) || 0;
      if (s <= 0) return { ...prev, basis: b };
      const factor = b === "serving" ? s / 100 : 100 / s;
      const conv = (v: string) =>
        v === "" ? "" : String(Math.round(Number(v) * factor * 10) / 10);
      return {
        ...prev,
        basis: b,
        protein: conv(prev.protein),
        carbs: conv(prev.carbs),
        fat: conv(prev.fat),
        kcal: conv(prev.kcal),
        satfat: conv(prev.satfat),
        sugars: conv(prev.sugars),
        fibre: conv(prev.fibre),
        sodium: conv(prev.sodium),
      };
    });

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

  const estimateFromFile = async (file: File) => {
    setPhotoBusy(true);
    setError(null);
    try {
      const { base64, mimeType } = await downscaleImage(file);
      const weight = Number(photoWeight) || undefined;
      setEstimate(await apiEstimatePhoto(base64, mimeType, photoHint.trim(), weight));
      setPhoto({ base64, mimeType });
      setPhotoHint("");
      setPhotoWeight("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  };

  // Label scan: read the panel photo and spill it into the new-food form, per
  // 100 g, so the user only names it and checks the numbers before saving. Fires
  // straight off the capture — like the meal scanner, the picker itself is the
  // retake, so there's no separate "read" step. The serving size and servings
  // per pack come along too, and "I had" seeds to one serving.
  const readLabel = async (img: { base64: string; mimeType: string }) => {
    setLabelBusy(true);
    setError(null);
    try {
      const r = await apiReadLabel(img.base64, img.mimeType);
      const s = (n: number | undefined) => (n == null ? "" : String(Math.round(n * 10) / 10));
      setNf((prev) => ({
        ...prev,
        name: r.name || prev.name,
        brand: r.brand || prev.brand,
        protein: s(r.proteinG),
        carbs: s(r.carbsG),
        fat: s(r.fatG),
        kcal: s(r.energyKcal),
        satfat: s(r.satFatG),
        sugars: s(r.sugarsG),
        fibre: s(r.fibreG),
        sodium: s(r.sodiumMg),
        // Label numbers are per 100 g; keep that basis — flip the toggle to see
        // them per serving. Note the serving size, pack count, and seed "I had".
        basis: "100g",
        servingG: r.servingG != null ? String(r.servingG) : prev.servingG,
        servingsPerPack: r.servingsPerPack != null ? String(r.servingsPerPack) : prev.servingsPerPack,
        hadG: r.servingG != null ? String(r.servingG) : prev.hadG,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLabelBusy(false);
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

        <div className="mt-2 flex items-center gap-2 font-mono text-xs text-muted">
          <span className="plaque">Time</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="!py-1.5"
          />
          {time ? (
            <button
              onClick={() => setTime("")}
              className="px-2 py-2 active:text-ink md:hover:text-ink"
            >
              ✕ now
            </button>
          ) : (
            <span>defaults to now</span>
          )}
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
              onClick={() => {
                setTab(t);
                setPicked(null);
                setPrefillG(null);
                setError(null);
                setBuildingMeal(false);
                setEditingMealId(null);
              }}
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
                onLog={(opts) => run(() => apiLogFood({ foodId: picked.id, ...opts, slot, date, time: time || undefined }))}
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
                    time: time || undefined,
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
            ) : estimate ? (
              <PhotoReview
                estimate={estimate}
                photo={photo ?? undefined}
                slot={slot}
                date={date}
                onDone={onDone}
                onDiscard={() => {
                  setEstimate(null);
                  setPhoto(null);
                }}
              />
            ) : (
              <>
                <label className="mb-3 flex flex-col gap-1">
                  <span className="plaque">Description (optional)</span>
                  <textarea
                    value={photoHint}
                    onChange={(e) => setPhotoHint(e.target.value)}
                    disabled={photoBusy}
                    rows={2}
                    maxLength={500}
                    placeholder="rice cakes with a drizzle of honey"
                    className="resize-none"
                  />
                  <span className="font-mono text-[11px] text-muted">
                    Anything the camera can't show — hidden ingredients, oil or butter
                    used, or how much of it you ate.
                  </span>
                </label>
                <label className="mb-3 flex flex-col gap-1">
                  <span className="plaque">Total weight (g, optional)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={photoWeight}
                    onChange={(e) => setPhotoWeight(e.target.value)}
                    disabled={photoBusy}
                    placeholder="e.g. 320"
                    className="font-mono"
                  />
                  <span className="font-mono text-[11px] text-muted">
                    If you weighed the plate, the item weights are scaled to add up to this.
                  </span>
                </label>
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
                        : "Take a photo or pick one — you'll confirm every item before it's logged."}
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
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
                  The meal comes back split into its ingredients, each with its own
                  weight and macros. It's an estimate — check the counts and numbers
                  on the next screen.
                </p>
              </>
            )}
          </div>
        )}

        {tab === "meals" && (buildingMeal || editingMeal) && (
          <div className="mt-4">
            <MealBuilder
              key={editingMeal?.id ?? "new"}
              meal={editingMeal}
              onSaved={() => { setBuildingMeal(false); setEditingMealId(null); }}
              onCancel={() => { setBuildingMeal(false); setEditingMealId(null); }}
              onDeleted={() => setEditingMealId(null)}
            />
          </div>
        )}

        {tab === "meals" && !buildingMeal && !editingMeal && (
          <div className="mt-2">
            <div className="flex items-center justify-between gap-3 border-b rule pb-2 pt-1">
              <span className="plaque">Tap a meal to log it</span>
              <button
                onClick={() => setBuildingMeal(true)}
                className="border rule px-3 py-1.5 font-mono text-xs text-amber active:bg-raised md:hover:glow"
              >
                + new meal
              </button>
            </div>
            {meals.data?.length === 0 && (
              <div className="py-8 text-center font-mono text-sm text-muted">
                No saved meals yet — hit “+ new meal” to build one from ingredients.
              </div>
            )}
            {meals.data?.map((m) => (
              <div key={m.id} className="flex items-stretch gap-2 border-b rule">
                <button
                  disabled={busy}
                  onClick={() => run(() => apiLogMeal({ mealId: m.id, slot, date }))}
                  className="flex min-w-0 flex-1 items-baseline justify-between gap-3 py-3 text-left active:bg-raised md:hover:bg-raised"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm">{m.name}</div>
                    <div className="font-mono text-[11px] text-muted">
                      {m.items.length} items · P{g(m.totals.proteinG)} C{g(m.totals.carbsG)} F{g(m.totals.fatG)}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-sm">{kcal(m.totals.energyKcal)}</div>
                </button>
                <button
                  onClick={() => setEditingMealId(m.id)}
                  title={`Edit ${m.name}`}
                  className="shrink-0 px-3 font-mono text-xs text-muted active:bg-raised md:hover:text-ink"
                >
                  ✎
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "new" && (
          <div className="mt-4 space-y-3">
            {aiConfig.data?.enabled && (
              <label
                className={`flex items-center justify-center gap-2 border-2 border-dashed rule py-3 text-center ${
                  labelBusy ? "opacity-60" : "cursor-pointer active:bg-raised md:hover:bg-raised"
                }`}
              >
                <span className="font-mono text-lg" style={{ color: "var(--accent)" }}>
                  ☐
                </span>
                <div className="font-mono text-xs text-muted">
                  {labelBusy ? "Reading label…" : "Scan a nutrition label to auto-fill the macros"}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  disabled={labelBusy}
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setError(null);
                    try {
                      await readLabel(await downscaleImage(file));
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                />
              </label>
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
                    onClick={() => switchBasis(b)}
                    className={`px-3 py-1.5 ${nf.basis === b ? "bg-raised text-ink" : "text-muted"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {(perServing || servingG > 0) && (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="plaque">Serving size (g / mL)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={nf.servingG}
                    onChange={(e) => setNf({ ...nf, servingG: e.target.value })}
                    className="font-mono"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="plaque">Servings per pack (optional)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={nf.servingsPerPack}
                    onChange={(e) => setNf({ ...nf, servingsPerPack: e.target.value })}
                    placeholder="e.g. 3"
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
                <label className="flex flex-col gap-1">
                  <span className="plaque">I had (g / mL)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={nf.hadG}
                    onChange={(e) => setNf({ ...nf, hadG: e.target.value })}
                    placeholder={servingG > 0 ? String(servingG) : "1 serving"}
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
                  const pack = Number(nf.servingsPerPack) || 0;
                  // A known serving size gives ready-made portions to log later —
                  // one serving, one piece, the whole pack.
                  const servings =
                    servingG > 0
                      ? [
                          { name: "1 serving", grams: servingG },
                          ...(items >= 2 ? [{ name: "1 piece", grams: r1(servingG / items) }] : []),
                          ...(pack >= 2 ? [{ name: "1 pack", grams: r1(servingG * pack) }] : []),
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
                    quantityG: logG,
                    slot,
                    date,
                    time: time || undefined,
                  });
                })
              }
              className="glow w-full py-2.5 font-display text-sm font-bold uppercase tracking-wider disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#181614" }}
            >
              {`Create & log ${Math.round(logG * 10) / 10} g`}
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
