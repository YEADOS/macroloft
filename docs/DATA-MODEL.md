# Data Model (SQLite via Drizzle)

All nutrient amounts on `foods` are **per 100 g**. Quantities on entries are grams.
Dates in diary/weight tables are local calendar dates stored as `YYYY-MM-DD` text.

## foods

The unified food table across all sources.

| column | type | notes |
|---|---|---|
| id | integer pk | |
| source | text | `'afcd' \| 'off' \| 'custom'` |
| source_id | text | AFCD food key / OFF code; null for custom |
| barcode | text, indexed | EAN from OFF or user-entered; nullable |
| name | text | |
| brand | text | nullable (AFCD/generic foods have none) |
| energy_kj | real | |
| energy_kcal | real | derived if source only has one |
| protein_g | real | |
| fat_g | real | |
| sat_fat_g | real | nullable |
| carbs_g | real | |
| sugars_g | real | nullable |
| fibre_g | real | nullable |
| sodium_mg | real | nullable |
| micros_json | text | JSON object of extra micronutrients (AFCD has ~250 measures; keep the long tail here, keyed by nutrient code, values per 100 g) |
| usage_count | integer default 0 | bumped on every log; drives search ranking |
| last_used_at | integer | epoch ms, search ranking |
| is_deleted | integer default 0 | soft delete for custom foods |
| created_at / updated_at | integer | |

Unique index on `(source, source_id)` so re-imports upsert instead of duplicating.

## food_servings

Named portions ("1 slice", "1 cup", "1 tub") → grams.

| column | type |
|---|---|
| id | integer pk |
| food_id | fk → foods |
| name | text |
| grams | real |

OFF provides `serving_size` for many products; AFCD has measure tables; users can
add their own. UI always allows raw grams as a fallback.

## foods_fts (FTS5 virtual table)

FTS5 over `name`, `brand`, `alt`. Kept in sync by triggers on `foods`.
Search query = FTS match ranked by: exact/prefix boost → `usage_count` /
`last_used_at` → source priority (`custom` > `afcd` > `off`) → bm25.

`alt` holds space/hyphen/apostrophe-stripped copies of name and brand, so
"sunrice" matches the brand "Sun Rice" (OFF spells the same brand both ways).
Because `alt` is derived it has no column in `foods` to read back from, so the
table is *not* external-content — it stores its own copy, and `ensureFts()`
drops/rebuilds it when `FTS_VERSION` in `src/server/db/fts.ts` is bumped.

## meals + meal_items

User-saved recipes / combos.

- `meals`: id, name, notes, created_at, updated_at, is_deleted
- `meal_items`: id, meal_id fk, food_id fk, quantity_g

Logging a meal **expands to individual diary entries** (grouped by a shared
`meal_log_id` uuid) — so editing one ingredient after logging is trivial and
history survives later edits to the saved meal.

## diary_entries

One row per logged item.

| column | type | notes |
|---|---|---|
| id | integer pk | |
| date | text `YYYY-MM-DD` | indexed |
| slot | text | `'breakfast' \| 'lunch' \| 'dinner' \| 'snacks'` |
| kind | text | `'food' \| 'quick'` |
| food_id | fk, nullable | null for quick entries |
| meal_log_id | text, nullable | groups entries logged together from a saved meal |
| quantity_g | real, nullable | null for quick entries |
| label | text, nullable | quick-entry description ("pub lunch") |
| energy_kcal | real | **snapshot** at log time |
| protein_g / carbs_g / fat_g | real | snapshot |
| sat_fat_g / sugars_g / fibre_g / sodium_mg | real, nullable | snapshot |
| logged_at | integer | epoch ms |

Snapshotting means food-DB refreshes and custom-food edits never silently rewrite
past days. Quick entries: kcal = 4·protein + 4·carbs + 9·fat (Atwater), computed
server-side; caller may override kcal explicitly (e.g. alcohol).

## goals

Dated so history renders against the targets that applied at the time.

| column | type | notes |
|---|---|---|
| id | integer pk | |
| effective_date | text `YYYY-MM-DD` | latest row ≤ date wins |
| energy_kcal | real | daily target |
| protein_g / carbs_g / fat_g | real, nullable | gram targets (UI can also show as %) |
| goal_weight_kg | real, nullable | |
| weekly_rate_kg | real, nullable | e.g. -0.5 |

## weigh_ins

| column | type |
|---|---|
| id | integer pk |
| date | text `YYYY-MM-DD`, unique |
| weight_kg | real |
| note | text, nullable |

Trend = 7-day trailing moving average, computed on read (no stored aggregates).

## settings

Key/value: `timezone` (default `Australia/Sydney`), `energy_unit` (`kcal`/`kJ`),
`weight_unit` (`kg`), `week_starts` (`monday`).

## Derived data (never stored)

Day totals, range summaries, adherence, streaks, macro splits — all computed in the
service layer from `diary_entries` + `goals` + `weigh_ins`. SQLite over one user's
rows makes this instant; storing aggregates would only create staleness bugs.
