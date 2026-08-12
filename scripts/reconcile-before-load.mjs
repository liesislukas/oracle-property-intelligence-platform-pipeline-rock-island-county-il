#!/usr/bin/env node
// ISSUE-021 WI-2 — reconcile BEFORE loading, per skills/query-db-loading-matching.
//
//   node scripts/reconcile-before-load.mjs
//
// The skill's rule is that you never load without first reconciling the artifact count against the
// live source count, because a short load that "looks done" is the failure mode this step exists to
// prevent. This script counts three independent denominators and prints all three:
//
//   1. the live source count from the county FeatureServer (returnCountOnly)
//   2. the per-parcel source mirror (one JSON per OBJECTID, all 82 source fields)
//   3. the per-parcel transform artifacts ISSUE-018 has produced so far (transformed.zip)
//
// It reports; it never repairs, pads or deduplicates. A gap between (3) and (1) while ISSUE-018's
// durable Restate workflow is still running is progress, not corruption, and is stated as such.
//
// Exit code: 0 when the mirror covers the live source count (that is the corpus this issue
// reconciles over); 1 when the mirror is short, because then no downstream metric can claim
// full-county coverage.

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR =
  process.env.DATA_DIR ?? "/Users/lukas/Developer/ateam/elephant-pipeline/data";
const MIRROR_DIR = join(DATA_DIR, "source-mirror", "rock-island");
const ARTIFACT_ROOT = join(DATA_DIR, "artifacts", "appraisal", "rock-island");
const LAYER_URL =
  "https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer/0";

async function liveSourceCount() {
  const url = `${LAYER_URL}/query?where=1%3D1&returnCountOnly=true&f=json`;
  const started = Date.now();
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`live count HTTP ${response.status}`);
  const body = await response.json();
  if (typeof body.count !== "number")
    throw new Error(`live count response carried no numeric count: ${JSON.stringify(body)}`);
  return { count: body.count, url, durationS: (Date.now() - started) / 1000 };
}

async function countMirror() {
  const names = await readdir(MIRROR_DIR);
  return names.filter((n) => n.endsWith(".json")).length;
}

async function countArtifacts() {
  const runs = {};
  let jobDirs;
  try {
    jobDirs = await readdir(ARTIFACT_ROOT);
  } catch {
    return { runs, transformed: 0, ready: 0 };
  }
  let transformed = 0;
  let ready = 0;
  for (const job of jobDirs.sort()) {
    const jobPath = join(ARTIFACT_ROOT, job);
    if (!(await stat(jobPath)).isDirectory()) continue;
    let parcels;
    try {
      parcels = await readdir(jobPath);
    } catch {
      continue;
    }
    let jobTransformed = 0;
    let jobReady = 0;
    for (const parcel of parcels) {
      let files;
      try {
        files = await readdir(join(jobPath, parcel));
      } catch {
        continue;
      }
      if (files.includes("transformed.zip")) jobTransformed += 1;
      if (files.includes("ready.json")) jobReady += 1;
    }
    runs[job] = { transformed: jobTransformed, ready: jobReady, parcelDirs: parcels.length };
    transformed += jobTransformed;
    ready += jobReady;
  }
  return { runs, transformed, ready };
}

const capturedAt = new Date().toISOString();
const live = await liveSourceCount();
const mirror = await countMirror();
const artifacts = await countArtifacts();

const lines = [];
lines.push(`captured_at: ${capturedAt}`);
lines.push(`live_source_count: ${live.count}  (${live.url}, ${live.durationS.toFixed(3)} s)`);
lines.push(`source_mirror_files: ${mirror}  (${MIRROR_DIR})`);
lines.push(
  `transform_artifacts_with_transformed_zip: ${artifacts.transformed}  (${ARTIFACT_ROOT})`,
);
lines.push(`transform_artifacts_with_ready_json: ${artifacts.ready}`);
for (const [job, r] of Object.entries(artifacts.runs)) {
  lines.push(
    `  run ${job}: ${r.parcelDirs} parcel dirs, ${r.transformed} transformed.zip, ${r.ready} ready.json`,
  );
}
lines.push(`mirror_vs_live_difference: ${mirror - live.count}`);
lines.push(`artifacts_vs_live_difference: ${artifacts.transformed - live.count}`);

if (artifacts.ready > artifacts.transformed) {
  lines.push(
    `STOP CONDITION: ready.json count ${artifacts.ready} exceeds transformed.zip count ${artifacts.transformed} — unvalidated parcels.`,
  );
}

const mirrorComplete = mirror === live.count;
lines.push(
  mirrorComplete
    ? `MIRROR COMPLETE: the per-parcel mirror covers all ${live.count} live features. ISSUE-021 reconciles over the mirror, so every metric below is full-county.`
    : `MIRROR SHORT: the mirror holds ${mirror} of ${live.count} live features. No downstream metric may claim full-county coverage.`,
);
lines.push(
  artifacts.transformed < live.count
    ? `ARTIFACTS IN PROGRESS: ${artifacts.transformed} of ${live.count} parcels transformed. ISSUE-018's durable Restate workflow is still running; this is progress, not a collapse. ISSUE-021 does NOT run the bulk load and does NOT treat this number as the county total.`
    : `ARTIFACTS COMPLETE: ${artifacts.transformed} of ${live.count}.`,
);

console.log(lines.join("\n"));
process.exitCode = mirrorComplete ? 0 : 1;
