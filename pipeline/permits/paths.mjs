// Shared path + constant resolution for the permit ingest scripts.
//
// Every path is resolved from `import.meta.url`, never from `process.cwd()`, so the scripts behave
// identically however they are invoked.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** <repo>/pipeline/permits/ */
const here = path.dirname(fileURLToPath(import.meta.url));

/** <repo> */
export const repoRoot = path.resolve(here, "..", "..");

export const COUNTY_SLUG = "rock-island";
export const JURISDICTION = "rock-island";
export const JOB_ID = "rock-island-city-permits-v1";

export const INDEX_URL = "https://rigov.org/1276/Permit-Reports";
export const ORIGIN = "https://rigov.org";
export const USER_AGENT =
  "oracle-pipeline-rock-island/1.0 (+source discovery; contact mbgerbora@gmail.com)";

export const jobDir = path.join(
  repoRoot,
  "data",
  "artifacts",
  "permits",
  COUNTY_SLUG,
  JOB_ID,
);

export const dirs = {
  permitLists: path.join(jobDir, "permit-lists"),
  raw: path.join(jobDir, "raw"),
  extracted: path.join(jobDir, "extracted"),
  status: path.join(jobDir, "status"),
};

export const files = {
  inventory: path.join(dirs.permitLists, "inventory.json"),
  linkage: path.join(jobDir, "linkage.json"),
  coverage: path.join(jobDir, "coverage.json"),
  parcelKeyIndex: path.join(jobDir, "parcel-key-index.json"),
  manifest: path.join(repoRoot, "data", "manifests", "permits.json"),
};

export async function ensureDirs(...keys) {
  for (const key of keys) {
    await mkdir(dirs[key], { recursive: true });
  }
}

/** Stable, human-diffable JSON with a trailing newline. */
export function toJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
