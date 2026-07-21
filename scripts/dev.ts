/**
 * One-command dev: API/MCP + Vite together, on ports that don't collide with
 * the container on :3000, against a scratch copy of the database.
 *
 * Overridable: API_PORT, CLIENT_PORT, DB_PATH.
 */
import { copyFileSync, existsSync } from "node:fs";

const apiPort = process.env.API_PORT ?? "3001";
const clientPort = process.env.CLIENT_PORT ?? "5174";
const dbPath = process.env.DB_PATH ?? "./data/macroloft.dev.db";

// Seed the scratch db from the real one so dev has the full food catalogue.
// Without this the server would just migrate an empty file on first start.
if (!existsSync(dbPath) && existsSync("./data/macroloft.db")) {
  copyFileSync("./data/macroloft.db", dbPath);
  console.log(`[dev] seeded ${dbPath} from ./data/macroloft.db`);
}

const env = { ...process.env, API_PORT: apiPort, CLIENT_PORT: clientPort };

const server = Bun.spawn(["bun", "run", "--hot", "src/server/index.ts"], {
  env: { ...env, PORT: apiPort, DB_PATH: dbPath },
  stdio: ["inherit", "inherit", "inherit"],
});

const client = Bun.spawn(["bunx", "vite"], {
  env,
  stdio: ["inherit", "inherit", "inherit"],
});

console.log(`[dev] api  http://localhost:${apiPort}`);
console.log(`[dev] app  http://localhost:${clientPort}`);
console.log(`[dev] db   ${dbPath}`);

// Either process dying takes the pair down, so a crash never leaves a stray
// half-running dev stack behind.
const shutdown = () => {
  server.kill();
  client.kill();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.race([server.exited, client.exited]);
shutdown();
