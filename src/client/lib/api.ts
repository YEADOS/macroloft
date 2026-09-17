import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Slot } from "@shared/nutrition";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.error ?? JSON.stringify(body);
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── types mirrored from the server ──────────────────────────────────────
export interface Serving { id: number; foodId: number; name: string; grams: number }
export interface Food {
  id: number;
  source: "afcd" | "off" | "custom";
  barcode: string | null;
  name: string;
  brand: string | null;
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  satFatG: number | null;
  sugarsG: number | null;
  fibreG: number | null;
  sodiumMg: number | null;
  microsJson: string | null;
  servings: Serving[];
}
export interface Entry {
  id: number;
  date: string;
  slot: Slot;
  kind: "food" | "quick";
  foodId: number | null;
  /** Set on every entry logged together — one saved meal, or one photo scan. */
  mealLogId: string | null;
  /** The group's name as it was when logged. */
  mealName: string | null;
  quantityG: number | null;
  label: string | null;
  foodName: string | null;
  brand: string | null;
  /** Epoch ms the entry was logged at. */
  loggedAt: number;
  /** `loggedAt` as local wall-clock "HH:MM" — used by the timeline view. */
  time: string;
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  satFatG: number | null;
  sugarsG: number | null;
  fibreG: number | null;
  sodiumMg: number | null;
}
export interface RecentFood {
  food: Food;
  lastQuantityG: number;
  timesLogged: number;
  lastUsedAt: number;
}
export interface Goals {
  energyKcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  goalWeightKg: number | null;
  weeklyRateKg: number | null;
  effectiveDate: string;
}
export interface Totals {
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  satFatG: number;
  sugarsG: number;
  fibreG: number;
  sodiumMg: number;
}
export interface DiarySlot {
  id: number;
  name: string;
  permanent: boolean;
}
export interface Day {
  date: string;
  slotList: DiarySlot[];
  slots: Record<Slot, Entry[]>;
  /** mealLogIds on this day whose scan photo can be shown. */
  photoLogIds: string[];
  totals: Totals;
  slotTotals: Record<Slot, Totals>;
  goals: Goals | null;
  remaining: { energyKcal: number; proteinG: number | null; carbsG: number | null; fatG: number | null } | null;
}
export interface MealItem {
  id: number;
  foodId: number;
  foodName: string;
  brand: string | null;
  quantityG: number;
  /** The food's nutrients per 100 g — lets the UI re-scale a line locally. */
  per100: {
    energyKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fibreG: number | null;
    sugarsG: number | null;
    sodiumMg: number | null;
  };
}
export interface MealSummary {
  id: number;
  name: string;
  notes: string | null;
  items: MealItem[];
  totals: { energyKcal: number; proteinG: number; carbsG: number; fatG: number };
}
export interface WeightHistory {
  entries: { date: string; weightKg: number; trendKg: number; note: string | null }[];
  current: number | null;
  goalWeightKg: number | null;
  deltaToGoalKg: number | null;
  changeOverRangeKg: number | null;
}
export interface Summary {
  start: string;
  end: string;
  days: { date: string; energyKcal: number; proteinG: number; carbsG: number; fatG: number; entryCount: number }[];
  loggedDays: number;
  totalDays: number;
  averages: { energyKcal: number; proteinG: number; carbsG: number; fatG: number; fibreG: number; sodiumMg: number } | null;
  targets: { energyKcal: number; proteinG: number | null; carbsG: number | null; fatG: number | null } | null;
  adherence: { avgVsTargetKcal: number; daysOverTarget: number; daysUnderTarget: number } | null;
  macroSplit: { proteinPct: number; carbsPct: number; fatPct: number } | null;
  currentStreak: number;
  weight: WeightHistory;
}

export interface PepsiStats {
  date: string;
  count: number;
  total: number;
  days: number;
  best: { date: string; count: number } | null;
  streak: number;
}

export interface AiConfig {
  enabled: boolean;
  provider: "openai-compatible" | "anthropic";
  baseUrl: string;
  model: string;
  timeoutMs: number;
  hasKey: boolean;
  keyFromEnv: boolean;
}
/**
 * One component of a photographed meal: per-100g nutrients (the server's
 * CreateFoodInput shape) plus how much of it is on the plate. count/unit/
 * unitGrams either all arrive together, with count * unitGrams === quantityG,
 * or not at all — see normalizePortion in services/vision.ts.
 */
export interface EstimateItem {
  name: string;
  brand?: string;
  energyKcal?: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  satFatG?: number;
  sugarsG?: number;
  fibreG?: number;
  sodiumMg?: number;
  /** Total grams of this component in the photo, across every piece. */
  quantityG: number;
  count?: number;
  unit?: string;
  unitGrams?: number;
  note?: string;
}
/** Itemised draft from a photo — nothing is saved until the user confirms. */
export interface MealEstimate {
  name?: string;
  items: EstimateItem[];
  note?: string;
}
export interface AiTestResult {
  ok: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  reply?: string;
  error?: string;
}

// ── hooks ───────────────────────────────────────────────────────────────
export const useDay = (date: string) =>
  useQuery({ queryKey: ["day", date], queryFn: () => http<Day>(`/diary/${date}`) });

export const useFoodSearch = (q: string) =>
  useQuery({
    queryKey: ["search", q],
    queryFn: () => http<Food[]>(`/foods/search?q=${encodeURIComponent(q)}&limit=25`),
    enabled: q.trim().length >= 2,
    placeholderData: (prev) => prev,
  });

export const useRecentFoods = (slot?: string) =>
  useQuery({
    queryKey: ["recent", slot ?? "all"],
    queryFn: () =>
      http<RecentFood[]>(`/foods/recent?limit=500${slot ? `&slot=${slot}` : ""}`),
  });

export const useFood = (id: number | null) =>
  useQuery({
    queryKey: ["food", id],
    queryFn: () => http<Food>(`/foods/${id}`),
    enabled: id !== null,
  });

export const useMeals = () =>
  useQuery({ queryKey: ["meals"], queryFn: () => http<MealSummary[]>("/meals") });

export const useGoals = () =>
  useQuery({ queryKey: ["goals"], queryFn: () => http<Goals | null>("/goals") });

export const useWeight = (start: string, end: string) =>
  useQuery({
    queryKey: ["weight", start, end],
    queryFn: () => http<WeightHistory>(`/weight?start=${start}&end=${end}`),
  });

export const useSummary = (start: string, end: string) =>
  useQuery({
    queryKey: ["summary", start, end],
    queryFn: () => http<Summary>(`/summary?start=${start}&end=${end}`),
  });

export const usePepsi = (date?: string) =>
  useQuery({
    queryKey: ["pepsi", date ?? "today"],
    queryFn: () => http<PepsiStats>(`/pepsi${date ? `?date=${date}` : ""}`),
  });

export const apiAddPepsi = (delta: number, date?: string) =>
  http<PepsiStats>("/pepsi", { method: "POST", body: JSON.stringify({ delta, date }) });

export function useInvalidatingMutation<TInput, TOut = unknown>(
  fn: (input: TInput) => Promise<TOut>,
  keys: string[][],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => keys.forEach((k) => qc.invalidateQueries({ queryKey: k })),
  });
}

export const apiLogFood = (input: {
  foodId: number;
  quantityG?: number;
  serving?: { name: string; count?: number };
  slot: Slot;
  date?: string;
  /** Draws this entry inside a group with everything sharing the id. */
  mealLogId?: string;
  mealName?: string;
  /** Local "HH:MM" to stamp the entry at; omit for right now. */
  time?: string;
}) => http<{ entry: Entry; day: Day }>("/diary/entries", { method: "POST", body: JSON.stringify(input) });

export const apiLogQuick = (input: {
  proteinG: number;
  carbsG: number;
  fatG: number;
  energyKcal?: number;
  label?: string;
  slot: Slot;
  date?: string;
  /** Local "HH:MM" to stamp the entry at; omit for right now. */
  time?: string;
}) => http<{ entry: Entry; day: Day }>("/diary/quick", { method: "POST", body: JSON.stringify(input) });

export const apiLogMeal = (input: { mealId: number; slot: Slot; date?: string; scale?: number }) =>
  http<{ entries: Entry[]; day: Day }>("/diary/meal", { method: "POST", body: JSON.stringify(input) });

export const apiUpdateEntry = (id: number, patch: object) =>
  http<{ entry: Entry; day: Day }>(`/diary/entries/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const apiDeleteEntry = (id: number) =>
  http<void>(`/diary/entries/${id}`, { method: "DELETE" });

/** Removes every entry logged together from one meal or scan, photo included. */
export const apiDeleteMealLog = (mealLogId: string) =>
  http<{ deleted: number }>(`/diary/meal-log/${mealLogId}`, { method: "DELETE" });

/** Keeps the photo behind a scan, filed under the group its items were logged as. */
export const apiSaveScanPhoto = (input: {
  mealLogId: string;
  imageBase64: string;
  mimeType: string;
  date?: string;
}) =>
  http<{ mealLogId: string; date: string; mimeType: string; bytes: number; createdAt: number }>(
    "/diary/photos",
    { method: "POST", body: JSON.stringify(input) },
  );

/** Src for a saved scan photo — served as image bytes, not JSON. */
export const scanPhotoUrl = (mealLogId: string) => `/api/diary/photos/${mealLogId}`;

export const apiCreateFood = (input: object) =>
  http<Food>("/foods", { method: "POST", body: JSON.stringify(input) });

export const apiBarcode = (code: string) => http<Food>(`/foods/barcode/${code}`);

export const apiAddServing = (foodId: number, input: { name: string; grams: number }) =>
  http<Food>(`/foods/${foodId}/servings`, { method: "POST", body: JSON.stringify(input) });

export const apiCreateMeal = (input: { name: string; items: { foodId: number; quantityG: number }[]; notes?: string }) =>
  http<MealSummary>("/meals", { method: "POST", body: JSON.stringify(input) });

export const apiUpdateMeal = (
  id: number,
  patch: { name?: string; items?: { foodId: number; quantityG: number }[]; notes?: string },
) => http<MealSummary>(`/meals/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const apiDeleteMeal = (id: number) => http<void>(`/meals/${id}`, { method: "DELETE" });

export const apiSetGoals = (input: object) =>
  http<Goals>("/goals", { method: "PUT", body: JSON.stringify(input) });

export const apiLogWeight = (input: { weightKg: number; date?: string; note?: string }) =>
  http<unknown>("/weight", { method: "PUT", body: JSON.stringify(input) });

// ── ai ────────────────────────────────────────────────────────────────────
export const useAiConfig = () =>
  useQuery({ queryKey: ["aiConfig"], queryFn: () => http<AiConfig>("/ai/config") });

export const apiSetAiConfig = (patch: {
  enabled?: boolean;
  provider?: "openai-compatible" | "anthropic";
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
}) => http<AiConfig>("/ai/config", { method: "PUT", body: JSON.stringify(patch) });

/** Estimate a meal from one or more photos (extra angles help the model judge scale). */
export const apiEstimatePhoto = (
  images: { base64: string; mimeType: string }[],
  description?: string,
  totalWeightG?: number,
) =>
  http<MealEstimate>("/ai/estimate", {
    method: "POST",
    body: JSON.stringify({
      images: images.map((i) => ({ imageBase64: i.base64, mimeType: i.mimeType })),
      description: description || undefined,
      totalWeightG: totalWeightG && totalWeightG > 0 ? totalWeightG : undefined,
    }),
  });

/** Estimate a meal from a written description alone — no photo. */
export const apiEstimateText = (description: string, totalWeightG?: number) =>
  http<MealEstimate>("/ai/estimate", {
    method: "POST",
    body: JSON.stringify({
      description,
      totalWeightG: totalWeightG && totalWeightG > 0 ? totalWeightG : undefined,
    }),
  });

/** Macros read straight off a photographed nutrition panel, per 100 g. */
export interface LabelReading {
  name?: string;
  brand?: string;
  servingG?: number;
  servingsPerPack?: number;
  energyKcal?: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  satFatG?: number;
  sugarsG?: number;
  fibreG?: number;
  sodiumMg?: number;
}
export const apiReadLabel = (imageBase64: string, mimeType: string) =>
  http<LabelReading>("/ai/read-label", {
    method: "POST",
    body: JSON.stringify({ imageBase64, mimeType }),
  });

export const apiTestAi = () => http<AiTestResult>("/ai/test", { method: "POST" });

export const apiCreateSlot = (input: { name: string; permanent?: boolean }) =>
  http<DiarySlot>("/slots", { method: "POST", body: JSON.stringify(input) });

export const apiDeleteSlot = (id: number) =>
  http<void>(`/slots/${id}`, { method: "DELETE" });
