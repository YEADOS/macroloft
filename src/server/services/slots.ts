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

/** Fixed anchors: custom sections slot in anywhere, but these never pass each other. */
const CORE_ORDER = ["breakfast", "lunch", "dinner"];

/**
 * Re-place a section directly before or after another one, then renumber
 * positions 0..n. The anchor is the neighbour the user sees, so a hidden
 * one-off section between them can't swallow the move.
 */
export function moveSlot(id: number, anchorId: number, where: "before" | "after"): DiarySlot[] {
  const slots = listSlots();
  const slot = slots.find((s) => s.id === id);
  if (!slot) throw new Error(`no diary section with id ${id}`);
  const anchor = slots.find((s) => s.id === anchorId);
  if (!anchor) throw new Error(`no diary section with id ${anchorId}`);
  if (slot.id === anchor.id) return slots;
  const rest = slots.filter((s) => s.id !== id);
  const at = rest.indexOf(anchor) + (where === "after" ? 1 : 0);
  const next = [...rest.slice(0, at), slot, ...rest.slice(at)];
  const core = next.map((s) => s.name).filter((n) => CORE_ORDER.includes(n));
  if (core.join() !== CORE_ORDER.filter((n) => core.includes(n)).join())
    throw new Error("breakfast, lunch and dinner keep their order — move the other sections around them instead");
  db.transaction((tx) => {
    next.forEach((s, i) =>
      tx.update(diarySlots).set({ position: i }).where(eq(diarySlots.id, s.id)).run(),
    );
  });
  return listSlots();
}

/** Name-based form for MCP: `{ after: "dinner" }` reads better than ids. */
export function moveSlotByName(name: string, to: { before?: string; after?: string }): DiarySlot[] {
  if (!to.before === !to.after)
    throw new Error('give exactly one of before or after, e.g. after: "dinner"');
  const byName = (n: string) => listSlots().find((s) => s.name === validateSlot(n))!;
  return moveSlot(byName(name).id, byName((to.before ?? to.after)!).id, to.before ? "before" : "after");
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
