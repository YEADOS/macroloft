# MacroLoft

Self-hosted nutrition tracker with an MCP server, Australian food data, and an
industrial-loft UI. One Bun process, one SQLite file, one Docker container.

## Quick start (dev)

```bash
bun install
bun run db:migrate          # create/upgrade data/macroloft.db
bun run import:afcd         # needs data/sources/afcd/nutrient-profiles.xlsx
bun run import:off          # needs duckdb CLI + data/sources/off/food.parquet
bun run dev                 # API + MCP on :3000
bun run dev:client          # Vite dev server on :5173 (proxies /api and /mcp)
```

Production build: `bun run build` then `bun run start` — serves the built UI,
the REST API, and MCP all on :3000.

## Docker

```bash
docker compose -f docker/compose.yml up --build -d
```

The repo `data/` dir is bind-mounted at `/data`; run imports on the host and the
container sees them immediately.

## Tailscale (required for barcode scanning)

Camera access needs HTTPS, so expose the app with tailscale serve:

```bash
tailscale serve --bg https / http://localhost:3000
```

Then open `https://<host>.<tailnet>.ts.net` from any device on the tailnet.

## MCP

```bash
claude mcp add --transport http macroloft https://<host>.<tailnet>.ts.net/mcp
# or on the same machine:
claude mcp add --transport http macroloft http://localhost:3000/mcp
```

18 tools: search/log foods, quick macros, saved meals, goals, weigh-ins, day
summaries and range insights. See `docs/MCP-TOOLS.md`.

## Food data

- **AFCD Release 3** (FSANZ): `scripts/import-afcd.ts` — 1,588 generic Australian
  foods with ~250 nutrient measures. Download the "Nutrient profiles" xlsx from
  foodstandards.gov.au into `data/sources/afcd/nutrient-profiles.xlsx`.
- **Open Food Facts** (AU subset): `scripts/import-off.ts` — branded supermarket
  products with barcodes, filtered from the OFF parquet export.
  `bun run scripts/refresh-foods.ts` re-downloads the parquet and re-imports
  (run monthly-ish). Imports are idempotent and preserve usage-based ranking.

Data attribution: AFCD © FSANZ; Open Food Facts under ODbL. Neither dataset is
redistributed here — the import scripts fetch them into the ignored `data/` dir.

## License

MIT — see [LICENSE](LICENSE). Covers this code only, not the food datasets above.
