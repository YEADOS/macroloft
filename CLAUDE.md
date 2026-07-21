# MacroLoft

Self-hosted, single-user nutrition tracker (MyFitnessPal core) with an MCP server
so Claude can log food and pull insights. Runs as one Docker container on the home
server, accessed over Tailscale. Australian food data (AFCD + Open Food Facts).

## Status

Implemented and working: schema + migrations, AFCD + OFF imports, full REST API,
MCP server (19 tools at `/mcp`), React frontend (diary, foods/meals, insights,
weight, targets), tests (`bun test`), Docker. `docs/PLAN.md` holds the locked
decisions; the other docs are the spec:

- `docs/ARCHITECTURE.md` — stack, container shape, Tailscale/HTTPS, MCP transport, repo layout
- `docs/DATA-MODEL.md` — SQLite schema (Drizzle)
- `docs/FOOD-DATA.md` — AFCD + OFF import pipeline and search ranking
- `docs/MCP-TOOLS.md` — the MCP tool surface
- `docs/UI-THEME.md` — the industrial-loft design system (tokens, type, layout)

## Stack (locked)

Bun · Hono · SQLite + Drizzle · React 19 + Vite + TypeScript · Tailwind v4 ·
`@modelcontextprotocol/sdk` (Streamable HTTP at `/mcp`) · Docker.

## Commands (once scaffolded)

```bash
bun install
bun run dev            # API + MCP on :3000 (hot reload)
bun run dev:client     # Vite dev server on :5173, proxies /api + /mcp
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
