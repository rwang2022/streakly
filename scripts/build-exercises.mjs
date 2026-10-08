// Regenerates src/data/exercises.json from Free Exercise DB
// (https://github.com/yuhonas/free-exercise-db, Unlicense / public domain).
//
//   node scripts/build-exercises.mjs path/to/free-exercise-db/dist/exercises.json
//
// Keeps only what the workout logger needs (name, equipment, main muscle)
// and drops stretches, which nobody logs as weighted sets. Images and
// instructions are left out to keep the bundle small.
import { readFileSync, writeFileSync } from "node:fs";

const [, , source] = process.argv;
if (!source) {
  console.error("usage: node scripts/build-exercises.mjs <exercises.json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(source, "utf8"));
const out = raw
  .filter((e) => e.category !== "stretching")
  .map((e) => ({
    id: e.id,
    name: e.name,
    equipment: e.equipment ?? null,
    muscle: e.primaryMuscles?.[0] ?? null,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  new URL("../src/data/exercises.json", import.meta.url),
  JSON.stringify(out) + "\n"
);
console.log(`wrote ${out.length} exercises`);
