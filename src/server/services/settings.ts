import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { settings } from "../db/schema";

const DEFAULTS: Record<string, string> = {
  timezone: "Australia/Sydney",
  energy_unit: "kcal",
  weight_unit: "kg",
  week_starts: "monday",
  // AI photo estimation — off until a provider is configured in Settings.
  // ai_api_key falls back to process.env.AI_API_KEY (see services/ai/config.ts).
  ai_enabled: "false",
  ai_provider: "openai-compatible",
  ai_base_url: "",
  ai_model: "",
  ai_api_key: "",
  ai_timeout_ms: "60000",
};

export function getSetting(key: string): string {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? DEFAULTS[key] ?? "";
}

export function setSetting(key: string, value: string) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

/** Today's local calendar date (YYYY-MM-DD) in the configured timezone. */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: getSetting("timezone"),
  }).format(new Date());
}

/** An epoch-ms instant as local wall-clock "HH:MM" in the configured timezone. */
export function localTimeOfDay(epochMs: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: getSetting("timezone"),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(epochMs));
}

// The configured timezone's offset (ms) at a given instant — positive east of
// UTC — by reading that instant's wall-clock parts back and diffing. Handles
// DST because the offset is evaluated at the instant itself.
function tzOffsetMs(epochMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: getSetting("timezone"),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(epochMs));
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const hour = n("hour") % 24; // some engines render midnight as "24"
  const asUTC = Date.UTC(n("year"), n("month") - 1, n("day"), hour, n("minute"), n("second"));
  return asUTC - epochMs;
}

/**
 * Epoch ms for a local wall-clock time — a "YYYY-MM-DD" date and "HH:MM" — in
 * the configured timezone. Used to honour a time the user typed, or edited on
 * an existing entry, without ever bouncing the diary date through UTC.
 */
export function epochForLocalTime(date: string, time: string): number {
  const [Y, M, D] = date.split("-").map(Number);
  const [h, m] = time.split(":").map(Number);
  const guess = Date.UTC(Y!, M! - 1, D!, h!, m!);
  // `guess` reads those wall-clock numbers as if UTC; shift by the real offset.
  return guess - tzOffsetMs(guess);
}
