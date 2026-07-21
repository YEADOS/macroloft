import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { settings } from "../db/schema";

const DEFAULTS: Record<string, string> = {
  timezone: "Australia/Sydney",
  energy_unit: "kcal",
  weight_unit: "kg",
  week_starts: "monday",
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
