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
  mealLogId: string | null;
  quantityG: number | null;
  label: string | null;
  foodName: string | null;
  brand: string | null;
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
  totals: Totals;
  slotTotals: Record<Slot, Totals>;
  goals: Goals | null;
  remaining: { energyKcal: number; proteinG: number | null; carbsG: number | null; fatG: number | null } | null;
}
export interface MealSummary {
  id: number;
  name: string;
  notes: string | null;
  items: { id: number; foodId: number; foodName: string; quantityG: number }[];
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

export interface AiConfig {
  enabled: boolean;
  provider: "openai-compatible" | "anthropic";
  baseUrl: string;
  model: string;
  timeoutMs: number;
  hasKey: boolean;
  keyFromEnv: boolean;
}
/** Draft food from a photo — mirrors the server's per-100g CreateFoodInput. */
export interface FoodEstimate {
  food: {
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
    servings?: { name: string; grams: number }[];
  };
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
      http<RecentFood[]>(`/foods/recent?limit=20${slot ? `&slot=${slot}` : ""}`),
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
}) => http<{ entry: Entry; day: Day }>("/diary/entries", { method: "POST", body: JSON.stringify(input) });

export const apiLogQuick = (input: {
  proteinG: number;
  carbsG: number;
  fatG: number;
  energyKcal?: number;
  label?: string;
  slot: Slot;
  date?: string;
}) => http<{ entry: Entry; day: Day }>("/diary/quick", { method: "POST", body: JSON.stringify(input) });

export const apiLogMeal = (input: { mealId: number; slot: Slot; date?: string; scale?: number }) =>
  http<{ entries: Entry[]; day: Day }>("/diary/meal", { method: "POST", body: JSON.stringify(input) });

export const apiUpdateEntry = (id: number, patch: object) =>
  http<{ entry: Entry; day: Day }>(`/diary/entries/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const apiDeleteEntry = (id: number) =>
  http<void>(`/diary/entries/${id}`, { method: "DELETE" });

export const apiCreateFood = (input: object) =>
  http<Food>("/foods", { method: "POST", body: JSON.stringify(input) });

export const apiBarcode = (code: string) => http<Food>(`/foods/barcode/${code}`);

export const apiAddServing = (foodId: number, input: { name: string; grams: number }) =>
  http<Food>(`/foods/${foodId}/servings`, { method: "POST", body: JSON.stringify(input) });

export const apiCreateMeal = (input: { name: string; items: { foodId: number; quantityG: number }[]; notes?: string }) =>
  http<MealSummary>("/meals", { method: "POST", body: JSON.stringify(input) });

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

export const apiEstimatePhoto = (imageBase64: string, mimeType: string) =>
  http<FoodEstimate>("/ai/estimate", {
    method: "POST",
    body: JSON.stringify({ imageBase64, mimeType }),
  });

export const apiTestAi = () => http<AiTestResult>("/ai/test", { method: "POST" });

export const apiCreateSlot = (input: { name: string; permanent?: boolean }) =>
  http<DiarySlot>("/slots", { method: "POST", body: JSON.stringify(input) });

export const apiDeleteSlot = (id: number) =>
  http<void>(`/slots/${id}`, { method: "DELETE" });
