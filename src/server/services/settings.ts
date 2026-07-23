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
