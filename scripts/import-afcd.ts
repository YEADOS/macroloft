// Import AFCD Release 3 "Nutrient profiles" xlsx into the foods table.
// Idempotent: upserts on (source='afcd', source_id=Public Food Key) and
// preserves usage_count / last_used_at.
import * as XLSX from "xlsx";
import { sqlite } from "../src/server/db/client";
import { ensureFts } from "../src/server/db/fts";
import { kjToKcal, round1 } from "../src/shared/nutrition";

const FILE = process.argv[2] ?? "data/sources/afcd/nutrient-profiles.xlsx";
const SHEET = "All solids & liquids per 100 g";

const wb = XLSX.readFile(FILE);
const ws = wb.Sheets[SHEET];
if (!ws) throw new Error(`sheet "${SHEET}" not found in ${FILE}`);
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

const headerIdx = rows.findIndex((r) => String(r?.[0]) === "Public Food Key");
if (headerIdx === -1) throw new Error("could not find header row (Public Food Key)");
const headers = (rows[headerIdx] as string[]).map((h) =>
  String(h).replace(/\s+/g, " ").trim(),
);

const col = (pattern: RegExp) => headers.findIndex((h) => pattern.test(h));
const cols = {
  key: col(/^Public Food Key$/),
  name: col(/^Food Name$/),
  energyKj: col(/^Energy with dietary fibre, equated \(kJ\)$/),
  protein: col(/^Protein \(g\)$/),
  fat: col(/^Fat, total \(g\)$/),
  satFat: col(/^Total saturated fatty acids, equated \(g\)$/),
  carbs: col(/^Available carbohydrate, with sugar alcohols \(g\)$/),
  carbsAlt: col(/^Available carbohydrate, without sugar alcohols \(g\)$/),
  sugars: col(/^Total sugars \(g\)$/),
  fibre: col(/^Total dietary fibre \(g\)$/),
  sodium: col(/^Sodium \(Na\) \(mg\)$/),
};
for (const [k, v] of Object.entries(cols))
  if (v === -1) throw new Error(`column not found: ${k}`);

// Every other numeric column goes into micros_json under its cleaned header.
const headlineCols = new Set(Object.values(cols));
const skipCols = new Set([col(/^Classification$/), col(/^Derivation$/)]);

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

ensureFts();
const upsert = sqlite.prepare(`
  INSERT INTO foods (source, source_id, name, energy_kj, energy_kcal,
    protein_g, fat_g, sat_fat_g, carbs_g, sugars_g, fibre_g, sodium_mg,
    micros_json, created_at, updated_at)
  VALUES ('afcd', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source, source_id) DO UPDATE SET
    name=excluded.name, energy_kj=excluded.energy_kj, energy_kcal=excluded.energy_kcal,
    protein_g=excluded.protein_g, fat_g=excluded.fat_g, sat_fat_g=excluded.sat_fat_g,
    carbs_g=excluded.carbs_g, sugars_g=excluded.sugars_g, fibre_g=excluded.fibre_g,
    sodium_mg=excluded.sodium_mg, micros_json=excluded.micros_json,
    updated_at=excluded.updated_at
`);

let imported = 0;
let skipped = 0;
const now = Date.now();

sqlite.exec("BEGIN");
for (const row of rows.slice(headerIdx + 1)) {
  const key = row[cols.key];
  const name = row[cols.name];
  const energyKj = num(row[cols.energyKj]);
  if (!key || !name || energyKj === null) {
    skipped++;
    continue;
  }
  const micros: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (headlineCols.has(i) || skipCols.has(i) || i === cols.carbsAlt) return;
    const v = num(row[i]);
    if (v !== null) micros[h] = v;
  });
  upsert.run(
    String(key),
    String(name),
    energyKj,
    round1(kjToKcal(energyKj)),
    num(row[cols.protein]) ?? 0,
    num(row[cols.fat]) ?? 0,
    num(row[cols.satFat]),
    num(row[cols.carbs]) ?? num(row[cols.carbsAlt]) ?? 0,
    num(row[cols.sugars]),
    num(row[cols.fibre]),
    num(row[cols.sodium]),
    JSON.stringify(micros),
    now,
    now,
  );
  imported++;
}
sqlite.exec("COMMIT");

console.log(`afcd import: ${imported} foods upserted, ${skipped} rows skipped`);
