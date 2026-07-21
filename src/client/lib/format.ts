import { addDays, format, parseISO } from "date-fns";

export const todayStr = () => format(new Date(), "yyyy-MM-dd");
export const shiftDate = (date: string, days: number) =>
  format(addDays(parseISO(date), days), "yyyy-MM-dd");
export const humanDate = (date: string) => {
  if (date === todayStr()) return "Today";
  if (date === shiftDate(todayStr(), -1)) return "Yesterday";
  if (date === shiftDate(todayStr(), 1)) return "Tomorrow";
  return format(parseISO(date), "EEE d MMM");
};
export const kcal = (n: number) => Math.round(n).toLocaleString();
export const g = (n: number) => (Math.round(n * 10) / 10).toString();

export const chartColors = () => {
  const s = getComputedStyle(document.documentElement);
  return {
    protein: s.getPropertyValue("--chart-protein").trim(),
    carbs: s.getPropertyValue("--chart-carbs").trim(),
    fat: s.getPropertyValue("--chart-fat").trim(),
    green: s.getPropertyValue("--chart-green").trim(),
    line: s.getPropertyValue("--line").trim(),
    muted: s.getPropertyValue("--text-muted").trim(),
    text: s.getPropertyValue("--text").trim(),
    surface: s.getPropertyValue("--surface").trim(),
    accent: s.getPropertyValue("--accent").trim(),
  };
};
