import { asc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { diaryEntries, diarySlots, type DiarySlot } from "../db/schema";
import { DEFAULT_SLOTS } from "../../shared/nutrition";

/** Idempotent: seeds breakfast/lunch/dinner/snacks the first time slots are touched. */
function ensureDefaults() {
  const count = db.select({ n: sql<number>`count(*)` }).from(diarySlots).get()!.n;
  if (count > 0) return;
  const now = Date.now();
  db.insert(diarySlots)
    .values(DEFAULT_SLOTS.map((name, i) => ({ name, position: i, permanent: 1, createdAt: now })))
    .run();
}

export function listSlots(): DiarySlot[] {
  ensureDefaults();
  return db.select().from(diarySlots).orderBy(asc(diarySlots.position)).all();
}

/** Throws with the valid list — the error doubles as MCP/UI guidance. */
export function validateSlot(name: string): string {
  const slots = listSlots();
  const match = slots.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
  if (!match)
    throw new Error(
      `no diary section named "${name}"; sections: ${slots.map((s) => s.name).join(", ")}. Create one first with create_slot / POST /slots.`,
    );
  return match.name;
}

export function createSlot(name: string, permanent = true): DiarySlot {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("section name can't be empty");
  const slots = listSlots();
  if (slots.some((s) => s.name.toLowerCase() === trimmed.toLowerCase()))
    throw new Error(`a section named "${trimmed}" already exists`);
  const position = Math.max(...slots.map((s) => s.position)) + 1;
  return db
    .insert(diarySlots)
    .values({ name: trimmed, position, permanent: permanent ? 1 : 0, createdAt: Date.now() })
    .returning()
    .get();
}

export function updateSlot(id: number, patch: { permanent?: boolean }): DiarySlot {
  const slot = db.select().from(diarySlots).where(eq(diarySlots.id, id)).get();
  if (!slot) throw new Error(`no diary section with id ${id}`);
  return db
    .update(diarySlots)
    .set(patch.permanent !== undefined ? { permanent: patch.permanent ? 1 : 0 } : {})
    .where(eq(diarySlots.id, id))
    .returning()
    .get();
}

export function deleteSlot(id: number) {
  const slot = db.select().from(diarySlots).where(eq(diarySlots.id, id)).get();
  if (!slot) throw new Error(`no diary section with id ${id}`);
  const used = db
    .select({ n: sql<number>`count(*)` })
    .from(diaryEntries)
    .where(eq(diaryEntries.slot, slot.name))
    .get()!.n;
  if (used > 0)
    throw new Error(
      `"${slot.name}" has ${used} diary ${used === 1 ? "entry" : "entries"} — move or delete them first`,
    );
  db.delete(diarySlots).where(eq(diarySlots.id, id)).run();
}
