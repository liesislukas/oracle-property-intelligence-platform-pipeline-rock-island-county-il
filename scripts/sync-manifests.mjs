#!/usr/bin/env node
// Copies every canonical stage manifest from the repo root into the Next.js app so the deployed
// build can statically import it.
//
//   node scripts/sync-manifests.mjs
//
// Why this exists: a Vercel deploy uploads only the directory it is given (`--cwd app`), so
// nothing above `app/` exists in the build container and a static import of `../data/manifests`
// cannot resolve. The canonical manifests stay at the repo root, where the pipeline stages write
// them; this script mirrors them byte-identical into `app/data/manifests/`.
//
// Board-sweep contract, 2026-08-12. Run before every deploy:
//   node scripts/sync-manifests.mjs && vercel deploy --prod --yes --cwd app ...
//
// It copies bytes and verifies them. It never edits, reformats or invents a manifest.

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(repoRoot, "data", "manifests");
const DEST = join(repoRoot, "app", "data", "manifests");

let entries;
try {
  entries = (await readdir(SRC)).filter((f) => f.endsWith(".json")).sort();
} catch {
  console.log(`no canonical manifests at ${SRC} — nothing to sync`);
  process.exit(0);
}

await mkdir(DEST, { recursive: true });

let copied = 0;
for (const name of entries) {
  const bytes = await readFile(join(SRC, name));
  await writeFile(join(DEST, name), bytes);
  const back = await readFile(join(DEST, name));
  if (!back.equals(bytes)) {
    console.error(`FAIL: ${name} differs after copy`);
    process.exit(1);
  }
  console.log(`synced ${name} (${bytes.length} bytes)`);
  copied += 1;
}
console.log(`${copied} manifest(s) synced into app/data/manifests/`);
