# Architecture

## Shape

One Docker container, one Bun process, one SQLite file.

```
┌─────────────────────────────── Docker container ───────────────────────────────┐
│  Bun + Hono server (port 3000)                                                 │
│    ├── /api/*      REST API (JSON)            ┐                                │
│    ├── /mcp        MCP (Streamable HTTP)      ├── shared service layer         │
│    └── /*          static frontend (Vite build) ┘        │                     │
│                                                          ▼                     │
│                                              Drizzle ORM → SQLite (/data/)     │
└────────────────────────────────────────────────────────────────────────────────┘
         ▲
         │ tailscale serve → https://<host>.<tailnet>.ts.net
         │
   phone / laptop / Claude (anywhere on the tailnet)
```

- The REST API and MCP tools call the **same service-layer functions**
  (`src/server/services/`). Neither transport contains business logic.
- SQLite lives on a mounted volume (`/data/macroloft.db`) so the container is
  disposable. Backup = copy one file (use `sqlite3 .backup` or litestream later).

## Networking / Tailscale

- Container binds `0.0.0.0:3000`, published only on the host.
- `tailscale serve --bg https / http://localhost:3000` on the host exposes it at
  `https://<host>.<tailnet>.ts.net` with a valid cert.
- **HTTPS is required**, not optional: barcode scanning uses `getUserMedia`, which
  browsers only allow in secure contexts. This is the whole reason for
  `tailscale serve` rather than raw `http://<ip>:3000`.
- No auth in the app itself; the tailnet is the boundary. If that ever changes,
  add a bearer token checked by one Hono middleware (covers `/api` and `/mcp`).

## MCP transport

- `@modelcontextprotocol/sdk` with the **Streamable HTTP** transport, mounted at
  `/mcp` in the same Hono app. Stateless mode (no session store) — every tool call
  hits the service layer directly.
- Connect from Claude Code:
  `claude mcp add --transport http macroloft https://<host>.<tailnet>.ts.net/mcp`
- This mirrors the Hevy setup in spirit (local, private) but uses HTTP instead of
  stdio because the server already runs as a long-lived container — no reason to
  spawn a subprocess per client.

## Repo layout

```
macroloft/
├── CLAUDE.md
├── docs/                  # these planning docs
├── docker/                # Dockerfile, compose.yml
├── data/                  # gitignored; sqlite db + downloaded source datasets
├── scripts/               # import-afcd.ts, import-off.ts, refresh-foods.ts
├── drizzle/               # generated migrations
└── src/
    ├── server/
    │   ├── index.ts       # Hono app: api + mcp + static
    │   ├── db/            # drizzle schema, client, fts helpers
    │   ├── services/      # foods, diary, meals, goals, weight, insights
    │   ├── api/           # REST route handlers (thin)
    │   └── mcp/           # tool definitions (thin, zod schemas)
    ├── shared/            # types + nutrition math shared client/server
    └── client/            # React app (Vite root)
```

## Key libraries

| Concern | Library | Notes |
|---|---|---|
| HTTP server | `hono` | Also serves the built frontend |
| ORM / migrations | `drizzle-orm` + `drizzle-kit` | `bun:sqlite` driver |
| MCP | `@modelcontextprotocol/sdk` | Streamable HTTP, zod tool schemas |
| Validation | `zod` | Shared between API and MCP tool inputs |
| Client state | `@tanstack/react-query` | Server cache; no global state lib needed |
| Routing | `react-router` | Handful of routes |
| Charts | `recharts` | Insights + weight trend |
| Barcode | `@zxing/browser` | EAN-13/EAN-8 via camera |
| Styling | `tailwindcss` v4 | Design tokens from UI-THEME.md |
| Dates | `date-fns` | Diary is keyed by local calendar date (`YYYY-MM-DD`) |

## Conventions that matter

- **Diary dates are local calendar dates**, stored as `YYYY-MM-DD` text. The server
  never converts through UTC for diary logic; "today" is decided by the configured
  timezone (settings table, default `Australia/Sydney`).
- **All nutrients stored per 100 g** on foods; entry rows snapshot computed values
  at log time (see DATA-MODEL.md) so re-importing the food DB never rewrites history.
- **Energy is stored in kJ and kcal** — AFCD is kJ-native, the UI defaults to kcal.
