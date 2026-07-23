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

AI photo estimation lives in `src/server/services/vision.ts` +
`src/server/services/ai/` (pluggable `openai-compatible`/`anthropic` adapters,
plain `fetch`, no SDK). Config is in the `settings` table (`ai_*` keys) and
editable via the Settings page / `GET|PUT /api/ai/config`; the API key also
falls back to the `AI_API_KEY` env var and is never returned in GETs. It's off
by default (`ai_enabled=false`). Endpoints: `/api/ai/estimate`, `/api/ai/config`,
`/api/ai/test`; MCP mirror: `estimate_food_from_photo`. See `docs/AI-PHOTO.md`.

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
