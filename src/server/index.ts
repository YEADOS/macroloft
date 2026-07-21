import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { StreamableHTTPTransport } from "@hono/mcp";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db } from "./db/client";
import { ensureFts } from "./db/fts";
import { api } from "./api";
import { buildMcpServer } from "./mcp";

migrate(db, { migrationsFolder: "./drizzle" });
ensureFts();

const app = new Hono();
app.use(logger());

app.get("/healthz", (c) => c.json({ ok: true }));
app.route("/api", api);

app.all("/mcp", async (c) => {
  const server = buildMcpServer();
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return transport.handleRequest(c);
});

// Built frontend (production). In dev, Vite serves the client and proxies here.
app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

const port = Number(process.env.PORT ?? 3000);
console.log(`macroloft listening on :${port}`);

export default { port, fetch: app.fetch, idleTimeout: 120 };
