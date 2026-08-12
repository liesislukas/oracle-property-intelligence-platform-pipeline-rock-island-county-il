#!/usr/bin/env node
// Conformance check for the stage manifests at data/manifests/. ISSUE-028.
//
//   node scripts/validate-manifests.mjs
//
// The contract it enforces is written out in docs/manifest-schema.md, and it is the shape the
// deployed run summary reads through app/src/lib/stageManifests.ts. The rule that matters most is
// the one a validator can only half-check: `record_count` is null when a source was not counted,
// never 0. A 0 here would be rendered as a real measurement of zero records.
//
// A manifest whose `sources` array is empty is NOT an error — that is a stage that has not run, and
// the page states it as such. No network access, no writes.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const DIR = join(repoRoot, "data", "manifests");

// The six pipeline stages. The FILENAME is the stage id; the `stage` field inside is a free-form
// label the stage wrote about itself (seed.json records "county-seed-data").
const STAGE_FILES = [
  "seed.json",
  "property-ingest.json",
  "permits.json",
  "geo-signals.json",
  "reconciliation.json",
  "publish.json",
];

const isNonEmptyString = (v) => typeof v === "string" && v.trim() !== "";
const isStringOrNull = (v) => v === null || isNonEmptyString(v);
const isDateOrNull = (v) =>
  v === null || (isNonEmptyString(v) && !Number.isNaN(new Date(v).getTime()));
const isNumberOrNull = (v) =>
  v === null || (typeof v === "number" && Number.isFinite(v));
const isStringArray = (v) =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

function checkSource(source, index, fail) {
  const at = `sources[${index}]`;
  if (typeof source !== "object" || source === null) {
    fail(`${at} is not an object`);
    return;
  }
  if (!isNonEmptyString(source.id)) fail(`${at}.id must be a non-empty string`);
  if (!isNonEmptyString(source.name))
    fail(`${at}.name must be a non-empty string`);
  if (!isStringOrNull(source.url))
    fail(`${at}.url must be a non-empty string or null — never ""`);
  if (!isStringOrNull(source.licence))
    fail(`${at}.licence must be a non-empty string or null — never ""`);
  if (!isDateOrNull(source.retrieved_at))
    fail(`${at}.retrieved_at must be an ISO-8601 timestamp or null`);
  if (!isNumberOrNull(source.record_count) || (source.record_count ?? 0) < 0)
    fail(
      `${at}.record_count must be a non-negative number or null (null = not counted, never 0)`,
    );
  if (
    source.bbox_count !== undefined &&
    (!isNumberOrNull(source.bbox_count) || (source.bbox_count ?? 0) < 0)
  )
    fail(`${at}.bbox_count must be a non-negative number or null`);
  if (!isNumberOrNull(source.duration_s) || (source.duration_s ?? 0) < 0)
    fail(`${at}.duration_s must be a non-negative number or null`);
  if (!isNonEmptyString(source.decision))
    fail(`${at}.decision must be a non-empty string`);
  if (!isStringArray(source.gaps)) fail(`${at}.gaps must be an array of strings`);
  if (!isStringArray(source.notes))
    fail(`${at}.notes must be an array of strings`);
}

function checkManifest(name, text) {
  const reasons = [];
  const fail = (r) => reasons.push(r);

  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    return [`does not parse as JSON — ${error.message}`];
  }

  if (typeof manifest !== "object" || manifest === null)
    return ["is not a JSON object"];
  if (!isNonEmptyString(manifest.stage))
    fail("stage must be a non-empty string label");
  if (
    manifest.county_slug !== undefined &&
    manifest.county_slug !== "rock-island"
  )
    fail(`county_slug must be "rock-island" when present`);

  const run = manifest.run;
  if (typeof run !== "object" || run === null) {
    fail("run must be an object with started_at and finished_at");
  } else {
    if (!isDateOrNull(run.started_at))
      fail("run.started_at must be an ISO-8601 timestamp or null");
    if (!isDateOrNull(run.finished_at))
      fail("run.finished_at must be an ISO-8601 timestamp or null");
    if (
      isNonEmptyString(run.started_at) &&
      isNonEmptyString(run.finished_at) &&
      new Date(run.finished_at) < new Date(run.started_at)
    )
      fail("run.finished_at is before run.started_at");
  }

  if (!Array.isArray(manifest.sources)) {
    fail("sources must be an array ([] for a stage that has not run)");
  } else {
    manifest.sources.forEach((source, i) => checkSource(source, i, fail));
  }

  return reasons;
}

let present = 0;
let failed = 0;

let onDisk = [];
try {
  onDisk = readdirSync(DIR);
} catch {
  console.log(`no manifests directory at ${DIR} — nothing to validate`);
  process.exit(0);
}

for (const name of STAGE_FILES) {
  if (!onDisk.includes(name)) {
    console.log(`SKIP ${name} — not yet written`);
    continue;
  }
  present += 1;
  const reasons = checkManifest(name, readFileSync(join(DIR, name), "utf8"));
  if (reasons.length > 0) {
    failed += 1;
    for (const reason of reasons) console.log(`FAIL ${name} — ${reason}`);
  } else {
    const manifest = JSON.parse(readFileSync(join(DIR, name), "utf8"));
    const count = manifest.sources.length;
    console.log(
      count === 0
        ? `OK   ${name} — 0 sources (stage has not run; stated as not run, never as zero records)`
        : `OK   ${name} — ${count} source(s)`,
    );
  }
}

const unknown = onDisk
  .filter((n) => n.endsWith(".json") && !STAGE_FILES.includes(n))
  .sort();
for (const name of unknown) {
  console.log(`NOTE ${name} — not one of the six stage manifests; not checked`);
}

console.log(
  `${present} manifest(s) checked, ${failed} failed, ${STAGE_FILES.length - present} not yet written`,
);
process.exitCode = failed > 0 ? 1 : 0;
