// Runs every test file in its own fresh vitest process.
//
// Vitest's fork pool reuses worker processes across test files, and memory
// (notably jsdom suites) accumulates until the process hits the V8 heap limit
// and OOMs on larger suites. Running each file in a separate process bounds peak
// memory to a single file and lets the OS reclaim it afterwards, so the whole
// suite passes reliably within the default heap size (important for CI runners).

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extraArgs = process.argv.slice(2); // e.g. "--coverage"

const testDirs = ["src/lib", "src/components"];

function findTests(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...findTests(full));
    } else if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

const files = testDirs.flatMap((d) => findTests(join(root, d))).sort();

let failed = false;
for (const file of files) {
  console.log(`\n=== Running ${file} ===`);
  try {
    execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", file, ...extraArgs], {
      stdio: "inherit",
      cwd: root,
    });
  } catch {
    failed = true;
  }
}

if (failed) {
  console.error("\nSome test files failed.");
  process.exit(1);
}
console.log("\nAll test files passed.");