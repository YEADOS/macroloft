// Import Australian products from the Open Food Facts parquet export.
// Requires the duckdb CLI and data/sources/off/food.parquet (downloaded from
// hf.co/datasets/openfoodfacts/product-database). Idempotent upsert on
// (source='off', source_id=code); preserves usage_count / last_used_at.
import { existsSync } from "node:fs";
import { sqlite } from "../src/server/db/client";
import { ensureFts } from "../src/server/db/fts";
import { round1 } from "../src/shared/nutrition";

const PARQUET = process.argv[2] ?? "data/sources/off/food.parquet";
const JSONL = "data/sources/off/au.jsonl";
const DUCKDB = process.env.DUCKDB ?? "duckdb";

if (!existsSync(PARQUET)) {
  console.error(
    `${PARQUET} not found — download it first:\n` +
      `curl -L -o ${PARQUET} 'https://huggingface.co/datasets/openfoodfacts/product-database/resolve/main/food.parquet'`,
  );
  process.exit(1);
}

const n100 = (name: string) =>
  `list_filter(nutriments, x -> x.name = '${name}')[1]."100g"`;

const query = `
COPY (
  SELECT
    code,
    coalesce(
      list_filter(product_name, x -> x.lang = 'en')[1].text,
      list_filter(product_name, x -> x.lang = 'main')[1].text,
      product_name[1].text
    ) AS name,
    brands,
    serving_size,
    ${n100("energy-kcal")} AS kcal,
    ${n100("energy")} AS kj,
    ${n100("proteins")} AS protein,
    ${n100("fat")} AS fat,
    ${n100("saturated-fat")} AS sat_fat,
    ${n100("carbohydrates")} AS carbs,
    ${n100("sugars")} AS sugars,
    ${n100("fiber")} AS fibre,
    ${n100("sodium")} AS sodium_g,
    ${n100("salt")} AS salt_g
  FROM '${PARQUET}'
  WHERE list_contains(countries_tags, 'en:australia')
    AND obsolete = false
) TO '${JSONL}' (FORMAT JSON, ARRAY false);
`;

console.log("extracting AU products with duckdb…");
const proc = Bun.spawnSync([DUCKDB, "-c", query]);
if (proc.exitCode !== 0) {
  console.error(proc.stderr.toString());
  process.exit(1);
}

interface Row {
  code: string;
  name: string | null;
  brands: string | null;
  serving_size: string | null;
  kcal: number | null;
  kj: number | null;
  protein: number | null;
  fat: number | null;
  sat_fat: number | null;
  carbs: number | null;
  sugars: number | null;
  fibre: number | null;
  sodium_g: number | null;
  salt_g: number | null;
}

ensureFts();
const upsert = sqlite.prepare(`
  INSERT INTO foods (source, source_id, barcode, name, brand, energy_kj, energy_kcal,
    protein_g, fat_g, sat_fat_g, carbs_g, sugars_g, fibre_g, sodium_mg,
    created_at, updated_at)
  VALUES ('off', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source, source_id) DO UPDATE SET
    barcode=excluded.barcode, name=excluded.name, brand=excluded.brand,
    energy_kj=excluded.energy_kj, energy_kcal=excluded.energy_kcal,
    protein_g=excluded.protein_g, fat_g=excluded.fat_g, sat_fat_g=excluded.sat_fat_g,
    carbs_g=excluded.carbs_g, sugars_g=excluded.sugars_g, fibre_g=excluded.fibre_g,
    sodium_mg=excluded.sodium_mg, updated_at=excluded.updated_at
`);
const insertServing = sqlite.prepare(`
  INSERT INTO food_servings (food_id, name, grams)
  SELECT id, ?, ? FROM foods WHERE source='off' AND source_id = ?
    AND NOT EXISTS (
      SELECT 1 FROM food_servings s JOIN foods f ON s.food_id = f.id
      WHERE f.source='off' AND f.source_id = ? AND s.name = ?
    )
`);

const text = await Bun.file(JSONL).text();
let imported = 0;
let skipped = 0;
const now = Date.now();

sqlite.exec("BEGIN");
for (const line of text.split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line) as Row;
  const kcal = r.kcal ?? (r.kj !== null ? round1(r.kj / 4.184) : null);
  if (!r.code || !r.name?.trim() || kcal === null || r.protein === null || r.fat === null || r.carbs === null) {
    skipped++;
    continue;
  }
  const sodiumMg =
    r.sodium_g !== null
      ? round1(r.sodium_g * 1000)
      : r.salt_g !== null
        ? round1((r.salt_g / 2.5) * 1000)
        : null;
  upsert.run(
    r.code,
    r.code,
    r.name.trim().slice(0, 200),
    r.brands?.trim().slice(0, 100) || null,
    r.kj,
    kcal,
    r.protein,
    r.fat,
    r.sat_fat,
    r.carbs,
    r.sugars,
    r.fibre,
    sodiumMg,
    now,
    now,
  );
  // "30 g", "2 biscuits (25g)", "250ml" → grams (ml ≈ g approximation)
  const m = r.serving_size?.match(/([\d.]+)\s*(g|ml)\b/i);
  if (m) {
    const grams = Number(m[1]);
    if (grams > 0 && grams <= 2000) {
      const label = `1 serving (${r.serving_size!.trim().slice(0, 40)})`;
      insertServing.run(label, grams, r.code, r.code, label);
    }
  }
  imported++;
}
sqlite.exec("COMMIT");

console.log(`off import: ${imported} products upserted, ${skipped} skipped (incomplete data)`);
