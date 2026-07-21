# MCP Tool Surface

Mounted at `/mcp` (Streamable HTTP, stateless). Tools are thin zod-validated
wrappers over the same service layer the REST API uses. Every tool that takes a
`date` accepts `YYYY-MM-DD` and defaults to today (server timezone).

Design intent: Claude should be able to run the entire app conversationally —
"log 150 g of the chicken breast I usually have, and how am I tracking this week?"
must be a two-tool exchange, not a scavenger hunt. Descriptions therefore say when
to use each tool, and search results include ids ready to pass to `log_food`.

## Foods

| tool | input | behaviour |
|---|---|---|
| `search_foods` | query, limit=10 | FTS search, same ranking as UI. Returns id, name, brand, per-100g macros, servings. |
| `recent_foods` | limit=20, slot? | Most recently logged foods, newest first, with the quantity used last time and how often logged. The "the usual" / "same as yesterday" tool — gives food id + typical portion in one call. |
| `get_food` | id or barcode | Full detail incl. micros and servings. |
| `create_food` | name, per-100g nutrients, optional brand/barcode/servings | Creates a custom food. |
| `add_serving` | food_id, name, grams | Adds a named serving to any food, AFCD/OFF included (servings are user data; only nutrient rows are read-only). Duplicate names rejected. |

## Diary

| tool | input | behaviour |
|---|---|---|
| `log_food` | food_id, quantity_g (or serving name + count), slot, date? | Snapshots nutrients, bumps usage stats. |
| `log_quick` | protein_g, carbs_g, fat_g, label?, kcal?, slot, date? | kcal auto-computed (4/4/9) unless given. |
| `log_meal` | meal_id, scale=1, slot, date? | Expands the saved meal into entries sharing a `meal_log_id`. |
| `update_entry` | entry_id, fields | Change quantity/slot/date; nutrients re-snapshot on quantity change. |
| `delete_entry` | entry_id | |
| `get_day` | date? | All entries grouped by slot (each with its resolved `foodName`/`brand`) + `slotList` (ordered sections) + per-slot totals + day totals + active targets + remaining. |
| `list_slots` | — | The diary's sections in display order, with the `permanent` flag. |
| `create_slot` | name, permanent=true | New diary section; permanent shows every day, one-off only on days it's used. |

`slot` everywhere is a section name matched case-insensitively against the
`diary_slots` table (defaults: breakfast, lunch, dinner, snacks). Unknown names
are rejected with the valid list in the error message.

## Meals

| tool | input |
|---|---|
| `list_meals` | — (returns names, ids, computed totals) |
| `create_meal` | name, items: [{food_id, quantity_g}], notes? |
| `update_meal` / `delete_meal` | meal_id, … |

## Goals & weight

| tool | input |
|---|---|
| `get_goals` | date? — the targets active on that date |
| `set_goals` | energy_kcal?, protein_g?, carbs_g?, fat_g?, goal_weight_kg?, weekly_rate_kg?, effective_date? |
| `log_weight` | weight_kg, date?, note? — upserts (one weigh-in per day) |
| `get_weight_history` | start, end — entries + 7-day trend + delta vs goal |

## Insights

| tool | input | behaviour |
|---|---|---|
| `get_summary` | start, end (or `period`: 'week'/'month'/'30d') | Per-day totals + averages, adherence vs targets, macro split, logging streak, weight change over the range. This is the "how am I tracking this month" tool. |

## Notes

- No auth on the endpoint (tailnet boundary). If a token is ever added it applies
  here via the same middleware as `/api`.
- Mutating tools return the created/updated object plus fresh day totals, so
  Claude can confirm ("that puts you at 1,840 / 2,200 kcal") without a second call.
- Errors are descriptive strings ("no food with id 91834; did you mean …") — the
  consumer is a model, so error text is UX.
