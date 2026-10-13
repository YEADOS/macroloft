// One consistent snapshot of the live SQLite DB. `VACUUM INTO` reads through
// the WAL, so it's safe to run against the DB the container is actively serving
// (a plain `cp` can capture a torn file). Keeps the most recent KEEP snapshots.
import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const DB_PATH = process.env.DB_PATH ?? "./data/macroloft.db";
const OUT_DIR = process.env.BACKUP_DIR ?? "./data/backups";
const KEEP = Number(process.env.BACKUP_KEEP ?? 14);

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = join(OUT_DIR, `macroloft-${stamp}.db`);

mkdirSync(OUT_DIR, { recursive: true });

const db = new Database(DB_PATH, { readonly: true });
// VACUUM INTO wants a path with no existing file; stamp makes it unique.
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
db.close();

const size = (statSync(out).size / 1e6).toFixed(1);
console.log(`backup → ${out} (${size} MB)`);

// Prune: keep the newest KEEP snapshots.
const snaps = readdirSync(OUT_DIR)
  .filter((f) => f.startsWith("macroloft-") && f.endsWith(".db"))
  .sort();
for (const f of snaps.slice(0, Math.max(0, snaps.length - KEEP))) {
  unlinkSync(join(OUT_DIR, f));
  console.log(`pruned ${f}`);
}
