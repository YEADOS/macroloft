// Re-download the OFF parquet and re-import AU products. Run monthly-ish.
// Usage: bun run scripts/refresh-foods.ts [--skip-download]
import { $ } from "bun";

const PARQUET = "data/sources/off/food.parquet";
const URL =
  "https://huggingface.co/datasets/openfoodfacts/product-database/resolve/main/food.parquet";

if (!process.argv.includes("--skip-download")) {
  console.log("downloading latest OFF parquet…");
  await $`curl -fL --progress-bar -o ${PARQUET}.tmp ${URL}`;
  await $`mv ${PARQUET}.tmp ${PARQUET}`;
}

await $`bun run scripts/import-off.ts`;
console.log("refresh complete");
