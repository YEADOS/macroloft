import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db } from "../src/server/db/client";
import { ensureFts } from "../src/server/db/fts";

migrate(db, { migrationsFolder: "./drizzle" });
ensureFts();
console.log("migrations applied, fts ensured");
