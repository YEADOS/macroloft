import { and, eq, inArray, lt, notExists, sql } from "drizzle-orm";
import { db } from "../db/client";
import { diaryEntries, scanPhotos } from "../db/schema";
import { today } from "./settings";

/** Client photos arrive downscaled (1024px JPEG); this only catches abuse. */
const MAX_BYTES = 4 * 1024 * 1024;

/** Orphans older than this get swept on the next save. */
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

export interface SaveScanPhotoInput {
  /** The diary group this photo belongs to — the same id its entries carry. */
  mealLogId: string;
  imageBase64: string;
  mimeType: string;
  /** The day it was logged on — provenance; the diary finds it by group id. */
  date?: string;
}

export interface ScanPhotoMeta {
  mealLogId: string;
  date: string;
  mimeType: string;
  bytes: number;
  createdAt: number;
}

/**
 * A photo is written just before its entries are logged, so a scan the user
 * abandons at the last step can leave a row behind with nothing pointing at it.
 * Sweep those once they're a day old — young orphans might still be mid-log.
 */
function pruneOrphans() {
  db.delete(scanPhotos)
    .where(
      and(
        lt(scanPhotos.createdAt, Date.now() - ORPHAN_AGE_MS),
        notExists(
          db
            .select({ one: sql`1` })
            .from(diaryEntries)
            .where(eq(diaryEntries.mealLogId, scanPhotos.mealLogId)),
        ),
      ),
    )
    .run();
}

/**
 * Store (or replace) the photo behind one scan. Re-saving the same mealLogId
 * overwrites, so retrying a half-failed log doesn't pile up copies.
 */
export function saveScanPhoto(input: SaveScanPhotoInput): ScanPhotoMeta {
  const base64 = input.imageBase64.replace(/^data:[^;]+;base64,/, "");
  const data = Buffer.from(base64, "base64");
  if (data.length === 0) throw new Error("photo was empty or not valid base64");
  if (data.length > MAX_BYTES)
    throw new Error(
      `photo is ${Math.round(data.length / 1024)} KB; the limit is ${MAX_BYTES / 1024 / 1024} MB — downscale it first`,
    );
  pruneOrphans();
  const row = {
    mealLogId: input.mealLogId,
    date: input.date ?? today(),
    mimeType: input.mimeType,
    data,
    createdAt: Date.now(),
  };
  db.insert(scanPhotos)
    .values(row)
    .onConflictDoUpdate({ target: scanPhotos.mealLogId, set: row })
    .run();
  return {
    mealLogId: row.mealLogId,
    date: row.date,
    mimeType: row.mimeType,
    bytes: data.length,
    createdAt: row.createdAt,
  };
}

export function getScanPhoto(mealLogId: string): { mimeType: string; data: Uint8Array } | null {
  const row = db.select().from(scanPhotos).where(eq(scanPhotos.mealLogId, mealLogId)).get();
  return row ? { mimeType: row.mimeType, data: row.data } : null;
}

/**
 * Which of these groups have a photo. Asked with the group ids on a day rather
 * than by date, so a scan moved to another day takes its photo along.
 */
export function photosAmong(mealLogIds: string[]): string[] {
  if (mealLogIds.length === 0) return [];
  return db
    .select({ id: scanPhotos.mealLogId })
    .from(scanPhotos)
    .where(inArray(scanPhotos.mealLogId, mealLogIds))
    .all()
    .map((r) => r.id);
}

export function deleteScanPhoto(mealLogId: string) {
  db.delete(scanPhotos).where(eq(scanPhotos.mealLogId, mealLogId)).run();
}
