# MacroLoft

Self-hosted, single-user nutrition tracker (MyFitnessPal core) with an MCP server
so Claude can log food and pull insights. Runs as one Docker container on the home
server, accessed over Tailscale. Australian food data (AFCD + Open Food Facts).

## Status

Implemented and working: schema + migrations, AFCD + OFF imports, full REST API,
MCP server (23 tools at `/mcp`), React frontend (diary, foods/meals, insights,
weight, targets, settings), AI photo macro estimation, tests (`bun test`),
Docker. `docs/PLAN.md` holds the locked decisions; the other docs are the spec:

- `docs/ARCHITECTURE.md` — stack, container shape, Tailscale/HTTPS, MCP transport, repo layout
- `docs/DATA-MODEL.md` — SQLite schema (Drizzle)
- `docs/FOOD-DATA.md` — AFCD + OFF import pipeline and search ranking
- `docs/MCP-TOOLS.md` — the MCP tool surface
- `docs/AI-PHOTO.md` — pluggable-LLM photo→macros feature (provider adapters, config, prompt)
- `docs/UI-THEME.md` — the industrial-loft design system (tokens, type, layout)

## Stack (locked)

Bun · Hono · SQLite + Drizzle · React 19 + Vite + TypeScript · Tailwind v4 ·
`@modelcontextprotocol/sdk` (Streamable HTTP at `/mcp`) · Docker.

## Commands (once scaffolded)

```bash
bun install
bun run dev            # everything: API/MCP on :3001 + Vite on :5174, against
                       # data/macroloft.dev.db (seeded from the real db on first
                       # run) so it never collides with the container on :3000.
                       # Override with API_PORT / CLIENT_PORT / DB_PATH.
bun run dev:server     # API + MCP alone on :3000 (hot reload)
bun run dev:client     # Vite dev server alone on :5173, proxies /api + /mcp
bun run build          # build frontend to dist/
bun run db:generate    # drizzle-kit generate migrations from schema
bun run db:migrate     # apply migrations + ensure FTS
bun run import:afcd    # needs data/sources/afcd/nutrient-profiles.xlsx
bun run import:off     # needs duckdb CLI + data/sources/off/food.parquet
bun run scripts/refresh-foods.ts   # re-download OFF parquet + re-import
bun test
docker compose -f docker/compose.yml up --build
```

Keep this list truthful as scripts are added — update it in the same change.

Gotchas: the FTS virtual table + triggers live in `src/server/db/fts.ts`
(`ensureFts()`), not in Drizzle migrations — bump `FTS_VERSION` there when the
index shape changes and it rebuilds itself on next start. Chart series colors in
`styles.css`/`docs/UI-THEME.md` are validator-approved — don't tweak by eye.
Barcode scanning needs HTTPS — served at `https://<host>.<tailnet>.ts.net` via
`tailscale serve --bg http://localhost:3000` (already configured on the server;
it's tailscaled state, not repo config, so rebuilds don't touch it). The pre-1.98
form with an explicit `https /` mount point now hard-errors.

Saved meals are built *and edited* in one place: `MealBuilder.tsx`, reached from
the Foods page (tap a saved meal to edit it), the add sheet's "My meals" tab
(`+ new meal`, or ✎ per row), and a diary selection ("Select → meal" → tick
logged rows → Create meal, which seeds ingredients from the entries via
`itemFromEntry`; on desktop shift-click a row to start or extend a selection).
Passing a `meal` prop switches it to edit mode (PATCH + delete) — `getMeal`
returns each item's per-100g macros so the editor can re-scale lines locally. Its rows use the diary's own column grammar — the shared
`MacroTable.tsx` primitives (`MacroHeader`/`MacroCells`/`SlotTotals`) — so
per-ingredient and total macros read the same as a diary section. A logged meal
stays visible as a unit in the diary: entries are grouped by `meal_log_id` and
labelled with the `meal_name` snapshot, drawn as an indented timber-ruled block
whose rows are still individually editable. `meal_log_id` is the general
"logged together" key, not a meals-only field — `logFood` takes it, so a photo
scan groups through the same `MealGroup` block (see below). Note "new food" (add sheet) is a
different thing: a custom food you type macros for, not
a combo of existing ones.

The Pepsi Max counter is a tally, not food: `pepsi_days` holds one row per day
with a can (`services/pepsi.ts`, `GET|POST /api/pepsi`), zero-energy so it never
touches diary nutrient math, and an emptied day deletes its row so "days with a
can" stays honest. `components/PepsiCounter.tsx` has both faces — `PepsiRail`
under the desktop nav links, `PepsiShelf` (mobile-only) under the diary's day
gauge, where today's cans line up on a timber rule. Both count against the
client-local date, like diary entries. The can PNG in `client/public/` is cut
out of an Open Food Facts product photo (CC BY-SA).

The unit converter (`pages/Convert.tsx`, `/convert`, kJ↔kcal · lb↔kg · in↔mm)
deliberately has **no mobile tab** — the bottom bar is already full at six — so
it's reached from the desktop rail's secondary links and a row at the top of
Settings. Pairs are declared in `lib/convert.ts` (`CONVERSIONS`); adding one is
a table entry, not a new form.

AI photo estimation is **itemized**: one photo comes back as one row per
component (chicken breast 100 g, avocado 65 g, 2 wraps, mayo 15 g), each with
per-100g macros and `quantityG` = the total on the plate. Countable components
also carry `count`/`unit`/`unitGrams` — `normalizePortion()` guarantees all
three are present with `count * unitGrams === quantityG`, or none are, which is
what lets the UI say "AI counted 2 × wrap at 60 g each" instead of leaving you
to guess whether to hit ×2. `PhotoReview.tsx` is the confirm screen; logging
loops `POST /foods` + `POST /diary/entries` per item — no new save path.

One scan lands as **one group**: PhotoReview mints a `mealLogId` and sends it
with every item (`mealName` = the estimate's name, or "Photo scan"), so the four
components of a slice of cake read as one block in the diary instead of four
loose rows. The photo itself is kept — `scan_photos` holds one row per group
(`services/photos.ts`, `POST /api/diary/photos`, `GET /api/diary/photos/:mealLogId`
serving raw image bytes), written after the entries land so a failed upload never
costs you the log. `getDay` returns `photoLogIds` so `MealGroup` can offer a
▸ photo toggle; deleting the group — or its last remaining row — deletes the
photo, and orphans from an abandoned scan are swept after a day. Photos are
stored as the client already downscaled them (1024 px JPEG, ~4 MB hard cap).

The service lives in `src/server/services/vision.ts` +
`src/server/services/ai/` (pluggable `openai-compatible`/`anthropic` adapters,
plain `fetch`, no SDK). Config is in the `settings` table (`ai_*` keys) and
editable via the Settings page / `GET|PUT /api/ai/config`; the API key also
falls back to the `AI_API_KEY` env var and is never returned in GETs. It's off
by default (`ai_enabled=false`). Endpoints: `/api/ai/estimate` (optionally takes a
weighed `totalWeightG` for the whole plate — the item weights are scaled to sum to
it), `/api/ai/read-label` (reads macros straight off a photographed nutrition panel,
per 100 g, plus the serving size and servings-per-pack, to seed a new custom food
— reached from the New food tab's label dropzone, which fires the model straight
off the capture like the meal scanner, no separate "read" step. The form's
100 g ⇄ serving toggle rescales the entered macros by the serving size, so the
panel fills both bases; an "I had (g/mL)" field logs a partial serving, e.g. a
third of a 425 mL can), `/api/ai/config`, `/api/ai/test`; MCP mirror: `estimate_food_from_photo`
(with `total_weight_g`). See `docs/AI-PHOTO.md`.

## Rules

- REST routes and MCP tools are **thin wrappers over `src/server/services/`** —
  business logic lives only in services. If a feature needs logic in a route
  handler or tool definition, it's in the wrong place.
- Diary dates are local `YYYY-MM-DD` strings; never route diary logic through UTC
  conversions. Timezone comes from the settings table (default Australia/Sydney).
- Food nutrients are per 100 g; diary entries snapshot computed nutrients at log
  time. Never "fix" history by recomputing old entries from current food rows.
- AFCD/OFF food rows are read-only; imports must upsert on `(source, source_id)`
  and preserve `usage_count` / `last_used_at`.
- No auth by design (tailnet is the boundary) — don't add login scaffolding.
- UI work must follow `docs/UI-THEME.md` tokens/type — no default component-library
  styling, no gradient/glassmorphism drift. Dark theme is the default; both themes
  must stay styled.
- MCP tool descriptions and error messages are UX for a model consumer — keep them
  specific and actionable.
