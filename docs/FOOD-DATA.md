# Food Data Pipeline

Two sources, one `foods` table, idempotent upsert imports keyed on
`(source, source_id)`.

## 1. AFCD — Australian Food Composition Database

- **What**: FSANZ's official database. ~1,900 generic foods ("Chicken, breast, lean,
  grilled"), ~250 nutrient measures each — the micronutrient backbone.
- **Where**: foodstandards.gov.au → Australian Food Composition Database release
  files (Excel). Downloaded manually or by script into `data/sources/afcd/`.
- **Import** (`scripts/import-afcd.ts`):
  - Parse the "Food Nutrient Database" xlsx (nutrient-per-100g sheet) with `xlsx`.
  - Map headline nutrients to the dedicated columns (energy kJ→kcal, protein, fat,
    sat fat, carbs *available*, sugars, fibre, sodium); everything else goes into
    `micros_json` keyed by AFCD nutrient code.
  - Import the measures/portions sheet into `food_servings` where present.
  - Upsert on `(source='afcd', source_id=food_key)`.
- **Cadence**: FSANZ releases roughly every couple of years. Re-run on new release.

## 2. Open Food Facts — Australian products

- **What**: crowd-sourced branded products with barcodes — the Coles/Woolworths/
  Aldi shelf data. Coverage for AU is decent and improving; data quality varies
  (that's what custom foods are for).
- **Where**: the OFF **Parquet export on Hugging Face**
  (`openfoodfacts/product-database`) is the practical option — filter rows where
  `countries_tags` contains `en:australia` without downloading the multi-GB CSV.
- **Import** (`scripts/import-off.ts`):
  - Use DuckDB (CLI or `duckdb` npm pkg) to query the parquet directly (it can read
    from HTTPS with range requests, or from a local download in `data/sources/off/`),
    selecting: code (barcode), product_name, brands, serving_size, and the
    `nutriments` per-100g fields (energy-kcal, proteins, fat, saturated-fat,
    carbohydrates, sugars, fiber, sodium/salt).
  - Skip rows with no name or no energy+macros (uselessly incomplete entries).
  - Normalise salt→sodium (÷2.5, g→mg) when only salt is present.
  - Parse `serving_size` ("30 g", "250 ml") into a `food_servings` row when it has
    a usable gram value.
  - Upsert on `(source='off', source_id=code)`.
- **Cadence**: `scripts/refresh-foods.ts` re-runs the OFF import; run it monthly
  (manually or a host cron). Upserts preserve `usage_count`/`last_used_at`.

## 3. Custom foods

Created via UI or MCP (`create_food`). `source='custom'`, no `source_id`. Only
custom foods are user-editable and soft-deletable; AFCD/OFF rows are read-only
(clone-to-custom is the escape hatch for fixing bad OFF data).

## Search

- FTS5 (`foods_fts`) with prefix matching on every token of name + brand + `alt`
  (the de-spaced form — see DATA-MODEL.md — so "sunrice jasmine" reaches products
  branded "Sun Rice", which are otherwise unreachable).
- Ranking: personal usage (`usage_count`) → source priority
  `custom > afcd > off` → exact name match (tiebreak within a source) → bm25.
  Source priority sits ahead of exact-match on purpose: OFF has thousands of
  branded products sharing a bare generic name ("Chicken Breast" with no brand,
  from a dozen different retailers), and letting exact-match dominate buried the
  single well-characterised AFCD row under a pile of tied anonymous duplicates.
- Results are de-duplicated on `(lower(name), lower(brand))` after ranking,
  keeping the row that carries servings. OFF holds many near-identical rows per
  product ("Jasmine Rice / Coles" ×4) and without this one product fills the list.
- Barcode lookup is a plain indexed equality query, separate from FTS.
- `recentFoods(limit, slot?)` is the other entry point: foods ordered by last
  logged, with the quantity used last time. It backs the recents list the Add
  sheet shows before you type, and the `recent_foods` MCP tool.
- Acceptance checks for phase 2: "chicken breast" surfaces the AFCD grilled/raw
  entry on top; "coles greek yoghurt" finds the branded product; a scanned
  barcode from the pantry resolves. (Verified 2026-07-20 against the real AFCD +
  OFF-AU import: 1,588 AFCD + 63,196 OFF foods.)

## Licensing notes

- AFCD: Crown copyright, CC-BY-ish reuse with attribution — fine for personal use;
  keep an attribution line in the UI footer.
- OFF: ODbL — fine for personal use; attribute likewise.
