import { sqlite } from "./client";

// Schema version for the FTS index. Bump when the column list or the `alt`
// expression changes — ensureFts() then drops and rebuilds the index.
const FTS_VERSION = 2;

// `alt` holds squashed variants of name/brand (spaces, hyphens and apostrophes
// stripped) so "sunrice" finds the brand "Sun Rice" and vice versa. OFF spells
// the same brand both ways, so without this half the products are unreachable.
const ALT_SQL = (t: string) => `
  replace(replace(replace(lower(${t}.name), ' ', ''), '-', ''), '''', '') || ' ' ||
  replace(replace(replace(lower(coalesce(${t}.brand, '')), ' ', ''), '-', ''), '''', '')
`;

// Regular (not external-content) FTS5 table: `alt` is derived, so it has no
// column to read back from foods. Kept in sync by triggers.
export function ensureFts() {
  const version = (
    sqlite.query("PRAGMA user_version").get() as { user_version: number }
  ).user_version;
  const exists = sqlite
    .query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='foods_fts'")
    .get();

  if (exists && version >= FTS_VERSION) return;
  if (exists) dropFts();

  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS foods_fts USING fts5(
      name, brand, alt,
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER IF NOT EXISTS foods_ai AFTER INSERT ON foods BEGIN
      INSERT INTO foods_fts(rowid, name, brand, alt)
      VALUES (new.id, new.name, new.brand, ${ALT_SQL("new")});
    END;

    CREATE TRIGGER IF NOT EXISTS foods_ad AFTER DELETE ON foods BEGIN
      DELETE FROM foods_fts WHERE rowid = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS foods_au AFTER UPDATE OF name, brand ON foods BEGIN
      DELETE FROM foods_fts WHERE rowid = old.id;
      INSERT INTO foods_fts(rowid, name, brand, alt)
      VALUES (new.id, new.name, new.brand, ${ALT_SQL("new")});
    END;
  `);
  rebuildFts();
  sqlite.exec(`PRAGMA user_version = ${FTS_VERSION}`);
}

function dropFts() {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS foods_ai;
    DROP TRIGGER IF EXISTS foods_ad;
    DROP TRIGGER IF EXISTS foods_au;
    DROP TABLE IF EXISTS foods_fts;
  `);
}

export function rebuildFts() {
  sqlite.exec(`
    DELETE FROM foods_fts;
    INSERT INTO foods_fts(rowid, name, brand, alt)
      SELECT f.id, f.name, f.brand, ${ALT_SQL("f")} FROM foods f WHERE f.is_deleted = 0;
  `);
}
