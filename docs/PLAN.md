# MacroLoft — Project Plan

A self-hosted nutrition tracker (MyFitnessPal core, minus the bloat) with first-class
MCP integration so Claude can read and write everything the UI can. Runs as a single
Docker container on the home server, reached from anywhere via Tailscale.

## Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Food data | AFCD + Open Food Facts (AU subset) | Official Australian generic foods with full micronutrients + branded supermarket products with barcodes. Both free and re-importable. |
| Auth | None — Tailscale-only | Single user, tailnet is the trust boundary. Same model as the Hevy setup. Easy to bolt on later. |
| Barcode scanning | Yes | Phone camera in the browser. Requires HTTPS → served via `tailscale serve` (see ARCHITECTURE.md). |
| Weight tracking | Full weigh-in log | Daily entries, trend/moving average, goal weight + rate, tied into calorie targets. |
| Runtime | Bun | Native TS, built-in SQLite driver, fast, one small Docker image. |
| Server | Hono | Tiny, Bun-native, easy to mount both REST API and the MCP endpoint. |
| Database | SQLite + Drizzle ORM | Single-user, read-heavy, one-file backup. FTS5 for food search. Drizzle gives typed schema + migrations. |
| Frontend | React 19 + Vite + TypeScript | Mature ecosystem for charts (Recharts) and barcode scanning. Tailwind v4 with custom industrial design tokens. |

## Core features

1. **MCP integration** — Streamable HTTP MCP endpoint at `/mcp` on the same server.
   Every capability below is exposed as a tool. See MCP-TOOLS.md.
2. **Diary / macro tracking** — log foods per day into meal slots (breakfast, lunch,
   dinner, snacks). Live totals for calories + macros + key micros vs targets.
3. **Food database** — ~1,900 AFCD generic foods (full micronutrient panels) +
   Australian Open Food Facts products (branded, barcoded). Full-text search with
   sane ranking (recently/frequently used first). Manual custom foods for gaps.
4. **Quick macros** — enter just protein / carbs / fat (+ optional label); calories
   auto-computed via Atwater factors (4/4/9).
5. **Saved meals** — named combinations of ingredients with per-item quantities;
   log a whole meal in one action, optionally scaled.
6. **Goals** — calorie target, macro targets (grams or %), goal weight + weekly rate.
   Goals are dated so history stays accurate when targets change.
7. **Weight log** — daily weigh-ins, 7-day moving average trend, progress vs goal.
8. **Insights** — daily/weekly/monthly and custom-range summaries: average intake,
   adherence to targets, macro split, weight trend overlay, streaks.
9. **Barcode scan** — scan a supermarket product in the mobile browser, match by
   barcode against the OFF data, log it.

## Explicit non-goals (for now)

- Multi-user accounts, social features, public internet exposure.
- Exercise/activity tracking (that lives in Hevy).
- Native mobile app — the web UI is mobile-first and installable (PWA manifest).
- Automatic calorie-target adjustment algorithms (targets are manual; insights inform).

## Build phases

1. **Scaffold** — repo layout, Bun + Hono + Drizzle, schema + migrations, Docker
   image with a `/data` volume, health check.
2. **Food data pipeline** — AFCD xlsx import, OFF AU import, FTS5 index, refresh
   scripts. Verify search quality on real queries ("chicken breast", "Coles yoghurt").
3. **Core API** — foods/search, diary CRUD, quick entries, meals, goals, weigh-ins,
   day + range summaries.
4. **MCP server** — mount the tool surface over the same service layer as the REST
   API (one source of truth, two transports).
5. **Frontend** — day/diary view, search + log flow, barcode scan, meals manager,
   goals, weight, insights dashboard.
6. **Polish** — industrial theme pass (UI-THEME.md), PWA manifest, `tailscale serve`
   setup docs, backup notes.

Each phase should end runnable. MCP (phase 4) lands before the frontend on purpose —
the API gets exercised through Claude before any UI exists.
